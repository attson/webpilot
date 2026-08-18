import { describe, expect, it } from "vitest";
import type { LlmSettings } from "../src/types";

describe("LlmSettings injection defaults", () => {
  it("is a boolean field on LlmSettings", () => {
    const s: LlmSettings = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "",
      apiKeyMode: "persistent",
      maxRounds: 20,
      trustedDangerTools: [],
      defaultPermissionMode: "default",
      theme: "dark",
      maxContinuationNudges: 1,
      defaultChatMode: "compact",
      selfHealEnabled: true,
      maxSelfHealOutputTokens: 4096,
      defaultInjectionMode: "operate",
      defaultAssistantEnabled: true,
      siteInjectionRules: []
    };
    expect(s.defaultInjectionMode).toBe("operate");
    expect(s.defaultAssistantEnabled).toBe(true);
  });
});
