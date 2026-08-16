import { describe, expect, it } from "vitest";
import { filterConsole, filterNetwork } from "../../src/recorder/filter";
import type { ConsoleEntry, NetworkEntry } from "../../src/recorder/types";

const c = (id: number, level: ConsoleEntry["level"], text: string): ConsoleEntry => ({
  id,
  ts: id,
  level,
  text
});

const n = (id: number, url: string, extra: Partial<NetworkEntry> = {}): NetworkEntry => ({
  id,
  ts: id,
  method: "GET",
  url,
  ...extra
});

describe("filterConsole", () => {
  const all = [c(1, "log", "a"), c(2, "error", "b"), c(3, "warn", "c"), c(4, "error", "d")];

  it("filters by level", () => {
    expect(filterConsole(all, { level: "error" }).map((e) => e.id)).toEqual([2, 4]);
  });

  it("drops entries at or below sinceId", () => {
    expect(filterConsole(all, { sinceId: 2 }).map((e) => e.id)).toEqual([3, 4]);
  });

  it("keeps the most recent entries when limited", () => {
    expect(filterConsole(all, { limit: 2 }).map((e) => e.id)).toEqual([3, 4]);
  });

  it("returns everything with an empty query", () => {
    expect(filterConsole(all, {})).toHaveLength(4);
  });
});

describe("filterNetwork", () => {
  const all = [
    n(1, "https://a.test/api/users"),
    n(2, "https://a.test/style.css", { observed: true }),
    n(3, "https://b.test/api/orders", { method: "POST", status: 500 }),
    n(4, "https://b.test/api/users", { status: 200 })
  ];

  it("hides observed entries unless includeStatic", () => {
    expect(filterNetwork(all, {}).map((e) => e.id)).toEqual([1, 3, 4]);
    expect(filterNetwork(all, { includeStatic: true }).map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it("matches urlPattern as a substring", () => {
    expect(filterNetwork(all, { urlPattern: "/api/users" }).map((e) => e.id)).toEqual([1, 4]);
  });

  it("matches urlPattern as a regex when slash-wrapped", () => {
    expect(filterNetwork(all, { urlPattern: "/b\\.test.*orders/" }).map((e) => e.id)).toEqual([3]);
  });

  it("falls back to substring on an invalid regex", () => {
    expect(filterNetwork(all, { urlPattern: "/[unclosed/" })).toEqual([]);
  });

  it("filters by method and status", () => {
    expect(filterNetwork(all, { method: "post" }).map((e) => e.id)).toEqual([3]);
    expect(filterNetwork(all, { status: 200 }).map((e) => e.id)).toEqual([4]);
  });

  it("applies sinceId before limiting", () => {
    expect(filterNetwork(all, { sinceId: 1, limit: 1 }).map((e) => e.id)).toEqual([4]);
  });
});
