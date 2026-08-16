import { describe, expect, it } from "vitest";
import { Ring } from "../../src/recorder/ring";

describe("Ring", () => {
  it("keeps insertion order under capacity", () => {
    const r = new Ring<number>(3);
    r.push(1);
    r.push(2);
    expect(r.toArray()).toEqual([1, 2]);
    expect(r.dropped).toBe(0);
  });

  it("drops oldest and counts drops past capacity", () => {
    const r = new Ring<number>(3);
    for (const n of [1, 2, 3, 4, 5]) r.push(n);
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.dropped).toBe(2);
  });

  it("clear resets contents but keeps the drop counter", () => {
    const r = new Ring<number>(2);
    for (const n of [1, 2, 3]) r.push(n);
    r.clear();
    expect(r.toArray()).toEqual([]);
    expect(r.dropped).toBe(1);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => new Ring<number>(0)).toThrow("capacity");
  });
});
