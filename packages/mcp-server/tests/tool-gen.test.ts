import { describe, it, expect } from "vitest";
import {
  BLOCKED_TOOLS,
  CORE_TOOLS,
  generateBrowserTools,
  readToolMode
} from "../src/tool-gen";

describe("generateBrowserTools", () => {
  const tools = generateBrowserTools("full");

  it("exposes every tool except the block-list", () => {
    const names = tools.map((t) => t.builtinTool);
    // 58 TOOL_DEFS minus the three blocked ones.
    expect(names).toHaveLength(55);
    for (const b of BLOCKED_TOOLS) expect(names).not.toContain(b);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reaches the tools the old 19-name allow-list withheld", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const n of [
      "browser_runJS",
      "browser_listTabs",
      "browser_openTab",
      "browser_takeSnapshot",
      "browser_clickByUid",
      "browser_screenshot",
      "browser_downloadSpreadsheet",
      "browser_createPageIndex"
    ]) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it("reaches the Plan 32 parity tools", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const n of [
      "browser_consoleMessages",
      "browser_networkRequests",
      "browser_networkRequestDetail",
      "browser_handleDialog",
      "browser_recorderConfig",
      "browser_drag",
      "browser_drop",
      "browser_resize",
      "browser_navigateBack",
      "browser_navigateForward",
      "browser_findElements"
    ]) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it("still withholds the blocked tools", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const n of ["browser_askUser", "browser_attachTab", "browser_detachTab"]) {
      expect(names.has(n), n).toBe(false);
    }
  });

  it("injects required session_id and strips inner tabId", () => {
    const click = tools.find((t) => t.name === "browser_click")!;
    const props = click.inputSchema.properties as Record<string, unknown>;
    expect(props.session_id).toBeTruthy();
    expect(props.tabId).toBeUndefined();
    expect((click.inputSchema.required as string[]).includes("session_id")).toBe(true);
    expect((click.inputSchema.required as string[]).includes("selector")).toBe(true);
  });

  it("records the underlying builtin tool name", () => {
    const click = tools.find((t) => t.name === "browser_click")!;
    expect(click.builtinTool).toBe("click");
  });

  it("marks screenshot as an image result and everything else as json", () => {
    expect(tools.find((t) => t.builtinTool === "screenshot")!.resultKind).toBe("image");
    expect(tools.find((t) => t.builtinTool === "click")!.resultKind).toBe("json");
  });

  it("marks runJS as a js step so the caller does not send it as a tool step", () => {
    expect(tools.find((t) => t.builtinTool === "runJS")!.stepKind).toBe("js");
    expect(tools.find((t) => t.builtinTool === "click")!.stepKind).toBe("tool");
  });
});

describe("core mode", () => {
  it("is the documented core set and a strict subset of full", () => {
    const core = generateBrowserTools("core").map((t) => t.builtinTool);
    const full = new Set(generateBrowserTools("full").map((t) => t.builtinTool));
    expect(core.sort()).toEqual([...CORE_TOOLS].sort());
    for (const n of core) expect(full.has(n), n).toBe(true);
  });

  it("covers browse / scrape / fill / navigate / capture without discovery", () => {
    const core = new Set(generateBrowserTools("core").map((t) => t.builtinTool));
    for (const n of [
      "takeSnapshot", "findElements", "getPageInfo", "extractText",
      "createPageIndex", "searchPageIndex", "readPageBlock", "extractPageFields",
      "clickByUid", "click", "fillByUid", "fillInput", "fillForm", "selectOption", "setCheckbox",
      "hover", "pressKey", "drag", "drop", "uploadFile",
      "navigate", "listTabs", "openTab", "closeTab", "switchToTab", "resize", "scroll",
      "screenshot", "waitFor", "runJS", "consoleMessages", "networkRequests"
    ]) expect(core.has(n), n).toBe(true);
    for (const n of ["downloadSpreadsheet", "httpRequest", "readStorage", "snapshotDOM", "searchHistory"]) {
      expect(core.has(n), n).toBe(false);
    }
  });
});

describe("mcp descriptions", () => {
  const tools = generateBrowserTools("full");
  it("uses the English mcp.description, not the side-panel text", () => {
    const click = tools.find((t) => t.builtinTool === "click")!;
    expect(click.description).not.toMatch(/[一-鿿]/);
    expect(click.description).toMatch(/^Click/);
  });
  it("keeps only mcp.params property descriptions and a short session_id", () => {
    const fill = tools.find((t) => t.builtinTool === "fillInput")!;
    const props = fill.inputSchema.properties as Record<string, { description?: string }>;
    expect(props.slowly.description).toBe("type char by char for controlled components");
    expect(props.selector.description).toBeUndefined();
    expect(props.session_id.description).toBe("Session id from open_session");
  });
  it("never leaks CJK text into the MCP surface", () => {
    for (const t of tools) {
      expect(JSON.stringify({ d: t.description, s: t.inputSchema }), t.name).not.toMatch(/[一-鿿]/);
    }
  });
});

describe("readToolMode", () => {
  it("defaults to core", () => {
    expect(readToolMode({})).toBe("core");
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "" })).toBe("core");
  });
  it("accepts full", () => {
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "full" })).toBe("full");
  });
  it("falls back to core on an unrecognised value (including the removed parity)", () => {
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "parity" })).toBe("core");
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "nonsense" })).toBe("core");
  });
});
