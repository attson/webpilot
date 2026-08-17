import {
  PROTOCOL_VERSION,
  ClientToServerSchema,
  ServerToClientSchema,
  type AbortSession,
  type ClientToServer,
  type Exec,
  type Hello,
  type ReadSidepanelState,
  type Result,
  type ServerToClient,
  type StartChatSession
} from "@atwebpilot/shared/protocol";
import { buildHello } from "./coordinator-hello";
import {
  GRACEFUL_CLOSE_CODE,
  INITIAL_RECONNECT_STATE,
  nextReconnect,
  wake,
  type ReconnectState
} from "@atwebpilot/shared/pairing";

const HEARTBEAT_ALARM = "atwebpilot-coordinator-heartbeat";

export type ClientStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CoordinatorClientOptions {
  ws_url: string;
  token?: string;
  worker_id: string;
  savedToolsProvider: () => Promise<Hello["saved_tools"]>;
  labelsProvider: () => Promise<string[]>;
  onExec?: (exec: Exec) => Promise<Result>;
  onChat?: (
    msg: StartChatSession | AbortSession,
    send: (m: ClientToServer) => void
  ) => Promise<void>;
  onReadState?: (
    msg: ReadSidepanelState,
    send: (m: ClientToServer) => void
  ) => Promise<void>;
  onStatusChange?: (s: ClientStatus) => void;
  /** Fired once when this client stops retrying — the pool surfaces it as dormant. */
  onDormant?: () => void;
  /** Fired when the server reports a session bound a tab (Plan 33). */
  onSessionOpened?: (msg: { session_id: string; tab_id: string }) => void;
}

function randomNonce(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class CoordinatorClient {
  private ws: WebSocket | null = null;
  private _status: ClientStatus = "disconnected";
  private reconnect: ReconnectState = INITIAL_RECONNECT_STATE;
  /** When the next attempt is due; the alarm must not jump the queue. */
  private nextAttemptAt = 0;
  private alarmListener: ((alarm: { name: string }) => void) | null = null;
  private intentionallyClosed = false;

  constructor(private opts: CoordinatorClientOptions) {}

  get status(): ClientStatus {
    return this._status;
  }

  get reconnectState(): ReconnectState {
    return this.reconnect;
  }

  /** Re-arms a dormant client: manual reconnect, re-pairing, browser restart. */
  wakeUp(): void {
    if (this.reconnect.status !== "dormant") return;
    this.reconnect = wake(this.reconnect);
    this.nextAttemptAt = 0;
    if (!this.intentionallyClosed) void this.connect();
  }

  private setStatus(s: ClientStatus): void {
    this._status = s;
    this.opts.onStatusChange?.(s);
  }

  async connect(): Promise<void> {
    this.intentionallyClosed = false;
    this.setStatus("connecting");
    const protocols = this.opts.token
      ? [`bearer.${this.opts.token}`, `proto.${PROTOCOL_VERSION}`]
      : [`proto.${PROTOCOL_VERSION}`];
    this.ws = new WebSocket(this.opts.ws_url, protocols);
    this.ws.onopen = () => this.handleOpen();
    this.ws.onclose = (ev) => this.handleClose(ev as CloseEvent | undefined);
    this.ws.onerror = () => this.setStatus("error");
    this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    this.installAlarm();
  }

  async disconnect(): Promise<void> {
    this.intentionallyClosed = true;
    this.uninstallAlarm();
    this.ws?.close();
    this.ws = null;
    this.setStatus("disconnected");
  }

  private async handleOpen(): Promise<void> {
    try {
      const saved_tools = await this.opts.savedToolsProvider();
      const labels = await this.opts.labelsProvider();
      const hello = await buildHello({
        worker_id: this.opts.worker_id,
        saved_tools,
        labels
      });
      this.send(hello);
    } catch (err) {
      console.error("[coordinator-client] failed to send HELLO", err);
      this.setStatus("error");
      this.ws?.close();
    }
  }

  private async handleMessage(raw: unknown): Promise<void> {
    let parsed: unknown;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      console.warn("[coordinator-client] malformed message", raw);
      return;
    }

    const result = ServerToClientSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("[coordinator-client] failed to validate server message", parsed);
      return;
    }
    const msg: ServerToClient = result.data;
    switch (msg.type) {
      case "WELCOME":
        if (msg.protocol_version !== PROTOCOL_VERSION) {
          console.error("[coordinator-client] protocol version mismatch",
            msg.protocol_version, "expected", PROTOCOL_VERSION);
          this.setStatus("error");
          this.ws?.close();
          return;
        }
        this.reconnect = nextReconnect(this.reconnect, "success");
        this.nextAttemptAt = 0;
        this.setStatus("connected");
        return;
      case "PONG":
        // Server acknowledged our PING — refresh liveness for status observers.
        this.setStatus("connected");
        return;
      case "OPEN_TAB":
        // Phase 2: ignore — tab management is a Phase 3 concern when daemon ships
        return;
      case "EXEC":
        if (!this.opts.onExec) {
          console.warn("[coordinator-client] received EXEC but no onExec configured");
          return;
        }
        try {
          const execResult = await this.opts.onExec(msg);
          this.send(execResult);
        } catch (err) {
          console.error("[coordinator-client] onExec threw", err);
        }
        return;
      case "CLOSE_SESSION":
        // Phase 2: ignore — sessions are coordinator-managed
        return;
      case "START_CHAT_SESSION":
      case "ABORT_SESSION":
        if (this.opts.onChat) {
          try {
            await this.opts.onChat(msg, (m) => this.send(m));
          } catch (err) {
            console.error("[coordinator-client] onChat threw", err);
          }
        }
        return;
      case "READ_SIDEPANEL_STATE":
        if (this.opts.onReadState) {
          try {
            await this.opts.onReadState(msg, (m) => this.send(m));
          } catch (err) {
            console.error("[coordinator-client] onReadState threw", err);
          }
        }
        return;
    }
  }

  private send(msg: unknown): void {
    if (this.ws?.readyState !== 1) return; // 1 = WebSocket.OPEN
    const r = ClientToServerSchema.safeParse(msg);
    if (!r.success) {
      console.error("[coordinator-client] outgoing message failed schema", r.error);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private handleClose(ev?: { code?: number }): void {
    if (this.intentionallyClosed) {
      this.uninstallAlarm();
      this.setStatus("disconnected");
      return;
    }

    // A deliberate server shutdown is not something to retry through. Without
    // this the endpoint would be knocked on for the rest of the browser
    // session, once per session that ever paired.
    if (ev?.code === GRACEFUL_CLOSE_CODE) {
      this.reconnect = nextReconnect(this.reconnect, "graceful-close");
      this.setStatus("disconnected");
      this.opts.onDormant?.();
      this.uninstallAlarm();
      return;
    }

    // Don't overwrite an already-set error status (e.g. protocol version mismatch
    // sets "error" then immediately closes the socket, which would fire handleClose).
    if (this._status !== "error") {
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
    // Keep the heartbeat alarm installed: setTimeout-based reconnect dies the moment
    // the MV3 service worker goes idle, so the alarm is the only thing that can wake
    // us back up to retry. installAlarm is idempotent.
    this.installAlarm();
  }

  private scheduleReconnect(): void {
    this.reconnect = nextReconnect(this.reconnect, "failure");
    if (this.reconnect.status === "dormant") {
      // Stop knocking. The trust record survives; a manual reconnect, a fresh
      // pairing, or a browser restart re-arms it through wakeUp().
      this.nextAttemptAt = Number.POSITIVE_INFINITY;
      this.opts.onDormant?.();
      this.uninstallAlarm();
      return;
    }
    this.nextAttemptAt = Date.now() + this.reconnect.delayMs;
    setTimeout(() => {
      if (this.intentionallyClosed) return;
      void this.connect();
    }, this.reconnect.delayMs);
  }

  private installAlarm(): void {
    if (!chrome.alarms || this.alarmListener) return;
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.25 }); // 15s
    this.alarmListener = (alarm) => {
      if (alarm.name !== HEARTBEAT_ALARM) return;
      if (this.intentionallyClosed) return;
      const state = this.ws?.readyState;
      if (state === 1) {
        // OPEN: heartbeat keepalive.
        this.send({
          type: "PING",
          nonce: randomNonce(),
          ts: Date.now(),
          protocol_version: PROTOCOL_VERSION
        });
        return;
      }
      if (state === 0) {
        // CONNECTING: a handshake is already in flight; wait for it.
        return;
      }
      // CLOSED / CLOSING / null — the socket is gone and setTimeout-based
      // reconnects do not survive SW sleep, so the alarm is the only thing that
      // can revive it. It must still respect the backoff and dormancy, though:
      // firing every 15s regardless is what made the exponential backoff
      // decorative.
      if (this.reconnect.status === "dormant") return;
      if (Date.now() < this.nextAttemptAt) return;
      void this.connect();
    };
    chrome.alarms.onAlarm.addListener(this.alarmListener);
  }

  private uninstallAlarm(): void {
    if (this.alarmListener) {
      chrome.alarms?.onAlarm.removeListener(this.alarmListener);
      this.alarmListener = null;
    }
    void chrome.alarms?.clear(HEARTBEAT_ALARM);
  }
}
