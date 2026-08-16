import { describe, expect, it } from "vitest";
import { Coordinator, FakeClock, FakeIdGen, type Worker } from "@atwebpilot/coordinator";
import { LEGACY_TOOLS, buildToolList } from "../src/mcp-server";
import { helloToWorker } from "../src/wire";
import type { Hello } from "@atwebpilot/shared/protocol";

function worker(supported?: string[]): Worker {
  return {
    id: "w1",
    fingerprint: { ext_hash: "x", os: "mac", chrome: "120" },
    capabilities: new Set(["read:dom"]),
    supported_tools: supported ? new Set(supported) : undefined,
    attended: true,
    labels: new Set(),
    available_tabs: [{ tab_id: "42", url: "https://example.org" }],
    saved_tools: [],
    protocol_version: 1,
    connected_at: 0,
    last_heartbeat_at: 0
  };
}

function depsWith(w?: Worker) {
  const coordinator = new Coordinator({
    hub: {} as never,
    clock: new FakeClock(0),
    idGen: new FakeIdGen()
  });
  if (w) coordinator.registerWorker(w);
  return { coordinator, hub: { exec: async () => ({}) } as never };
}

const browserNames = (list: Array<{ name: string }>) =>
  list.map((t) => t.name).filter((n) => n.startsWith("browser_"));

describe("supported_tools negotiation", () => {
  it("advertises the full surface when no worker has connected yet", () => {
    // tools/list is routinely called before the browser attaches; answering
    // with nothing then would be worse than answering optimistically.
    expect(browserNames(buildToolList(depsWith()))).toHaveLength(54);
  });

  it("intersects against what the worker reports", () => {
    const list = buildToolList(depsWith(worker(["click", "snapshotDOM", "drag"])));
    expect(browserNames(list).sort()).toEqual([
      "browser_click",
      "browser_drag",
      "browser_snapshotDOM"
    ]);
  });

  it("keeps the control plane and skill tool regardless", () => {
    const names = buildToolList(depsWith(worker(["click"]))).map((t) => t.name);
    for (const n of [
      "atwebpilot_skill_read",
      "list_tabs",
      "open_session",
      "close_session",
      "get_quota"
    ]) {
      expect(names).toContain(n);
    }
  });

  it("falls back to the legacy surface for an extension that predates the field", () => {
    const list = buildToolList(depsWith(worker(undefined)));
    expect(browserNames(list)).toHaveLength(LEGACY_TOOLS.length);
    expect(browserNames(list)).toContain("browser_click");
    expect(browserNames(list)).not.toContain("browser_drag");
  });

  it("never advertises a tool the worker cannot run", () => {
    const supported = ["click", "consoleMessages"];
    const list = browserNames(buildToolList(depsWith(worker(supported))));
    for (const n of list) {
      expect(supported.map((s) => `browser_${s}`)).toContain(n);
    }
  });
});

describe("helloToWorker", () => {
  const base: Hello = {
    type: "HELLO",
    nonce: "n",
    ts: 1,
    protocol_version: 1,
    worker_id: "w1",
    fingerprint: { ext_hash: "x", os: "mac", chrome: "120" },
    capabilities: ["read:dom", "not-a-capability"],
    attended: true,
    available_tabs: [],
    saved_tools: [],
    labels: []
  };

  it("carries supported_tools through when present", () => {
    const w = helloToWorker({ ...base, supported_tools: ["click", "drag"] }, 0);
    expect(w.supported_tools).toEqual(new Set(["click", "drag"]));
  });

  it("leaves supported_tools undefined when absent", () => {
    expect(helloToWorker(base, 0).supported_tools).toBeUndefined();
  });

  it("still filters unknown capability strings", () => {
    expect(helloToWorker(base, 0).capabilities).toEqual(new Set(["read:dom"]));
  });
});
