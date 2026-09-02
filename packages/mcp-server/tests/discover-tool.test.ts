import { describe, it, expect } from "vitest";
import { generateBrowserTools } from "../src/tool-gen";
import { DISCOVER_TOOL, handleDiscover } from "../src/discover-tool";

const all = generateBrowserTools("full");
const coreNames = () => new Set(generateBrowserTools("core").map((t) => t.name));

describe("browser_discoverTools", () => {
  it("has an English description and an optional enable array", () => {
    expect(DISCOVER_TOOL.name).toBe("browser_discoverTools");
    expect(DISCOVER_TOOL.description).not.toMatch(/[一-鿿]/);
    const props = DISCOVER_TOOL.inputSchema.properties as Record<string, { type: string }>;
    expect(props.enable.type).toBe("array");
    expect(DISCOVER_TOOL.inputSchema.required ?? []).not.toContain("enable");
  });

  it("without enable returns the catalog and does not change state", () => {
    const advertised = coreNames();
    const before = advertised.size;
    const r = handleDiscover({ all, advertised, args: {} });
    expect(r.changed).toBe(false);
    expect(r.catalog!.length).toBe(all.length - before);
    expect(advertised.size).toBe(before);
  });

  it("with enable adds tools, returns their schemas, reports unknown names", () => {
    const advertised = coreNames();
    const r = handleDiscover({
      all, advertised,
      args: { enable: ["browser_downloadSpreadsheet", "browser_storage", "browser_nope"] }
    });
    expect(r.changed).toBe(true);
    expect(r.enabled!.map((t) => t.name)).toEqual(["browser_downloadSpreadsheet", "browser_storage"]);
    expect(r.enabled![0].inputSchema).toBeTruthy();
    expect(r.unknown).toEqual(["browser_nope"]);
    expect(advertised.has("browser_downloadSpreadsheet")).toBe(true);
  });

  it("enabling an already advertised tool is a no-op and not a change", () => {
    const advertised = coreNames();
    const r = handleDiscover({ all, advertised, args: { enable: ["browser_click"] } });
    expect(r.changed).toBe(false);
    expect(r.enabled).toEqual([]);
  });

  it("accepts bare builtin names as a convenience", () => {
    const advertised = coreNames();
    const r = handleDiscover({ all, advertised, args: { enable: ["downloadSpreadsheet"] } });
    expect(r.enabled!.map((t) => t.name)).toEqual(["browser_downloadSpreadsheet"]);
  });

  it("catalog omits tools the worker cannot run", () => {
    const advertised = coreNames();
    const supported = new Set(["downloadImage"]);
    const r = handleDiscover({ all, advertised, args: {}, supported });
    const names = r.catalog!.map((c) => c.name);
    expect(names).toContain("browser_downloadImage");
    expect(names).not.toContain("browser_downloadSpreadsheet");
    expect(names).not.toContain("browser_storage");
  });

  it("enable routes unsupported names to `unsupported` without advertising them", () => {
    const advertised = coreNames();
    const supported = new Set(["downloadImage", "readStorage"]);
    const r = handleDiscover({
      all, advertised,
      args: { enable: ["browser_storage", "browser_downloadImage"] },
      supported
    });
    expect(r.enabled!.map((t) => t.name)).toEqual(["browser_downloadImage"]);
    expect(r.unsupported).toEqual(["browser_storage"]);
    expect(advertised.has("browser_storage")).toBe(false);
    expect(r.changed).toBe(true);
  });

  it("undefined supported means everything is runnable", () => {
    const advertised = coreNames();
    const before = advertised.size;
    const r = handleDiscover({ all, advertised, args: {} });
    expect(r.catalog!.length).toBe(all.length - before);
  });
});
