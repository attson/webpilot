import { describe, it, expect } from "vitest";
import { TOOL_DEFS } from "../../src/llm";

describe("TOOL_DEFS (hoisted to shared)", () => {
  it("includes the 19 builtin exec tools by name", () => {
    const names = new Set(TOOL_DEFS.map((t) => t.name));
    for (const n of [
      "snapshotDOM", "querySelector", "querySelectorAll", "extractText", "extractImages",
      "getValue", "extractFormState", "hover", "focus", "scroll", "waitFor",
      "click", "fillInput", "setCheckbox", "selectOption", "httpRequest",
      "submitForm", "uploadFile", "readStorage"
    ]) {
      expect(names.has(n)).toBe(true);
    }
  });

  it("each def has name/description/input_schema", () => {
    for (const t of TOOL_DEFS) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
      expect(t.input_schema).toBeTruthy();
    }
  });
});

describe("Plan 32 parity tool defs", () => {
  const byName = new Map(TOOL_DEFS.map((t) => [t.name, t]));
  const props = (n: string) =>
    (byName.get(n)!.input_schema as { properties: Record<string, unknown> }).properties;

  it("defines every new tool exactly once", () => {
    for (const name of [
      "consoleMessages", "networkRequests", "networkRequestDetail", "handleDialog",
      "recorderConfig", "navigateBack", "navigateForward", "resize", "drag", "drop",
      "findElements"
    ]) {
      expect(byName.has(name), name).toBe(true);
    }
    expect(TOOL_DEFS.length).toBe(new Set(TOOL_DEFS.map((t) => t.name)).size);
    expect(TOOL_DEFS.length).toBe(57);
  });

  it("documents the dialog policy caveat", () => {
    expect(byName.get("handleDialog")!.description).toContain("main-world");
  });

  it("extends click, fillInput, screenshot and waitFor", () => {
    expect(Object.keys(props("click"))).toEqual(
      expect.arrayContaining(["doubleClick", "button", "modifiers"])
    );
    expect(Object.keys(props("fillInput"))).toEqual(
      expect.arrayContaining(["slowly", "submit"])
    );
    expect(Object.keys(props("screenshot"))).toEqual(
      expect.arrayContaining(["fullPage", "format", "scale"])
    );
    expect(Object.keys(props("waitFor"))).toEqual(
      expect.arrayContaining(["text", "textGone"])
    );
  });
});
