import { Coordinator, type Clock, type IdGen } from "@atwebpilot/coordinator";
import type { PairPayload } from "@atwebpilot/shared/pairing";
import { LoopbackWSHub } from "./loopback-ws-hub";
import { installWire } from "./wire";
import {
  loadLastPort,
  loadOrCreateIdentity,
  processInfo,
  saveLastPort,
  type ProcessInfo
} from "./identity";
import type { Deps, HubBundle } from "./handlers";

export type EnsureDeps = {
  clock: Clock;
  idGen: IdGen;
  /** Explicit ATWEBPILOT_WS_PORT override; undefined means "choose one". */
  explicitPort?: number;
  token?: string;
  identityDir?: string;
  /** Injected so tests can assert the page opens without spawning a browser. */
  openUrl?: (url: string) => void;
  processInfo?: ProcessInfo;
};

const DEFAULT_WORKER_WAIT_TIMEOUT_MS = 90_000;

/**
 * Binds the websocket port on first use rather than at startup.
 *
 * Most sessions never touch a page, and a session that binds nothing cannot
 * collide with another one. Deferring the bind is therefore both the fix for
 * port exhaustion and the reason `tools/list` stays free of side effects.
 */
export function createHubEnsurer(d: EnsureDeps): Deps & { bound(): boolean } {
  let bundle: HubBundle | null = null;
  let inflight: Promise<HubBundle> | null = null;
  let pairUrlValue: string | null = null;
  let opened = false;
  let hubIsClosed = false;
  let pendingDenial = false;
  let workerWait: {
    promise: Promise<string>;
    resolve: (workerId: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const info = d.processInfo ?? processInfo();

  function connectedWorkerId(coordinator: HubBundle["coordinator"]): string | null {
    const workers = coordinator.workers.list();
    if (workers.length === 0) return null;
    if (workers.length > 1) {
      throw new Error("检测到多个浏览器连入；v1 仅支持单 worker，请只保留一个连接");
    }
    return workers[0].id;
  }

  function finishWorkerWait(result: { workerId: string } | { error: Error }): void {
    const pending = workerWait;
    if (!pending) return;
    workerWait = null;
    clearTimeout(pending.timer);
    if ("workerId" in result) pending.resolve(result.workerId);
    else pending.reject(result.error);
  }

  function notifyWorkerReady(coordinator: HubBundle["coordinator"]): void {
    try {
      const workerId = connectedWorkerId(coordinator);
      if (workerId) finishWorkerWait({ workerId });
    } catch (error) {
      finishWorkerWait({ error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  function pairingDenied(): void {
    const error = new Error(
      "用户拒绝了浏览器配对授权。" +
        (pairUrlValue ? `配对页：${pairUrlValue}` : "")
    );
    if (workerWait) finishWorkerWait({ error });
    else pendingDenial = true;
  }

  function hubClosed(): void {
    hubIsClosed = true;
    if (workerWait) {
      finishWorkerWait({ error: new Error("浏览器配对服务已关闭。") });
    }
  }

  async function bind(): Promise<HubBundle> {
    const identity = loadOrCreateIdentity(d.identityDir);
    // Reusing the remembered port is what lets a trusted extension reconnect
    // without the pairing page appearing at all.
    const preferred = d.explicitPort ?? loadLastPort(d.identityDir) ?? 0;

    let hub: LoopbackWSHub;
    let port: number;
    const pairPayload = (): PairPayload => ({
      v: 1,
      installId: identity.installId,
      secret: identity.secret,
      sessionId: info.sessionId,
      label: info.label,
      pid: info.pid,
      port
    });

    try {
      hub = new LoopbackWSHub({ ...common(), port: preferred, pairPayload });
      port = await hub.ready();
    } catch (e) {
      // An explicit override is the user's instruction, so a clash there is an
      // error worth surfacing. A remembered port is only a preference.
      if (d.explicitPort != null) throw e;
      hub = new LoopbackWSHub({ ...common(), port: 0, pairPayload });
      port = await hub.ready();
    }

    saveLastPort(port, d.identityDir);
    const coordinator = new Coordinator({ hub, clock: d.clock, idGen: d.idGen });
    installWire(hub, coordinator, d.clock, () => notifyWorkerReady(coordinator));
    pairUrlValue = `http://127.0.0.1:${port}/pair`;
    return { coordinator, hub, port };

    function common() {
      return {
        token: d.token,
        clock: d.clock,
        idGen: d.idGen,
        onPairingDenied: pairingDenied,
        onClosed: hubClosed
      };
    }
  }

  async function ensure(): Promise<HubBundle> {
    if (bundle) return bundle;
    // Concurrent first calls must share one bind, not race two servers.
    inflight ??= bind().then((b) => {
      bundle = b;
      return b;
    });
    const b = await inflight;
    if (!opened) {
      opened = true;
      // At most once per process: a session that keeps failing should not keep
      // spawning tabs.
      if (pairUrlValue) d.openUrl?.(pairUrlValue);
    }
    return b;
  }

  async function waitForWorker(timeoutMs = DEFAULT_WORKER_WAIT_TIMEOUT_MS): Promise<string> {
    const { coordinator } = await ensure();
    if (hubIsClosed) throw new Error("浏览器配对服务已关闭。");
    const connected = connectedWorkerId(coordinator);
    if (connected) return connected;
    if (pendingDenial) {
      pendingDenial = false;
      throw new Error(
        "用户拒绝了浏览器配对授权。" +
          (pairUrlValue ? `配对页：${pairUrlValue}` : "")
      );
    }
    if (workerWait) return workerWait.promise;

    let resolve!: (workerId: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const timer = setTimeout(() => {
      finishWorkerWait({
        error: new Error(
          `等待浏览器授权超时（${Math.ceil(timeoutMs / 1000)} 秒）。` +
            (pairUrlValue ? `请在已打开的配对页 ${pairUrlValue} 完成授权后重试。` : "")
        )
      });
    }, timeoutMs);
    timer.unref?.();
    workerWait = { promise, resolve, reject, timer };
    return promise;
  }

  return {
    ensure,
    peek: () => bundle,
    pairUrl: () => pairUrlValue,
    waitForWorker,
    bound: () => bundle != null
  };
}

/** Opens a URL in the user's default browser, best-effort. */
export function defaultOpenUrl(url: string): void {
  void import("node:child_process").then(({ spawn }) => {
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" })
        .unref();
    } catch {
      // The URL is also in the error text the agent received, so a failure to
      // spawn is not fatal.
    }
  });
}
