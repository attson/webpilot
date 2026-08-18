import {
  getAllowedHosts,
  getHiddenHosts,
  shouldMountOnHost,
  WIDGET_SITE_STORAGE_KEYS,
  type WidgetSiteMode
} from "./per-site";
import { setTeardown, unmountWidget } from "./lifecycle";

const HOST_TAG = "atwebpilot-widget";
const SETTINGS_KEY = "atwebpilot.llm";

// unmountWidget() is exported from ./lifecycle so components can trigger
// teardown without importing this module (which has auto-mount side effects).

export async function mountWidget(): Promise<void> {
  // Idempotent
  if (document.querySelector(HOST_TAG)) return;

  // Top-level window only
  if (window !== window.top) return;

  // HTML only (skip PDF, XML feeds, etc.)
  // Treat absent/undefined contentType as html (happy-dom + real-browser content scripts land here).
  if (document.contentType && document.contentType !== "text/html") return;

  // Global toggle
  const settings = (await chrome.storage.local.get([SETTINGS_KEY]))[SETTINGS_KEY] as
    { widgetEnabled?: boolean; widgetSiteMode?: WidgetSiteMode } | undefined;
  if (settings?.widgetEnabled === false) return;

  const [allowedHosts, hiddenHosts] = await Promise.all([getAllowedHosts(), getHiddenHosts()]);
  if (!shouldMountOnHost(
    location.hostname,
    settings?.widgetSiteMode === "allowlist" ? "allowlist" : "all",
    allowedHosts,
    hiddenHosts
  )) return;

  const host = document.createElement(HOST_TAG);
  host.style.all = "initial";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const { attachStyles } = await import("./styles");
  attachStyles(shadow);
  const { bootstrap } = await import("./react-root");
  setTeardown(bootstrap(shadow));

}

export async function reconcileWidget(): Promise<void> {
  unmountWidget();
  await mountWidget();
}

function installSitePolicyListener(): void {
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const listChanged = WIDGET_SITE_STORAGE_KEYS.allowed in changes || WIDGET_SITE_STORAGE_KEYS.hidden in changes;
    const settingsChange = changes[WIDGET_SITE_STORAGE_KEYS.settings];
    const oldSettings = settingsChange?.oldValue as { widgetEnabled?: boolean; widgetSiteMode?: WidgetSiteMode } | undefined;
    const newSettings = settingsChange?.newValue as { widgetEnabled?: boolean; widgetSiteMode?: WidgetSiteMode } | undefined;
    const policyChanged = settingsChange != null && (
      oldSettings?.widgetEnabled !== newSettings?.widgetEnabled ||
      oldSettings?.widgetSiteMode !== newSettings?.widgetSiteMode
    );
    if (listChanged || policyChanged) void reconcileWidget();
  });
}

// Auto-mount at document_idle (crxjs runs this at run_at time).
installSitePolicyListener();
void mountWidget();
