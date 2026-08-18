import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAllowedHosts,
  getFabPos,
  getHiddenHosts,
  getPanelSize,
  hideHost,
  isHostHidden,
  matchesHostRule,
  parseHostRules,
  setFabPos,
  shouldMountOnHost
} from "@/content/widget/per-site";

const storage: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, storage[key]]))),
        set: vi.fn(async (values: Record<string, unknown>) => Object.assign(storage, values))
      }
    }
  };
});

describe("widget hostname rules", () => {
  it("normalizes, deduplicates, and validates rules", () => {
    expect(parseHostRules(" Example.com.\n*.Example.com\nexample.com\n")).toEqual({
      ok: true,
      rules: ["example.com", "*.example.com"]
    });
    expect(parseHostRules("https://example.com\nfoo.com/path\nfoo:*" )).toEqual({
      ok: false,
      invalid: ["https://example.com", "foo.com/path", "foo:*"]
    });
  });

  it("keeps exact and subdomain wildcard matching distinct", () => {
    expect(matchesHostRule("example.com", "example.com")).toBe(true);
    expect(matchesHostRule("www.example.com", "example.com")).toBe(false);
    expect(matchesHostRule("www.example.com", "*.example.com")).toBe(true);
    expect(matchesHostRule("example.com", "*.example.com")).toBe(false);
  });

  it("applies mode and gives the blocklist precedence", () => {
    expect(shouldMountOnHost("other.com", "all", [], [])).toBe(true);
    expect(shouldMountOnHost("other.com", "allowlist", ["example.com"], [])).toBe(false);
    expect(shouldMountOnHost("example.com", "allowlist", ["example.com"], [])).toBe(true);
    expect(shouldMountOnHost("example.com", "allowlist", ["example.com"], ["example.com"])).toBe(false);
  });

  it("persists exact hosts from the existing hide action as blocklist entries", async () => {
    storage["atwebpilot.widget.hiddenHosts"] = ["existing.com"];
    await hideHost("NEW.Example.com.");
    expect(storage["atwebpilot.widget.hiddenHosts"]).toEqual(["existing.com", "new.example.com"]);
    expect(await getAllowedHosts()).toEqual([]);
  });

  it("keeps hideHost idempotent and readable through isHostHidden", async () => {
    expect(await isHostHidden("a.com")).toBe(false);
    await hideHost("a.com");
    await hideHost("a.com");
    expect(await isHostHidden("a.com")).toBe(true);
    expect(await getHiddenHosts()).toEqual(["a.com"]);
  });

  it("stores FAB positions per host", async () => {
    await setFabPos("x.com", { x: 100, y: 200 });
    expect(await getFabPos("x.com")).toEqual({ x: 100, y: 200 });
    expect(await getFabPos("other.com")).toBeNull();
  });

  it("uses the default panel size when none is stored", async () => {
    expect(await getPanelSize()).toEqual({ w: 320, h: 480 });
  });
});
