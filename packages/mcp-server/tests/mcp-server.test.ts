import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Coordinator, FakeClock, FakeIdGen, type Worker } from "@atwebpilot/coordinator";
import type { Result } from "@atwebpilot/shared/protocol";
import { buildToolList, createMcpServer, dispatchCall } from "../src/mcp-server";
import { staticDeps, type Deps } from "../src/handlers";

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
  const coordinator = new Coordinator({ hub: { send: async () => undefined } as any, clock: new FakeClock(0), idGen: new FakeIdGen() });
  coordinator.registerWorker(fakeWorker());
  return staticDeps(coordinator, { exec: async () => okResult } as any);
}

describe("buildToolList", () => {
  it("lists skill bundle + 4 control + the core browser tools by default, each with inputSchema", () => {
    const tools = buildToolList();
    const names = tools.map((t) => t.name);
    expect(names).toContain("atwebpilot_skill_read");
    expect(names).toContain("list_tabs");
    expect(names).toContain("open_session");
    expect(names).toContain("browser_click");
    expect(names).not.toContain("browser_snapshotDOM");
    expect(tools.length).toBe(1 + 4 + 32);
    for (const t of tools) expect(t.inputSchema).toBeTruthy();
  });

  it("describes the first-use pairing behavior", () => {
    const listTabs = buildToolList().find((tool) => tool.name === "list_tabs");
    expect(listTabs?.description).toContain("配对页");
    expect(listTabs?.description).toContain("90 秒");
  });
});

describe("pairing progress", () => {
  it("reports the pairing URL while list_tabs is still waiting", async () => {
    let release!: () => void;
    const workerReady = new Promise<void>((resolve) => { release = resolve; });
    const d: Deps = {
      ensure: async () => ({
        coordinator: {
          workers: {
            get: () => ({ available_tabs: [] })
          }
        } as any,
        hub: {} as any,
        port: 43443
      }),
      peek: () => null,
      pairUrl: () => "http://127.0.0.1:43443/pair",
      waitForWorker: async (_timeoutMs, onWaiting) => {
        await onWaiting?.("http://127.0.0.1:43443/pair");
        await workerReady;
        return "w1";
      }
    };
    const server = createMcpServer(d);
    const client = new Client({ name: "test-client", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const messages: string[] = [];

    const call = client.callTool(
      { name: "list_tabs", arguments: {} },
      undefined,
      { onprogress: (progress) => messages.push(progress.message ?? "") }
    );
    await vi.waitFor(() => expect(messages).toHaveLength(1));

    expect(messages[0]).toContain("http://127.0.0.1:43443/pair");
    release();
    await call;
    await Promise.all([client.close(), server.close()]);
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
    const r = await dispatchCall(d, "browser_getPageInfo", { session_id });
    expect(r.isError).toBeFalsy();
  });

  it("binds switchToTab and closeTab to the session tab", async () => {
    const coordinator = new Coordinator({
      hub: { send: async () => undefined } as any,
      clock: new FakeClock(0),
      idGen: new FakeIdGen()
    });
    coordinator.registerWorker(fakeWorker());
    const calls: Array<{ step: unknown }> = [];
    const d = staticDeps(coordinator, {
      exec: async (_workerId: string, params: { step: unknown }) => {
        calls.push(params);
        return okResult;
      }
    } as any);
    const open = await dispatchCall(d, "open_session", { tab_id: "42" });
    const session_id = JSON.parse(textOf(open)).session_id;

    await dispatchCall(d, "browser_switchToTab", { session_id });
    await dispatchCall(d, "browser_closeTab", { session_id });

    expect(calls.map((call) => call.step)).toEqual([
      { kind: "tool", tool: "switchToTab", args: { tabId: 42 } },
      { kind: "tool", tool: "closeTab", args: { tabId: 42 } }
    ]);
  });

  it("classifies read-only runJS as scanned and cookie access as unsafe", async () => {
    const coordinator = new Coordinator({
      hub: { send: async () => undefined } as any,
      clock: new FakeClock(0),
      idGen: new FakeIdGen()
    });
    coordinator.registerWorker(fakeWorker());
    const d = staticDeps(coordinator, { exec: async () => okResult } as any);
    const open = await dispatchCall(d, "open_session", { tab_id: "42" });
    const session_id = JSON.parse(textOf(open)).session_id;

    await dispatchCall(d, "browser_runJS", { session_id, source: "return getComputedStyle(document.body).display" });
    expect(coordinator.quotaFor(session_id)?.dangerous_used).toBe(0);

    await dispatchCall(d, "browser_runJS", { session_id, source: "return document.cookie" });
    expect(coordinator.quotaFor(session_id)?.dangerous_used).toBe(1);
  });
});

describe("image results", () => {
  function imageDeps() {
    const coordinator = new Coordinator({
      hub: { send: async () => undefined } as any,
      clock: new FakeClock(0),
      idGen: new FakeIdGen()
    });
    coordinator.registerWorker(fakeWorker());
    const shot: Result = {
      type: "RESULT", nonce: "n", ts: 1, protocol_version: 1, req_id: "req_1", ok: true,
      return: { data: "QUJD", media_type: "image/png", byteLen: 3 }
    };
    return staticDeps(coordinator, { exec: async () => shot } as any);
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
