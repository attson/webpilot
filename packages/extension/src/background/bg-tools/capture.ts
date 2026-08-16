import type { Json } from "@atwebpilot/shared/types";
import { captureVisualEvidence } from "@/sidepanel/llm/visual-evidence";

/**
 * `screenshot` in the service worker so the coordinator/MCP EXEC path can
 * reach it. The targeting logic (page-index blockId, selector scroll and
 * highlight) is reused from `visual-evidence.ts`, which is already
 * dependency-injected — only the chrome.* bindings differ here.
 */

export type CaptureDeps = {
  runStep: (input: {
    step: import("@atwebpilot/shared/types").Step;
    tabId: number;
    attachedTabIds?: number[];
    bindings?: Record<string, Json>;
  }) => Promise<Json>;
};

let deps: CaptureDeps | null = null;

/** Wired from rpc-handlers at module init to avoid a circular import. */
export function registerCaptureDeps(d: CaptureDeps): void {
  deps = d;
}

export async function screenshot(raw: Json, tabId: number): Promise<Json> {
  if (!deps) throw new Error("screenshot: capture deps not initialised");
  if (!chrome.tabs?.captureVisibleTab) {
    throw new Error("screenshot: captureVisibleTab unavailable");
  }
  const shot = await captureVisualEvidence({
    raw,
    defaultTabId: tabId,
    getTab: async (id) => {
      const tab = await chrome.tabs.get(id);
      if (tab.windowId == null) throw new Error(`screenshot: tab ${id} has no window`);
      return { windowId: tab.windowId };
    },
    captureVisibleTab: (windowId) => chrome.tabs.captureVisibleTab(windowId, { format: "png" }),
    runStep: deps.runStep
  });
  return shot as unknown as Json;
}
