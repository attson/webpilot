import { ContentRequest } from "@atwebpilot/shared/messages";
import type { Json } from "@atwebpilot/shared/types";
import { injectMain } from "./inject-main";
import { callTool } from "./tools";
import { installPairingRelay } from "./pairing-relay";

console.info("[atwebpilot] content script loaded on", location.href);

// Listens for the MCP server's pairing page; inert on every other page.
installPairingRelay();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const parsed = ContentRequest.safeParse(msg);
  if (!parsed.success) {
    // Tag the rejection so the caller surfaces an actionable error instead of
    // crashing on `undefined.ok` when the response channel closes silently.
    const m = (msg as { type?: string } | null)?.type;
    if (m && typeof m === "string" && m.startsWith("content.")) {
      sendResponse({
        ok: false,
        error: `content script rejected request: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`
      });
      return false;
    }
    return false;
  }
  handle(parsed.data)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  return true;
});

async function handle(req: import("@atwebpilot/shared/messages").ContentRequest): Promise<Json> {
  if (req.type === "content.runStep") {
    const { step, bindings } = req;
    if (step.kind === "tool") {
      return callTool(step.tool, resolve(step.args, bindings));
    }
    return injectMain(step.source, bindings as unknown as Json);
  }
  throw new Error(`unhandled content request: ${(req as { type: string }).type}`);
}

function resolve(value: unknown, bindings: Record<string, unknown>): Json {
  if (typeof value === "string") {
    const exact = value.match(/^\$\{([^}]+)\}$/);
    if (exact) {
      const key = exact[1];
      return (key in bindings ? bindings[key] : value) as Json;
    }
    return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
      const v = bindings[key];
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, bindings));
  if (value && typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolve(v, bindings);
    }
    return out;
  }
  return value as Json;
}
