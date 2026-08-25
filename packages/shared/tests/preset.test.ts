// packages/shared/tests/preset.test.ts
import { describe, it, expect } from "vitest";
import { PresetSchema, PromptPresetSchema, ToolPresetSchema } from "../src/preset";

describe("PresetSchema", () => {
  it("accepts a valid prompt preset", () => {
    const raw = {
      id: "wikipedia-summary",
      name: "维基百科总结",
      description: "三段总结",
      category: "content",
      urlPatterns: ["https://*.wikipedia.org/**"],
      version: 1,
      kind: "prompt",
      prompt: "用三段总结此页"
    };
    expect(PresetSchema.safeParse(raw).success).toBe(true);
    expect(PromptPresetSchema.safeParse(raw).success).toBe(true);
  });

  it("accepts a valid tool preset", () => {
    const raw = {
      id: "example-product-collect",
      name: "商品采集示例",
      description: "主图+评论",
      category: "ecommerce",
      urlPatterns: ["https://shop.example.com/products/**"],
      version: 1,
      kind: "tool",
      steps: [{ kind: "tool", tool: "snapshotDOM", args: {} }]
    };
    expect(PresetSchema.safeParse(raw).success).toBe(true);
    expect(ToolPresetSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects invalid category", () => {
    const raw = { id: "x", name: "x", description: "x", category: "unknown",
                  urlPatterns: ["*"], version: 1, kind: "prompt", prompt: "hi" };
    expect(PresetSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects empty urlPatterns", () => {
    const raw = { id: "x", name: "x", description: "x", category: "content",
                  urlPatterns: [], version: 1, kind: "prompt", prompt: "x" };
    expect(PresetSchema.safeParse(raw).success).toBe(false);
  });
});
