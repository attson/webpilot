import { describe, expect, it } from "vitest";
import { normalizeHostPattern, resolveInjectionPolicy } from "../src/injection-policy";

describe("injection policy", () => {
  it("normalizes supported hostname patterns", () => {
    expect(normalizeHostPattern(" *.Example.COM. ")).toEqual({ ok: true, pattern: "*.example.com" });
    expect(normalizeHostPattern("https://example.com/x").ok).toBe(false);
    expect(normalizeHostPattern("foo.*.com").ok).toBe(false);
  });

  it("prefers exact and more-specific rules", () => {
    const base = {
      hostname: "admin.example.com",
      defaultInjectionMode: "read" as const,
      defaultAssistantEnabled: false,
      rules: [
        { pattern: "*.com", injectionMode: "operate" as const, assistant: "inherit" as const },
        { pattern: "*.example.com", injectionMode: "diagnostic" as const, assistant: "inherit" as const },
        { pattern: "admin.example.com", injectionMode: "disabled" as const, assistant: "enabled" as const }
      ]
    };
    expect(resolveInjectionPolicy(base)).toEqual({
      injectionMode: "disabled",
      assistantEnabled: false,
      matchedPattern: "admin.example.com"
    });
  });

  it("resolves injection and assistant overrides independently", () => {
    expect(resolveInjectionPolicy({
      hostname: "www.example.com",
      defaultInjectionMode: "diagnostic",
      defaultAssistantEnabled: true,
      rules: [{ pattern: "*.example.com", injectionMode: "inherit", assistant: "disabled" }]
    })).toEqual({
      injectionMode: "diagnostic",
      assistantEnabled: false,
      matchedPattern: "*.example.com"
    });
  });

  it("inherits each field through more-specific rules independently", () => {
    expect(resolveInjectionPolicy({
      hostname: "admin.example.com",
      defaultInjectionMode: "read",
      defaultAssistantEnabled: true,
      rules: [
        { pattern: "*.example.com", injectionMode: "diagnostic", assistant: "inherit" },
        { pattern: "admin.example.com", injectionMode: "inherit", assistant: "disabled" }
      ]
    })).toEqual({
      injectionMode: "diagnostic",
      assistantEnabled: false,
      matchedPattern: "admin.example.com"
    });
  });

  it("lets later equal-specificity rules win", () => {
    const result = resolveInjectionPolicy({
      hostname: "example.com",
      defaultInjectionMode: "read",
      defaultAssistantEnabled: false,
      rules: [
        { pattern: "example.com", injectionMode: "operate", assistant: "inherit" },
        { pattern: "example.com", injectionMode: "diagnostic", assistant: "enabled" }
      ]
    });
    expect(result.injectionMode).toBe("diagnostic");
    expect(result.assistantEnabled).toBe(true);
  });
});
