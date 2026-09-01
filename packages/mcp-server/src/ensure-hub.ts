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
  openUrl?: (url: string) => void | Promise<void>;
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
  let opening: Promise<void> | null = null;
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

  async function openPairPage(): Promise<void> {
    if (opened || !pairUrlValue || !d.openUrl) return;
    const url = pairUrlValue;
    opening ??= Promise.resolve()
      .then(() => d.openUrl!(url))
      .then(() => { opened = true; })
      .catch((error) => {
        console.error(
          `[atwebpilot-mcp] failed to open pairing page ${url}:`,
          error instanceof Error ? error.message : String(error)
        );
      })
      .finally(() => { opening = null; });
    await opening;
  }

  async function ensure(): Promise<HubBundle> {
    if (!bundle) {
      // Concurrent first calls must share one bind, not race two servers.
      inflight ??= bind().then((b) => {
        bundle = b;
        return b;
      });
      await inflight;
    }
    await openPairPage();
    return bundle!;
  }

  async function waitForWorker(
    timeoutMs = DEFAULT_WORKER_WAIT_TIMEOUT_MS,
    onWaiting?: (pairUrl: string) => void | Promise<void>
  ): Promise<string> {
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
    if (pairUrlValue) await onWaiting?.(pairUrlValue);
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
            (pairUrlValue ? `请打开配对页 ${pairUrlValue} 完成授权后重试。` : "")
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

type OpenCommand = { command: string; args: string[] };

function openCommands(url: string): OpenCommand[] {
  if (process.platform === "darwin") return [{ command: "open", args: [url] }];
  if (process.platform === "win32") {
    return [{ command: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] }];
  }
  if (process.env.WSL_DISTRO_NAME) {
    return [{ command: "cmd.exe", args: ["/c", "start", "", url] }];
  }
  return [
    { command: "xdg-open", args: [url] },
    { command: "gio", args: ["open", url] }
  ];
}

async function runOpenCommand({ command, args }: OpenCommand): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      child.unref();
      finish();
    }, 3_000);
    timer.unref?.();
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      if (code === 0) finish();
      else finish(new Error(`${command} exited with ${code ?? signal ?? "unknown status"}`));
    });
  });
}

/** Opens a URL in the user's default browser and reports launch failures. */
export async function defaultOpenUrl(url: string): Promise<void> {
  const errors: string[] = [];
  for (const candidate of openCommands(url)) {
    try {
      await runOpenCommand(candidate);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors.join("; ") || "no browser opener available");
}
