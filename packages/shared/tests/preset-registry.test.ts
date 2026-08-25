// packages/shared/tests/preset-registry.test.ts
import { describe, it, expect } from "vitest";
import { PRESETS } from "../src/presets";
import { PresetSchema } from "../src/preset";

describe("PRESETS registry", () => {
  it("contains the 11 supported generic and site presets", () => {
    expect(PRESETS).toHaveLength(11);
  });

  it("all entries are valid Preset", () => {
    for (const p of PRESETS) {
      const r = PresetSchema.safeParse(p);
      if (!r.success) throw new Error(`${p.id}: ${r.error.message}`);
    }
  });
  it("has unique ids", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
