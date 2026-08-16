const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_BYTES = 2048;

/**
 * Renders an arbitrary console argument as a bounded string. Console capture
 * runs on every page the user visits, so this must never throw, never recurse
 * without limit, and never retain a reference to the value.
 */
export function serializeArg(
  value: unknown,
  opts?: { maxDepth?: number; maxBytes?: number }
): string {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  let text: string;
  try {
    text = render(value, 0, maxDepth, new WeakSet<object>());
  } catch (e) {
    text = `[unserialisable: ${e instanceof Error ? e.message : String(e)}]`;
  }
  return text.length > maxBytes
    ? `${text.slice(0, maxBytes)}…[truncated ${text.length - maxBytes}B]`
    : text;
}

function render(value: unknown, depth: number, maxDepth: number, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const t = typeof value;
  if (t === "string") return value as string;
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  if (t === "symbol") return (value as symbol).toString();
  if (t === "function") {
    return `[Function ${(value as { name?: string }).name || "anonymous"}]`;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }

  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  if (depth >= maxDepth) return Array.isArray(value) ? "[Array]" : "[Object]";
  seen.add(obj);

  if (Array.isArray(value)) {
    return `[${value.map((v) => render(v, depth + 1, maxDepth, seen)).join(", ")}]`;
  }

  const entries = Object.entries(obj as Record<string, unknown>).map(
    ([k, v]) => `${k}: ${render(v, depth + 1, maxDepth, seen)}`
  );
  return `{${entries.join(", ")}}`;
}
