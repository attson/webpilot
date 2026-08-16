import { describe, it, expect } from "vitest";
import { Coordinator, FakeClock, FakeIdGen, type Worker } from "@atwebpilot/coordinator";
import type { Result } from "@atwebpilot/shared/protocol";
import { buildToolList, dispatchCall } from "../src/mcp-server";

function fakeWorker(): Worker {
  return {
    id: "w1", fingerprint: { ext_hash: "x", os: "mac", chrome: "120" },
    capabilities: new Set(["read:dom"]), attended: true, labels: new Set(),
    available_tabs: [{ tab_id: "42", url: "https://example.org" }],
    saved_tools: [], protocol_version: 1, connected_at: 0, last_heartbeat_at: 0
  };
}
const okResult: Result = { type: "RESULT", nonce: "n", ts: 1, protocol_version: 1, req_id: "req_1", ok: true, return: { ok: 1 } };
function deps() {
  const coordinator = new Coordinator({ hub: {} as any, clock: new FakeClock(0), idGen: new FakeIdGen() });
  coordinator.registerWorker(fakeWorker());
  return { coordinator, hub: { exec: async () => okResult } as any };
}

describe("buildToolList", () => {
  it("lists skill bundle + 4 control + 54 browser tools, each with inputSchema", () => {
    const tools = buildToolList();
    expect(tools.length).toBe(59);
    const names = tools.map((t) => t.name);
    expect(names).toContain("atwebpilot_skill_read");
    expect(names).toContain("list_tabs");
    expect(names).toContain("open_session");
    expect(names).toContain("browser_click");
    for (const t of tools) expect(t.inputSchema).toBeTruthy();
  });
});

/** Narrows a CallResult's first block to text; image blocks have no `text`. */
function textOf(r: { content: Array<{ type: string; text?: string }> }): string {
  const b = r.content[0];
  if (b?.type !== "text" || typeof b.text !== "string") {
    throw new Error(`expected a text block, got ${b?.type}`);
  }
  return b.text;
}

describe("dispatchCall", () => {
  it("routes list_tabs and returns content", async () => {
    const r = await dispatchCall(deps(), "list_tabs", {});
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain("42");
  });
  it("returns isError for unknown tool", async () => {
    const r = await dispatchCall(deps(), "no_such_tool", {});
    expect(r.isError).toBe(true);
  });
  it("routes a generated browser_* tool", async () => {
    const d = deps();
    const open = await dispatchCall(d, "open_session", { tab_id: "42" });
    const session_id = JSON.parse(textOf(open)).session_id;
    const r = await dispatchCall(d, "browser_snapshotDOM", { session_id });
    expect(r.isError).toBeFalsy();
  });
});

describe("image results", () => {
  function imageDeps() {
    const coordinator = new Coordinator({
      hub: {} as any,
      clock: new FakeClock(0),
      idGen: new FakeIdGen()
    });
    coordinator.registerWorker(fakeWorker());
    const shot: Result = {
      type: "RESULT", nonce: "n", ts: 1, protocol_version: 1, req_id: "req_1", ok: true,
      return: { data: "QUJD", media_type: "image/png", byteLen: 3 }
    };
    return { coordinator, hub: { exec: async () => shot } as any };
  }

  it("returns a screenshot as an image content block", async () => {
    const d = imageDeps();
    const open = await dispatchCall(d, "open_session", { tab_id: "42" });
    const session_id = JSON.parse(textOf(open)).session_id;
    const r = await dispatchCall(d, "browser_screenshot", { session_id });
    expect(r.isError).toBeFalsy();
    expect(r.content[0]).toEqual({ type: "image", data: "QUJD", mimeType: "image/png" });
  });

  it("falls back to text when the payload is not an image", async () => {
    const d = deps();
    const open = await dispatchCall(d, "open_session", { tab_id: "42" });
    const session_id = JSON.parse(textOf(open)).session_id;
    const r = await dispatchCall(d, "browser_screenshot", { session_id });
    expect(r.content[0].type).toBe("text");
  });

  it("keeps json tools on text blocks", async () => {
    const d = deps();
    const open = await dispatchCall(d, "open_session", { tab_id: "42" });
    const session_id = JSON.parse(textOf(open)).session_id;
    const r = await dispatchCall(d, "browser_click", { session_id, selector: ".x" });
    expect(r.content[0].type).toBe("text");
  });
});
