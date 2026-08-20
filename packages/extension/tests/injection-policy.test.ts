import { describe, expect, it } from "vitest";
import {
  DEFAULT_INJECTION_MODE,
  policySettingsFrom,
  resolvePolicyForHostname
} from "@/injection-policy";

describe("extension injection-policy defaults", () => {
  it("defaults missing settings to diagnostic mode", () => {
    expect(DEFAULT_INJECTION_MODE).toBe("diagnostic");
    expect(policySettingsFrom(undefined).defaultInjectionMode).toBe("diagnostic");
    expect(resolvePolicyForHostname("example.com", undefined)).toMatchObject({
      injectionMode: "diagnostic",
      assistantEnabled: true
    });
  });

  it("falls back to diagnostic mode for an invalid persisted value", () => {
    expect(policySettingsFrom({ defaultInjectionMode: "unknown" }).defaultInjectionMode)
      .toBe("diagnostic");
  });
});
