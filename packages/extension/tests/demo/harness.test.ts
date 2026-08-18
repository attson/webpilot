import { beforeEach, describe, expect, it } from "vitest";
import { runDemoStep } from "../../demo/harness";
import { COMMENTS_ID, EXPAND_BUTTON_ID, mountMockPage } from "../../demo/page";

describe("demo harness", () => {
  beforeEach(() => {
    document.body.innerHTML = "<div id='root'></div>";
    mountMockPage(document.getElementById("root")!);
  });

  it("runs the real content tool against the mock page", async () => {
    // This is the demo's whole claim: the visible change is produced by the
    // product's own click tool, not by demo choreography.
    expect(document.querySelector<HTMLElement>(`#${COMMENTS_ID}`)!.hidden).toBe(true);
    await runDemoStep({ kind: "tool", tool: "click", args: { selector: `#${EXPAND_BUTTON_ID}` } });
    expect(document.querySelector<HTMLElement>(`#${COMMENTS_ID}`)!.hidden).toBe(false);
  });

  it("extracts real text from the page", async () => {
    await runDemoStep({ kind: "tool", tool: "click", args: { selector: `#${EXPAND_BUTTON_ID}` } });
    const out = (await runDemoStep({
      kind: "tool",
      tool: "extractText",
      args: { selector: `#${COMMENTS_ID}` }
    })) as unknown as { text?: string } | string;
    const text = typeof out === "string" ? out : (out.text ?? JSON.stringify(out));
    expect(text).toContain("腰托");
  });

  it("serves canned results for extension-only tools", async () => {
    const shot = (await runDemoStep({ kind: "tool", tool: "screenshot", args: {} })) as {
      media_type: string;
    };
    expect(shot.media_type).toBe("image/png");
  });

  it("refuses runJS", async () => {
    const out = (await runDemoStep({ kind: "js", source: "return 1" })) as { ok: boolean };
    expect(out.ok).toBe(false);
  });

  it("rejects a step with no tool", async () => {
    await expect(runDemoStep({})).rejects.toThrow("no tool");
  });

  it("propagates a tool error rather than swallowing it", async () => {
    await expect(
      runDemoStep({ kind: "tool", tool: "click", args: { selector: "#nope" } })
    ).rejects.toThrow();
  });
});
