import { describe, it, expect } from "vitest";
import { ToolSchema } from "../src/messages";

describe("Tool.origin optional", () => {
  it("accepts tool without origin (backward compat)", () => {
    const t = {
      id: "u1", name: "u1", urlPatterns: ["https://a/*"],
      description: "", kind: "steps", steps: [{ kind: "tool", tool: "querySelector", args: {} }], versions: [
        { version: 1, kind: "steps", steps: [{ kind: "tool", tool: "querySelector", args: {} }], outputSchema: {}, createdAt: 0 }
      ],
      outputSchema: {},
      createdAt: 0, updatedAt: 0, stats: { runs: 0 }
    };
    const r = ToolSchema.safeParse(t);
    expect(r.success).toBe(true);
  });
  it("accepts tool with preset origin", () => {
    const t = {
      id: "u1", name: "u1", urlPatterns: ["https://a/*"],
      description: "", kind: "steps", steps: [{ kind: "tool", tool: "querySelector", args: {} }], versions: [
        { version: 1, kind: "steps", steps: [{ kind: "tool", tool: "querySelector", args: {} }], outputSchema: {}, createdAt: 0 }
      ],
      outputSchema: {},
      createdAt: 0, updatedAt: 0, stats: { runs: 0 },
      origin: { kind: "preset", presetId: "example-product-collect", presetVersion: 1 }
    };
    expect(ToolSchema.safeParse(t).success).toBe(true);
  });
});
