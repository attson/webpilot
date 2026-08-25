import { describe, it, expect } from "vitest";
import { Catalog } from "../src/catalog";
import { WorkerRegistry } from "../src/worker-registry";
import { FakeClock } from "../src/clock";
import type { Worker } from "../src/types";

function w(id: string, tools: { id: string; url_pattern: string[]; hash?: string }[]): Worker {
  return {
    id,
    fingerprint: { ext_hash: "", os: "", chrome: "" },
    capabilities: new Set(),
    attended: true,
    labels: new Set(),
    available_tabs: [],
    saved_tools: tools.map((t) => ({ ...t, version: 1, hash: t.hash ?? "h" })),
    protocol_version: 1,
    connected_at: 0,
    last_heartbeat_at: 0
  };
}

describe("Catalog.listFor", () => {
  it("returns tools whose url_pattern matches session url", () => {
    const reg = new WorkerRegistry(new FakeClock());
    reg.register(w("w1", [{ id: "shop_v3", url_pattern: ["https://*.example.com/**"] }]));
    reg.register(w("w2", [{ id: "tb", url_pattern: ["https://*.taobao.com/**"] }]));
    const cat = new Catalog(reg);
    const out = cat.listFor("https://shop.example.com/goods.html");
    expect(out.map((t) => t.id)).toEqual(["shop_v3"]);
  });

  it("flags conflicting hashes when two workers expose same tool_id with different hashes", () => {
    const reg = new WorkerRegistry(new FakeClock());
    reg.register(w("w1", [{ id: "shop", url_pattern: ["https://*.example.com/**"], hash: "h1" }]));
    reg.register(w("w2", [{ id: "shop", url_pattern: ["https://*.example.com/**"], hash: "h2" }]));
    const cat = new Catalog(reg);
    const out = cat.listFor("https://shop.example.com/");
    expect(out).toHaveLength(1);
    expect(out[0].conflicting_hashes).toBe(true);
    expect(out[0].provided_by_workers.sort()).toEqual(["w1", "w2"]);
  });
});

describe("Catalog.lookup", () => {
  it("returns the entry by tool_id when url matches", () => {
    const reg = new WorkerRegistry(new FakeClock());
    reg.register(w("w1", [{ id: "shop_v3", url_pattern: ["https://*.example.com/**"] }]));
    const cat = new Catalog(reg);
    const entry = cat.lookup("shop_v3", "https://shop.example.com/");
    expect(entry?.id).toBe("shop_v3");
  });

  it("returns undefined when url does not match", () => {
    const reg = new WorkerRegistry(new FakeClock());
    reg.register(w("w1", [{ id: "shop_v3", url_pattern: ["https://*.example.com/**"] }]));
    const cat = new Catalog(reg);
    expect(cat.lookup("shop_v3", "https://example.com")).toBeUndefined();
  });
});
