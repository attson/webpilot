import type { InjectionMode, SiteInjectionRule } from "./types";

export type ResolvedInjectionPolicy = {
  injectionMode: InjectionMode;
  assistantEnabled: boolean;
  matchedPattern?: string;
};

export type HostPatternResult =
  | { ok: true; pattern: string }
  | { ok: false; error: string };

export function normalizeHostPattern(value: string): HostPatternResult {
  const pattern = value.trim().toLowerCase().replace(/\.$/, "");
  if (!pattern) return { ok: false, error: "站点不能为空" };
  if (pattern.includes("://") || pattern.includes("/") || pattern.includes(":")) {
    return { ok: false, error: "只填写 hostname，不含协议、端口或路径" };
  }
  const hostname = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
  if (!hostname || hostname.includes("*") || hostname.length > 253) {
    return { ok: false, error: "通配符只能写在开头，例如 *.example.com" };
  }
  if (hostname === "localhost") return { ok: true, pattern };
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split(".").every((part) => Number(part) <= 255)
      ? { ok: true, pattern }
      : { ok: false, error: "IP 地址无效" };
  }
  const valid = hostname.split(".").every((label) =>
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
  return valid ? { ok: true, pattern } : { ok: false, error: "hostname 格式无效" };
}

export function hostMatchesPattern(hostname: string, pattern: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const normalized = pattern.trim().toLowerCase().replace(/\.$/, "");
  if (normalized.startsWith("*.")) {
    const suffix = normalized.slice(2);
    return host.length > suffix.length && host.endsWith(`.${suffix}`);
  }
  return host === normalized;
}

export function resolveInjectionPolicy(input: {
  hostname: string;
  defaultInjectionMode: InjectionMode;
  defaultAssistantEnabled: boolean;
  rules: SiteInjectionRule[];
}): ResolvedInjectionPolicy {
  const matches = input.rules
    .map((rule, index) => ({ rule, index, score: specificity(rule.pattern) }))
    .filter(({ rule }) => normalizeHostPattern(rule.pattern).ok && hostMatchesPattern(input.hostname, rule.pattern))
    .sort((a, b) => b.score - a.score || b.index - a.index);
  const matched = matches[0];
  const injectionMatch = matches.find(({ rule }) => rule.injectionMode !== "inherit");
  const assistantMatch = matches.find(({ rule }) => rule.assistant !== "inherit");

  const injectionMode = injectionMatch
    ? injectionMatch.rule.injectionMode as InjectionMode
    : input.defaultInjectionMode;
  const requestedAssistant = assistantMatch
    ? assistantMatch.rule.assistant === "enabled"
    : input.defaultAssistantEnabled;

  return {
    injectionMode,
    assistantEnabled: injectionMode !== "disabled" && requestedAssistant,
    ...(matched ? { matchedPattern: matched.rule.pattern } : {})
  };
}

export function injectionModeRank(mode: InjectionMode): number {
  return { disabled: 0, read: 1, operate: 2, diagnostic: 3 }[mode];
}

function specificity(pattern: string): number {
  const normalized = pattern.trim().toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("*.") ? normalized.length : 10_000 + normalized.length;
}
