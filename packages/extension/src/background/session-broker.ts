/**
 * BG-side broker for `session.state.changed` events.
 *
 * When a host (sidepanel or in-page widget) mutates its session-store, it
 * broadcasts `{ type: "session.state.changed", tabId, snapshot, senderId }`
 * via chrome.runtime.sendMessage. BG catches it here and re-broadcasts to
 * the widget content-script on the specified tab (chrome.tabs.sendMessage
 * is required — runtime broadcast does NOT reach content-scripts).
 *
 * Receivers filter out self by comparing `senderId` to their own instance ID.
 */
export function installSessionBroker(options: {
  onSnapshot?: (tabId: number, snapshot: unknown) => void | Promise<void>;
} = {}): () => void {
  const listener = (msg: unknown, _sender: unknown, _respond: (r?: unknown) => void) => {
    const m = msg as { type?: string; tabId?: number; snapshot?: unknown } | null;
    if (!m || m.type !== "session.state.changed" || typeof m.tabId !== "number") return;
    void options.onSnapshot?.(m.tabId, m.snapshot);
    // Fan-out to widget on that tab.
    void chrome.tabs.sendMessage(m.tabId, msg).catch(() => {});
    // Sidepanel and other extension pages receive the original runtime message
    // directly — no relay needed.
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
