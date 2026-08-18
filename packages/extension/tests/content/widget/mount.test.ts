import { describe, expect, it, vi, beforeEach } from "vitest";

const storage: Record<string, any> = { "atwebpilot.llm": { widgetEnabled: true } };
const storageListeners: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void> = [];
(globalThis as any).chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map(k => [k, storage[k]]))),
      set: vi.fn(async () => {})
    },
    onChanged: {
      addListener: vi.fn((listener) => { storageListeners.push(listener); }),
      removeListener: vi.fn((listener) => {
        const index = storageListeners.indexOf(listener);
        if (index >= 0) storageListeners.splice(index, 1);
      })
    }
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  }
};

describe("mountWidget", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    for (const k of Object.keys(storage)) if (k !== "atwebpilot.llm") delete storage[k];
    storage["atwebpilot.llm"] = { widgetEnabled: true };
    vi.clearAllMocks();
  });

  it("creates <atwebpilot-widget> element on top window", async () => {
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    const el = document.querySelector("atwebpilot-widget");
    expect(el).toBeTruthy();
    expect(el?.shadowRoot).toBeTruthy();
  });

  it("does NOT mount when widgetEnabled=false", async () => {
    storage["atwebpilot.llm"] = { widgetEnabled: false };
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    expect(document.querySelector("atwebpilot-widget")).toBeNull();
  });

  it("does NOT mount when host is in hiddenHosts", async () => {
    storage["atwebpilot.widget.hiddenHosts"] = [location.hostname];
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    expect(document.querySelector("atwebpilot-widget")).toBeNull();
  });

  it("mounts only allowlisted hosts in allowlist mode", async () => {
    storage["atwebpilot.llm"] = { widgetEnabled: true, widgetSiteMode: "allowlist" };
    storage["atwebpilot.widget.allowedHosts"] = ["not-this-host.example"];
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    expect(document.querySelector("atwebpilot-widget")).toBeNull();

    storage["atwebpilot.widget.allowedHosts"] = [location.hostname];
    await mountWidget();
    expect(document.querySelector("atwebpilot-widget")).toBeTruthy();
  });

  it("gives hiddenHosts precedence over allowedHosts", async () => {
    storage["atwebpilot.llm"] = { widgetEnabled: true, widgetSiteMode: "allowlist" };
    storage["atwebpilot.widget.allowedHosts"] = [location.hostname];
    storage["atwebpilot.widget.hiddenHosts"] = [location.hostname];
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    expect(document.querySelector("atwebpilot-widget")).toBeNull();
  });

  it("mounts only once when called twice", async () => {
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    await mountWidget();
    expect(document.querySelectorAll("atwebpilot-widget").length).toBe(1);
  });

  it("reconciles an open page when the site policy changes", async () => {
    const { mountWidget } = await import("@/content/widget/mount");
    await mountWidget();
    expect(document.querySelector("atwebpilot-widget")).toBeTruthy();

    storage["atwebpilot.widget.hiddenHosts"] = [location.hostname];
    storageListeners.forEach((listener) => listener({
      "atwebpilot.widget.hiddenHosts": { oldValue: [], newValue: [location.hostname] }
    }, "local"));
    await vi.waitFor(() => expect(document.querySelector("atwebpilot-widget")).toBeNull());

    storage["atwebpilot.widget.hiddenHosts"] = [];
    storageListeners.forEach((listener) => listener({
      "atwebpilot.widget.hiddenHosts": { oldValue: [location.hostname], newValue: [] }
    }, "local"));
    await vi.waitFor(() => expect(document.querySelector("atwebpilot-widget")).toBeTruthy());
  });
});
