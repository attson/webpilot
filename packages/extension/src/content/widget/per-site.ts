const HIDDEN_KEY = "atwebpilot.widget.hiddenHosts";
const ALLOWED_KEY = "atwebpilot.widget.allowedHosts";
const FAB_KEY = "atwebpilot.widget.fabPos";
const SIZE_KEY = "atwebpilot.widget.panelSize";
const DEFAULT_SIZE = { w: 320, h: 480 };

export async function getHiddenHosts(): Promise<string[]> {
  const raw = (await chrome.storage.local.get([HIDDEN_KEY]))[HIDDEN_KEY];
  return Array.isArray(raw) ? [...raw] : [];
}

export async function getAllowedHosts(): Promise<string[]> {
  const raw = (await chrome.storage.local.get([ALLOWED_KEY]))[ALLOWED_KEY];
  return Array.isArray(raw) ? [...raw] : [];
}

export type WidgetSiteMode = "all" | "allowlist";

export type ParsedHostRules =
  | { ok: true; rules: string[] }
  | { ok: false; invalid: string[] };

export function parseHostRules(value: string): ParsedHostRules {
  const rules = Array.from(new Set(value
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)));
  const invalid = rules.filter((rule) => !isValidHostRule(rule));
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, rules };
}

export function matchesHostRule(hostname: string, rule: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const normalizedRule = rule.trim().toLowerCase().replace(/\.$/, "");
  if (normalizedRule.startsWith("*.")) {
    const suffix = normalizedRule.slice(2);
    return host.length > suffix.length && host.endsWith(`.${suffix}`);
  }
  return host === normalizedRule;
}

export function shouldMountOnHost(
  hostname: string,
  mode: WidgetSiteMode,
  allowedHosts: string[],
  hiddenHosts: string[]
): boolean {
  if (hiddenHosts.some((rule) => matchesHostRule(hostname, rule))) return false;
  return mode === "all" || allowedHosts.some((rule) => matchesHostRule(hostname, rule));
}

export async function setAllowedHosts(hosts: string[]): Promise<void> {
  await chrome.storage.local.set({ [ALLOWED_KEY]: hosts });
}

export async function setHiddenHosts(hosts: string[]): Promise<void> {
  await chrome.storage.local.set({ [HIDDEN_KEY]: hosts });
}

export const WIDGET_SITE_STORAGE_KEYS = {
  settings: "atwebpilot.llm",
  allowed: ALLOWED_KEY,
  hidden: HIDDEN_KEY
} as const;

function isValidHostRule(rule: string): boolean {
  if (rule.includes("://") || rule.includes("/") || rule.includes(":")) return false;
  const hostname = rule.startsWith("*.") ? rule.slice(2) : rule;
  if (!hostname || hostname.includes("*") || hostname.length > 253) return false;
  if (hostname === "localhost") return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split(".").every((part) => Number(part) <= 255);
  }
  return hostname.split(".").every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}

export async function isHostHidden(host: string): Promise<boolean> {
  return (await getHiddenHosts()).some((rule) => matchesHostRule(host, rule));
}

export async function hideHost(host: string): Promise<void> {
  const cur = await getHiddenHosts();
  const normalized = host.trim().toLowerCase().replace(/\.$/, "");
  if (cur.some((rule) => rule === normalized)) return;
  await setHiddenHosts([...cur, normalized]);
}

export async function getFabPos(host: string): Promise<{ x: number; y: number } | null> {
  const raw = (await chrome.storage.local.get([FAB_KEY]))[FAB_KEY];
  const map = (raw && typeof raw === "object") ? raw as Record<string, { x: number; y: number }> : {};
  return map[host] ?? null;
}

export async function setFabPos(host: string, pos: { x: number; y: number }): Promise<void> {
  const raw = (await chrome.storage.local.get([FAB_KEY]))[FAB_KEY];
  const map = (raw && typeof raw === "object") ? raw as Record<string, { x: number; y: number }> : {};
  map[host] = pos;
  await chrome.storage.local.set({ [FAB_KEY]: map });
}

export async function getPanelSize(): Promise<{ w: number; h: number }> {
  const raw = (await chrome.storage.local.get([SIZE_KEY]))[SIZE_KEY];
  if (raw && typeof raw === "object" && typeof (raw as any).w === "number" && typeof (raw as any).h === "number") {
    return { w: (raw as any).w, h: (raw as any).h };
  }
  return { ...DEFAULT_SIZE };
}

export async function setPanelSize(size: { w: number; h: number }): Promise<void> {
  await chrome.storage.local.set({ [SIZE_KEY]: size });
}
