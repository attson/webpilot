import { describe, it, expect } from "vitest";
import { Coordinator, FakeClock, FakeIdGen, type Worker } from "@atwebpilot/coordinator";
import type { Result } from "@atwebpilot/shared/protocol";
import {
  handleListTabs, handleOpenSession, handleCloseSession, handleGetQuota, handleBrowserTool, type Deps, staticDeps
} from "../src/handlers";

function fakeWorker(): Worker {
  return {
    id: "w1", fingerprint: { ext_hash: "x", os: "mac", chrome: "120" },
    capabilities: new Set(["read:dom", "interact:form"]), attended: true, labels: new Set(),
    available_tabs: [{ tab_id: "42", url: "https://example.org", title: "Ex" }],
    saved_tools: [], protocol_version: 1, connected_at: 0, last_heartbeat_at: 0
  };
}

function makeDeps(execResult: Result): { deps: Deps; calls: any[] } {
  const clock = new FakeClock(1000);
  const coordinator = new Coordinator({ hub: {} as any, clock, idGen: new FakeIdGen() });
  coordinator.registerWorker(fakeWorker());
  const calls: any[] = [];
  const hub = { exec: async (worker_id: string, params: any) => { calls.push({ worker_id, params }); return execResult; } };
  return { deps: staticDeps(coordinator, hub as any), calls };
}

const okResult: Result = { type: "RESULT", nonce: "n", ts: 1, protocol_version: 1, req_id: "req_1", ok: true, return: { clicked: true } };

describe("control-plane handlers", () => {
  it("list_tabs returns the single worker's tabs", async () => {
    const { deps } = makeDeps(okResult);
    expect(await handleListTabs(deps)).toEqual({ tabs: [{ tab_id: "42", url: "https://example.org", title: "Ex" }] });
  });

  it("open_session → session_id; default scope = all capabilities", async () => {
    const { deps } = makeDeps(okResult);
    const { session_id } = await handleOpenSession(deps, { tab_id: "42" });
    expect(typeof session_id).toBe("string");
    const s = deps.peek()!.coordinator.sessions.get(session_id)!;
    expect(s.tab_id).toBe("42");
    expect(s.scope.has("submit:form")).toBe(true);
  });

  it("list_tabs errors when no worker connected", async () => {
    const clock = new FakeClock(0);
    const coordinator = new Coordinator({ hub: {} as any, clock, idGen: new FakeIdGen() });
    await expect(handleListTabs(staticDeps(coordinator, {} as any))).rejects.toThrow(
      /没有浏览器连入/
    );
  });

  it("close_session closes the session", async () => {
    const { deps } = makeDeps(okResult);
    const { session_id } = await handleOpenSession(deps, { tab_id: "42" });
    expect(await handleCloseSession(deps, { session_id })).toEqual({ ok: true });
    expect(deps.peek()!.coordinator.sessions.get(session_id)!.state).toBe("closed");
  });

  it("get_quota returns quota for open session", async () => {
    const { deps } = makeDeps(okResult);
    const { session_id } = await handleOpenSession(deps, { tab_id: "42" });
    const q = await handleGetQuota(deps, { session_id }) as { steps_used: number };
    expect(q.steps_used).toBe(0);
  });

  it("get_quota throws for unknown session", async () => {
    const { deps } = makeDeps(okResult);
    await expect(handleGetQuota(deps, { session_id: "nope" })).rejects.toThrow(/not found/);
  });
});

describe("handleBrowserTool", () => {
  it("validates, records quota, sends EXEC, returns RESULT.return", async () => {
    const { deps, calls } = makeDeps(okResult);
    const { session_id } = await handleOpenSession(deps, { tab_id: "42" });
    const gen = { name: "browser_click", builtinTool: "click", description: "", resultKind: "json" as const, stepKind: "tool" as const, inputSchema: {} as any };
    const out = await handleBrowserTool(deps, gen, { session_id, selector: ".b" });
    expect(out).toEqual({ clicked: true });
    expect(calls[0].params.step).toEqual({ kind: "tool", tool: "click", args: { selector: ".b" } });
    expect(calls[0].params.tab_id).toBe("42");
    expect(deps.peek()!.coordinator.quotaFor(session_id)!.steps_used).toBe(1);
  });

  it("maps httpRequest withCredentials → dangerous (httpCookied)", async () => {
    const { deps } = makeDeps(okResult);
    const { session_id } = await handleOpenSession(deps, { tab_id: "42" });
    const gen = { name: "browser_httpRequest", builtinTool: "httpRequest", description: "", resultKind: "json" as const, stepKind: "tool" as const, inputSchema: {} as any };
    await handleBrowserTool(deps, gen, { session_id, url: "https://x", withCredentials: true });
    expect(deps.peek()!.coordinator.quotaFor(session_id)!.dangerous_used).toBe(1);
  });

  it("throws on unknown session", async () => {
    const { deps } = makeDeps(okResult);
    const gen = { name: "browser_click", builtinTool: "click", description: "", resultKind: "json" as const, stepKind: "tool" as const, inputSchema: {} as any };
    await expect(handleBrowserTool(deps, gen, { session_id: "nope", selector: ".b" })).rejects.toThrow(/not found|SessionNotFound/);
  });

  it("throws when RESULT.ok is false", async () => {
    const bad: Result = { type: "RESULT", nonce: "n", ts: 1, protocol_version: 1, req_id: "req_1", ok: false, error: { code: "PageScriptError", message: "boom", retryable: false } };
    const { deps } = makeDeps(bad);
    const { session_id } = await handleOpenSession(deps, { tab_id: "42" });
    const gen = { name: "browser_click", builtinTool: "click", description: "", resultKind: "json" as const, stepKind: "tool" as const, inputSchema: {} as any };
    await expect(handleBrowserTool(deps, gen, { session_id, selector: ".b" })).rejects.toThrow(/boom/);
  });
});
