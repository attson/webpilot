import { describe, it, expect } from "vitest";
import { WorkerRegistry } from "../src/worker-registry";
import { FakeClock } from "../src/clock";
import type { Worker } from "../src/types";

function makeWorker(id: string, overrides: Partial<Worker> = {}): Worker {
  return {
    id,
    fingerprint: { ext_hash: "h", os: "darwin", chrome: "120" },
    capabilities: new Set(["read:dom", "interact:form"]),
    attended: true,
    labels: new Set(),
    available_tabs: [],
    saved_tools: [],
    protocol_version: 1,
    connected_at: 0,
    last_heartbeat_at: 0,
    ...overrides
  };
}

describe("WorkerRegistry.register", () => {
  it("adds a new worker", () => {
    const clock = new FakeClock(1000);
    const r = new WorkerRegistry(clock);
    r.register(makeWorker("w1"));
    expect(r.get("w1")?.id).toBe("w1");
    expect(r.list().length).toBe(1);
  });

  it("rejects duplicate registration", () => {
    const clock = new FakeClock();
    const r = new WorkerRegistry(clock);
    r.register(makeWorker("w1"));
    expect(() => r.register(makeWorker("w1"))).toThrow(/already registered/);
  });
});

describe("WorkerRegistry.unregister", () => {
  it("removes a worker", () => {
    const clock = new FakeClock();
    const r = new WorkerRegistry(clock);
    r.register(makeWorker("w1"));
    r.unregister("w1");
    expect(r.get("w1")).toBeUndefined();
  });

  it("unregister missing worker is a no-op", () => {
    const r = new WorkerRegistry(new FakeClock());
    expect(() => r.unregister("missing")).not.toThrow();
  });
});

describe("WorkerRegistry.heartbeat", () => {
  it("updates last_heartbeat_at", () => {
    const clock = new FakeClock(1000);
    const r = new WorkerRegistry(clock);
    r.register(makeWorker("w1", { last_heartbeat_at: 1000 }));
    clock.set(2000);
    r.heartbeat("w1");
    expect(r.get("w1")?.last_heartbeat_at).toBe(2000);
  });

  it("heartbeat for missing worker is a no-op", () => {
    const r = new WorkerRegistry(new FakeClock());
    expect(() => r.heartbeat("missing")).not.toThrow();
  });
});

describe("WorkerRegistry.pickForUrl", () => {
  it("returns workers whose saved_tools cover the url", () => {
    const r = new WorkerRegistry(new FakeClock());
    r.register(
      makeWorker("w1", {
        saved_tools: [
          { id: "shop", version: 1, hash: "h", url_pattern: ["https://*.example.com/**"] }
        ]
      })
    );
    r.register(makeWorker("w2"));
    const matches = r.pickForUrl("https://shop.example.com/goods.html?id=1");
    expect(matches.map((w) => w.id)).toEqual(["w1"]);
  });

  it("returns empty when no worker matches", () => {
    const r = new WorkerRegistry(new FakeClock());
    r.register(makeWorker("w1"));
    expect(r.pickForUrl("https://example.com")).toEqual([]);
  });

  it("prefers workers with matching labels", () => {
    const r = new WorkerRegistry(new FakeClock());
    r.register(
      makeWorker("w1", {
        labels: new Set(["logged-in:shop"]),
        saved_tools: [
          { id: "shop", version: 1, hash: "h", url_pattern: ["https://*.example.com/**"] }
        ]
      })
    );
    r.register(
      makeWorker("w2", {
        saved_tools: [
          { id: "shop", version: 1, hash: "h", url_pattern: ["https://*.example.com/**"] }
        ]
      })
    );
    const matches = r.pickForUrl("https://shop.example.com/", ["logged-in:shop"]);
    expect(matches[0].id).toBe("w1");
  });
});
