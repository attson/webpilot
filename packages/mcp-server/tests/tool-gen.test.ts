import { describe, it, expect } from "vitest";
import {
  BLOCKED_TOOLS,
  PARITY_TOOLS,
  generateBrowserTools,
  readToolMode
} from "../src/tool-gen";

describe("generateBrowserTools", () => {
  const tools = generateBrowserTools();

  it("exposes every tool except the block-list", () => {
    const names = tools.map((t) => t.builtinTool);
    // 57 TOOL_DEFS minus the three blocked ones.
    expect(names).toHaveLength(54);
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

describe("parity mode", () => {
  it("is a strict subset of full", () => {
    const parity = generateBrowserTools("parity").map((t) => t.builtinTool);
    const full = new Set(generateBrowserTools("full").map((t) => t.builtinTool));
    expect(parity.length).toBe(PARITY_TOOLS.length);
    for (const n of parity) expect(full.has(n), n).toBe(true);
  });

  it("covers playwright-ext's surface", () => {
    const parity = new Set(generateBrowserTools("parity").map((t) => t.builtinTool));
    for (const n of [
      "takeSnapshot", "click", "fillInput", "selectOption", "hover", "pressKey",
      "drag", "drop", "uploadFile", "navigate", "navigateBack", "resize",
      "screenshot", "runJS", "waitFor", "findElements",
      "consoleMessages", "networkRequests"
    ]) {
      expect(parity.has(n), n).toBe(true);
    }
  });

  it("every parity name actually exists in the full surface", () => {
    const full = new Set(generateBrowserTools("full").map((t) => t.builtinTool));
    for (const n of PARITY_TOOLS) expect(full.has(n), n).toBe(true);
  });
});

describe("readToolMode", () => {
  it("defaults to full", () => {
    expect(readToolMode({})).toBe("full");
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "" })).toBe("full");
  });

  it("accepts parity", () => {
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "parity" })).toBe("parity");
  });

  it("falls back to full on an unrecognised value", () => {
    expect(readToolMode({ ATWEBPILOT_MCP_TOOLS: "nonsense" })).toBe("full");
  });
});
