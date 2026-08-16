import { RpcRequest as RpcRequestSchema } from "@atwebpilot/shared/messages";
import { handleRpc } from "./rpc-handlers";
import { installTabWatcher } from "./tab-watcher";
import { installTabCloseArchiver } from "./tab-close-archiver";
import { CoordinatorClient } from "./coordinator-client";
import {
  getOrCreateWorkerId,
  loadConfig,
  loadToken,
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

// --- Coordinator client (Phase 2) ---
let activeClient: CoordinatorClient | null = null;
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

export async function startCoordinatorClient(): Promise<void> {
  if (activeClient) return;
  const config = await loadConfig();
  if (!config?.enabled || !config.ws_url) return;
  const token = await loadToken();
  const worker_id = await getOrCreateWorkerId();
  const chatHost = new CoordinatorChatHost();
  activeStateBridge = new CoordinatorStateBridge({
    sendRuntimeMessage: (m) => chrome.runtime.sendMessage(m),
    onRuntimeMessage: (fn) => chrome.runtime.onMessage.addListener(fn),
    offRuntimeMessage: (fn) => chrome.runtime.onMessage.removeListener(fn)
  });
  activeClient = new CoordinatorClient({
    ws_url: config.ws_url,
    token,
    worker_id,
    savedToolsProvider: buildSavedToolsMetadata,
    labelsProvider: async () => [],
    onExec: handleExec,
    onChat: (m, send) => chatHost.handle(m, send),
    onReadState: (m, send) => activeStateBridge!.handle(m, send),
    onStatusChange: (status) => {
      void saveConnectionStatus({
        status,
        ws_url: config.ws_url,
        updated_at: Date.now()
      });
    }
  });
  await activeClient.connect();
}

export async function stopCoordinatorClient(): Promise<void> {
  if (activeStateBridge) {
    activeStateBridge.dispose();
    activeStateBridge = null;
  }
  if (!activeClient) return;
  await activeClient.disconnect();
  activeClient = null;
}

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
