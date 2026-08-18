/**
 * Breathing border overlay — visual signal that AtWebPilot is actively
 * running in (or driving) this tab. Listens to the BG-written heartbeat
 * in chrome.storage.local and toggles a fixed-position pseudo-element on
 * `document.body` when this tab is in the heartbeat's `activeTabIds` set.
 *
 * Deliberately uses `pointer-events: none` and `z-index: 2147483647` so it
 * never interferes with page layout / event handling.
 */

const HEARTBEAT_KEY = "atwebpilot.heartbeat";
const SETTING_KEY = "atwebpilot.llm";
const CLASS = "atwebpilot-breathing";
const STYLE_ID = "atwebpilot-breathing-style";

type Heartbeat = { ts: number; activeTabIds: number[] };

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.${CLASS}::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483647;
      border: 3px solid transparent;
      box-shadow:
        inset 0 0 0 3px rgba(16, 185, 129, 0.55),
        inset 0 0 18px 4px rgba(59, 130, 246, 0.30);
      animation: atwebpilot-breath 1.6s ease-in-out infinite;
    }
    @keyframes atwebpilot-breath {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 0.95; }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function removeStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

function setActive(active: boolean): void {
  if (!document.body) return;
  if (active) {
    ensureStyle();
    document.body.classList.add(CLASS);
  } else {
    document.body.classList.remove(CLASS);
  }
}

let currentTabId: number | null = null;
let userEnabled = true;
let lastHeartbeat: Heartbeat | null = null;

function reconcile(): void {
  if (!userEnabled) {
    setActive(false);
    return;
  }
  if (currentTabId == null || !lastHeartbeat) {
    setActive(false);
    return;
  }
  const fresh = Date.now() - lastHeartbeat.ts < 5_000;
  const me = lastHeartbeat.activeTabIds.includes(currentTabId);
  setActive(fresh && me);
}

async function init(): Promise<void> {
  try {
    const tabResp = await chrome.runtime.sendMessage({ type: "atwebpilot.getTabId" });
    if (tabResp && typeof tabResp.tabId === "number") currentTabId = tabResp.tabId;
  } catch {
    // ignore
  }

  try {
    const got = await chrome.storage.local.get([HEARTBEAT_KEY, SETTING_KEY]);
    const hb = got[HEARTBEAT_KEY] as Heartbeat | undefined;
    if (hb && typeof hb.ts === "number" && Array.isArray(hb.activeTabIds)) lastHeartbeat = hb;
    const llm = got[SETTING_KEY] as { breathingBorder?: boolean } | undefined;
    if (llm && llm.breathingBorder === false) userEnabled = false;
  } catch {
    // ignore
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[HEARTBEAT_KEY]) {
      lastHeartbeat = (changes[HEARTBEAT_KEY].newValue as Heartbeat) ?? null;
      reconcile();
    }
    if (changes[SETTING_KEY]) {
      const nv = changes[SETTING_KEY].newValue as { breathingBorder?: boolean } | undefined;
      userEnabled = nv?.breathingBorder !== false;
      if (!userEnabled) removeStyle();
      reconcile();
    }
  });

  reconcile();
  setInterval(reconcile, 2_500);
}

void init();
