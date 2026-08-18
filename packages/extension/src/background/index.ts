import { RpcRequest as RpcRequestSchema } from "@atwebpilot/shared/messages";
import { handleRpc, setRecorderPolicy } from "./rpc-handlers";
import { installTabWatcher } from "./tab-watcher";
import { installTabCloseArchiver } from "./tab-close-archiver";
import {
  getOrCreateWorkerId,
  loadConfig,
  saveConnectionStatus
} from "./coordinator-state";
import { handleExec } from "./coordinator-exec";
import { listTools } from "./storage/tools";
import { CoordinatorChatHost } from "./coordinator-chat";
import { CoordinatorStateBridge } from "./coordinator-state-bridge";

import { handleMenuClick, registerContextMenus } from "./context-menu";
import {
  parseReplayPayload,
  PENDING_REPLAY_KEY,
} from "../sidepanel/lib/external-replay";
import { installSessionBroker } from "./session-broker";
import { installCdpListeners } from "./recorder/cdp";
import { CoordinatorPool } from "./coordinator-pool";
import { TabOwnership } from "./tab-ownership";
import { installTabsBroadcast } from "./tabs-broadcast";
import { approve, decidePairing } from "./pairing-host";
import type { PairPayload } from "@atwebpilot/shared/pairing";
import { readPolicyForTab } from "@/injection-policy";

// Idempotent; only takes effect once the user grants the optional debugger
// permission and enables the CDP backend in settings.
installCdpListeners();

chrome.runtime.onInstalled.addListener(() => {
  console.info("[atwebpilot] service worker installed");
  registerContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
});

// Re-register on every SW spin-up so transient menus survive MV3 idle teardown.
registerContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info.menuItemId, info, tab);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error("[atwebpilot] sidePanel setPanelBehavior", e));

installTabWatcher();
installTabCloseArchiver();
installSessionBroker();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Tiny side-channel for content scripts that need to know their own tabId
  // (used by breathing-border). Bypass the RpcRequest schema for this one.
  if (msg && typeof msg === "object" && (msg as { type?: string }).type === "atwebpilot.getTabId") {
    sendResponse({ tabId: sender.tab?.id ?? null });
    return false;
  }
  if (msg && typeof msg === "object" && (msg as { type?: string }).type === "atwebpilot.recorderPolicy") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "tab missing" });
      return false;
    }
    void readPolicyForTab(tabId)
      .then((policy) => setRecorderPolicy(
        tabId,
        (msg as { enabled?: boolean }).enabled === true && policy.injectionMode === "diagnostic"
      ))
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (
    msg &&
    typeof msg === "object" &&
    (msg as { type?: string }).type === "atwebpilot.externalReplay"
  ) {
    const m = msg as { payload?: unknown; sourceUrl?: string };
    const sourceUrl = m.sourceUrl ?? sender.tab?.url ?? "(unknown)";
    const parsed = parseReplayPayload(m.payload, sourceUrl);
    if (!parsed) {
      sendResponse({ ok: false, error: "invalid payload" });
      return false;
    }
    void chrome.storage.local
      .set({ [PENDING_REPLAY_KEY]: parsed })
      .then(() => {
        if (sender.tab?.id != null) {
          return chrome.sidePanel.open({ tabId: sender.tab.id });
        }
      })
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  const parsed = RpcRequestSchema.safeParse(msg);
  if (!parsed.success) return false;

  let req: unknown = parsed.data;
  if (parsed.data.type === "scripting.injectMain" && sender.tab?.id != null) {
    req = { ...parsed.data, tabId: sender.tab.id };
  }

  handleRpc(req).then(sendResponse);
  return true;
});

// --- Coordinator connections (Phase 2; a pool since Plan 33) ---
let activeStateBridge: CoordinatorStateBridge | null = null;

async function buildSavedToolsMetadata(): Promise<
  Array<{ id: string; version: number; hash: string; url_pattern: string[]; description?: string }>
> {
  const tools = await listTools();
  return tools.map((t) => ({
    id: t.id,
    version: t.versions?.length ?? 1,
    // Phase 2 stub: hash from id. Phase 3 will introduce real content hashing.
    hash: t.id,
    url_pattern: t.urlPatterns,
    description: t.description
  }));
}

let pool: CoordinatorPool | null = null;
const tabOwnership = new TabOwnership();
let stopTabsBroadcast: (() => void) | null = null;

function ensurePool(): CoordinatorPool {
  if (pool) return pool;
  const chatHost = new CoordinatorChatHost();
  activeStateBridge ??= new CoordinatorStateBridge({
    sendRuntimeMessage: (m) => chrome.runtime.sendMessage(m),
    onRuntimeMessage: (fn) => chrome.runtime.onMessage.addListener(fn),
    offRuntimeMessage: (fn) => chrome.runtime.onMessage.removeListener(fn)
  });
  pool = new CoordinatorPool({
    clientOptions: (endpoint, connectionId) => ({
      token: undefined,
      worker_id: workerIdCache ?? "worker_pending",
      savedToolsProvider: buildSavedToolsMetadata,
      labelsProvider: async () => [],
      onExec: handleExec,
      onChat: (m, send) => chatHost.handle(m, send),
      onReadState: (m, send) => activeStateBridge!.handle(m, send),
      onSessionOpened: ({ session_id, tab_id }) =>
        tabOwnership.claim(tab_id, {
          connectionId,
          sessionId: session_id,
          label: poolLabelFor(connectionId)
        }),
      onSessionClosed: ({ session_id }) => tabOwnership.releaseBySession(session_id),
      onStatusChange: (status) => {
        void saveConnectionStatus({ status, ws_url: endpoint, updated_at: Date.now() });
      }
    })
  });
  stopTabsBroadcast?.();
  stopTabsBroadcast = installTabsBroadcast({ pool, ownership: tabOwnership });
  return pool;
}

let workerIdCache: string | null = null;

export function coordinatorPool(): CoordinatorPool {
  return ensurePool();
}

export function tabOwnershipRegistry(): TabOwnership {
  return tabOwnership;
}

function poolLabelFor(connectionId: string): string {
  return pool?.list().find((e) => e.sessionId === connectionId)?.label ?? connectionId;
}

/**
 * The legacy hand-configured URL still works: it simply becomes one pool
 * entry alongside anything paired.
 */
export async function startCoordinatorClient(): Promise<void> {
  workerIdCache = await getOrCreateWorkerId();
  const config = await loadConfig();
  if (!config?.enabled || !config.ws_url) return;
  const p = ensurePool();
  if (p.list().some((e) => e.sessionId === "legacy")) return;
  await p.add({
    endpoint: config.ws_url,
    installId: "legacy",
    sessionId: "legacy",
    label: "手动配置",
    pid: 0,
    port: 0
  });
}

export async function stopCoordinatorClient(): Promise<void> {
  if (activeStateBridge) {
    activeStateBridge.dispose();
    activeStateBridge = null;
  }
  stopTabsBroadcast?.();
  stopTabsBroadcast = null;
  if (!pool) return;
  await pool.disposeAll();
  pool = null;
}

/** Pairing round-trip with the content-script relay. */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const m = msg as {
    type?: string;
    payload?: PairPayload;
    approved?: boolean;
    sessionId?: string;
  };
  if (m?.type === "pairing.request" && m.payload) {
    void decidePairing(m.payload).then(async (decision) => {
      if (decision === "trusted") {
        workerIdCache ??= await getOrCreateWorkerId();
        await ensurePool().addFromPairing(m.payload!);
      }
      sendResponse({ decision });
    });
    return true;
  }
  if (m?.type === "pairing.listSessions") {
    sendResponse({ sessions: pool ? pool.list() : [] });
    return false;
  }
  if (m?.type === "pairing.disconnect" && typeof m.sessionId === "string") {
    void ensurePool().remove(m.sessionId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (m?.type === "pairing.wake" && typeof m.sessionId === "string") {
    ensurePool().wake(m.sessionId);
    sendResponse({ ok: true });
    return false;
  }
  if (m?.type === "pairing.decision" && m.payload) {
    void (async () => {
      if (m.approved) {
        await approve(m.payload!);
        workerIdCache ??= await getOrCreateWorkerId();
        await ensurePool().addFromPairing(m.payload!);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  return false;
});

void startCoordinatorClient();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = Object.keys(changes);
  if (
    keys.some(
      (k) =>
        k === "atwebpilot.coordinator.config" || k === "atwebpilot.coordinator.token"
    )
  ) {
    void (async () => {
      await stopCoordinatorClient();
      await startCoordinatorClient();
    })();
  }
});
