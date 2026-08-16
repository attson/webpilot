import type { ConsoleEntry, ConsoleQuery, NetworkEntry, NetworkQuery } from "./types";

/** Keeps the most recent `limit` entries — recency is what an agent asks for. */
function tail<T>(items: T[], limit?: number): T[] {
  if (limit == null || limit <= 0 || items.length <= limit) return items;
  return items.slice(items.length - limit);
}

/**
 * `/re/` or `/re/flags` is treated as a regex; anything else is a
 * case-insensitive substring. An unparseable regex degrades to substring
 * matching rather than throwing — a bad pattern should return nothing, not
 * break the tool call.
 */
function matchUrl(url: string, pattern: string): boolean {
  const wrapped = pattern.match(/^\/(.*)\/([a-z]*)$/);
  if (wrapped) {
    try {
      return new RegExp(wrapped[1], wrapped[2] || undefined).test(url);
    } catch {
      // fall through to substring matching
    }
  }
  return url.toLowerCase().includes(pattern.toLowerCase());
}

export function filterConsole(entries: ConsoleEntry[], q: ConsoleQuery): ConsoleEntry[] {
  let out = entries;
  const since = q.sinceId;
  if (since != null) out = out.filter((e) => e.id > since);
  if (q.level) out = out.filter((e) => e.level === q.level);
  return tail(out, q.limit);
}

export function filterNetwork(entries: NetworkEntry[], q: NetworkQuery): NetworkEntry[] {
  let out = entries;
  const since = q.sinceId;
  if (since != null) out = out.filter((e) => e.id > since);
  if (!q.includeStatic) out = out.filter((e) => e.observed !== true);
  if (q.method) {
    const m = q.method.toUpperCase();
    out = out.filter((e) => e.method.toUpperCase() === m);
  }
  if (q.status != null) out = out.filter((e) => e.status === q.status);
  const pattern = q.urlPattern;
  if (pattern) out = out.filter((e) => matchUrl(e.url, pattern));
  return tail(out, q.limit);
}
