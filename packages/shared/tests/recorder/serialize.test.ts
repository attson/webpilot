import { describe, expect, it } from "vitest";
import { serializeArg } from "../../src/recorder/serialize";

describe("serializeArg", () => {
  it("renders primitives", () => {
    expect(serializeArg("hi")).toBe("hi");
    expect(serializeArg(42)).toBe("42");
    expect(serializeArg(null)).toBe("null");
    expect(serializeArg(undefined)).toBe("undefined");
    expect(serializeArg(true)).toBe("true");
  });

  it("keeps name, message and stack for errors", () => {
    const e = new Error("boom");
    e.stack = "Error: boom\n    at x";
    const out = serializeArg(e);
    expect(out).toContain("Error");
    expect(out).toContain("boom");
    expect(out).toContain("at x");
  });

  it("survives cycles", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(serializeArg(a)).toContain("[Circular]");
  });

  it("truncates past maxDepth", () => {
    expect(serializeArg({ a: { b: { c: { d: 1 } } } }, { maxDepth: 2 })).toContain("[Object]");
  });

  it("caps output size and marks the cut", () => {
    const out = serializeArg("x".repeat(5000), { maxBytes: 100 });
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out).toContain("truncated");
  });

  it("renders arrays and functions", () => {
    expect(serializeArg([1, "a"])).toBe('[1, a]');
    expect(serializeArg(function named() {})).toBe("[Function named]");
  });
});
