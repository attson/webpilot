import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetDBForTests } from "@/background/storage/db";
import { saveDraft } from "@/background/storage/tools";
import { installTabWatcher, refreshRecommendations } from "@/background/tab-watcher";

const setBadgeText = vi.fn();
const setBadgeBackgroundColor = vi.fn();
const sendMessage = vi.fn().mockResolvedValue(undefined);

describe("tab-watcher", () => {
  beforeEach(() => {
    _resetDBForTests();
    indexedDB = new IDBFactory();
    setBadgeText.mockClear();
    setBadgeBackgroundColor.mockClear();
    sendMessage.mockClear();
    (globalThis as unknown as { chrome: typeof chrome }).chrome = {
      action: { setBadgeText, setBadgeBackgroundColor },
      runtime: { sendMessage }
    } as unknown as typeof chrome;
  });

  afterEach(() => _resetDBForTests());

  it("sets badge text when matching tools exist", async () => {
    await saveDraft({
      kind: "steps",
      name: "Shop",
      urlPatterns: ["https://*.example.com/**"],
      description: "",
      steps: [{ kind: "tool", tool: "snapshotDOM", args: {} }],
      outputSchema: {}
    });
    await refreshRecommendations(7, "https://shop.example.com/goods.html");
    // badge = tools.length + presets.length; Shop URL also matches article-translate-zh (https://**)
    // so count is at least 1 (tool); total ≥ 1
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: expect.stringMatching(/^[1-9]\d*$/) });
    expect(setBadgeBackgroundColor).toHaveBeenCalled();
  });

  it("clears badge when no tools and no presets match", async () => {
    // article-translate-zh matches https://** so any https URL will yield a badge.
    // Use a non-https URL to test the zero-count path.
    await refreshRecommendations(8, "about:blank");
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 8, text: "" });
    expect(setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("broadcasts recommendations to sidepanel", async () => {
    await saveDraft({
      kind: "steps",
      name: "Shop",
      urlPatterns: ["https://*.example.com/**"],
      description: "",
      steps: [{ kind: "tool", tool: "snapshotDOM", args: {} }],
      outputSchema: {}
    });
    const url = "https://shop.example.com/goods.html";
    await refreshRecommendations(9, url);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tabs.recommendations",
        tabId: 9,
        url,
        tools: expect.arrayContaining([expect.objectContaining({ name: "Shop" })])
      })
    );
  });

  it("swallows sidepanel sendMessage rejection", async () => {
    sendMessage.mockRejectedValueOnce(new Error("no listeners"));
    await expect(refreshRecommendations(10, "https://other.com/")).resolves.not.toThrow();
  });
});

describe("tab-watcher new events", () => {
  it("broadcasts tabs.spawned on chrome.tabs.onCreated", async () => {
    const sent: unknown[] = [];
    let createdCb: ((tab: chrome.tabs.Tab) => void) | null = null;
    (globalThis as unknown as { chrome: typeof chrome }).chrome = {
      runtime: { sendMessage: async (m: unknown) => { sent.push(m); } },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        onCreated: { addListener: (cb: (t: chrome.tabs.Tab) => void) => { createdCb = cb; } }
      },
      webNavigation: { onHistoryStateUpdated: { addListener: () => {} } }
    } as unknown as typeof chrome;
    installTabWatcher();
    createdCb!({
      id: 200, windowId: 1, url: "https://x", title: "X",
      openerTabId: 100, incognito: false
    } as chrome.tabs.Tab);
    // sendMessage is async; wait a microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.find((m) => (m as { type?: string }).type === "tabs.spawned")).toMatchObject({
      type: "tabs.spawned",
      tabId: 200,
      openerTabId: 100,
      url: "https://x",
      windowId: 1
    });
  });

  it("broadcasts tabs.urlChanged on chrome.tabs.onUpdated with status=complete + url present", async () => {
    const sent: unknown[] = [];
    let updatedCb: ((tabId: number, change: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void) | null = null;
    (globalThis as unknown as { chrome: typeof chrome }).chrome = {
      runtime: { sendMessage: async (m: unknown) => { sent.push(m); } },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      tabs: {
        onUpdated: { addListener: (cb: typeof updatedCb) => { updatedCb = cb; } },
        onRemoved: { addListener: () => {} },
        onCreated: { addListener: () => {} }
      },
      webNavigation: { onHistoryStateUpdated: { addListener: () => {} } }
    } as unknown as typeof chrome;
    installTabWatcher();
    updatedCb!(167, { status: "complete", url: "https://new" }, {
      id: 167, url: "https://new", title: "NEW"
    } as chrome.tabs.Tab);
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.find((m) => (m as { type?: string }).type === "tabs.urlChanged")).toMatchObject({
      type: "tabs.urlChanged",
      tabId: 167,
      newUrl: "https://new",
      newTitle: "NEW"
    });
  });

  it("broadcasts tabs.removed on chrome.tabs.onRemoved", async () => {
    const sent: unknown[] = [];
    let removedCb: ((tabId: number) => void) | null = null;
    (globalThis as unknown as { chrome: typeof chrome }).chrome = {
      runtime: { sendMessage: async (m: unknown) => { sent.push(m); } },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: (cb: (id: number) => void) => { removedCb = cb; } },
        onCreated: { addListener: () => {} }
      },
      webNavigation: { onHistoryStateUpdated: { addListener: () => {} } }
    } as unknown as typeof chrome;
    installTabWatcher();
    removedCb!(167);
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.find((m) => (m as { type?: string }).type === "tabs.removed")).toMatchObject({
      type: "tabs.removed",
      tabId: 167
    });
  });
});
