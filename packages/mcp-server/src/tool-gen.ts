import { TOOL_DEFS } from "@atwebpilot/shared/llm";
import type { LlmTool } from "@atwebpilot/shared/llm";
import type { JsonSchema } from "@atwebpilot/shared/types";

/**
 * Tools deliberately withheld from MCP.
 *
 * - askUser needs a human at the side panel; an MCP session has none.
 * - attachTab / detachTab are side-panel multi-tab bookkeeping. An MCP
 *   session already has its tab bound by open_session.
 */
export const BLOCKED_TOOLS = new Set<string>(["askUser", "attachTab", "detachTab"]);

/**
 * Advertised by default. The boundary rule: everyday browse / scrape / fill /
 * navigate / capture tasks must close without calling browser_discoverTools.
 */
export const CORE_TOOLS: readonly string[] = [
  // page state
  "takeSnapshot", "findElements", "getPageInfo", "extractText",
  // page index
  "createPageIndex", "searchPageIndex", "readPageBlock", "extractPageFields",
  // interaction
  "clickByUid", "click", "fillByUid", "fillInput", "fillForm", "selectOption", "setCheckbox",
  "hover", "pressKey", "drag", "drop", "uploadFile",
  // navigation and tabs
  "navigate", "listTabs", "openTab", "closeTab", "switchToTab", "resize", "scroll",
  // observation
  "screenshot", "waitFor", "runJS", "consoleMessages", "networkRequests"
] as const;

export type ToolMode = "core" | "full";

/** Result payloads that must reach MCP as an image block rather than JSON. */
const IMAGE_RESULT_TOOLS = new Set<string>(["screenshot"]);

/** runJS travels as a `js` step, not a `tool` step. */
const JS_STEP_TOOLS = new Set<string>(["runJS"]);

export type GeneratedTool = {
  name: string;
  builtinTool: string;
  description: string;
  resultKind: "json" | "image";
  stepKind: "tool" | "js";
  inputSchema: { type: string; properties?: Record<string, JsonSchema>; required?: string[] };
};

const SESSION_ID_FIELD: JsonSchema = {
  type: "string",
  description: "Session id from open_session"
} as JsonSchema;

/**
 * Recursively strips every `description` key from a JSON-schema value: the
 * side-panel wording is Chinese and example-heavy, and nests inside
 * `items` / nested `properties` / `oneOf`/`anyOf`/`allOf`, so a shallow strip
 * would still leak CJK text into the MCP surface.
 */
function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDescriptions);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "description") continue;
      out[key] = stripDescriptions(v);
    }
    return out;
  }
  return value;
}

/**
 * MCP schemas drop every property description that `mcp.params` does not
 * override: the side-panel wording is Chinese and example-heavy, and the
 * agent reads strategy from the skill bundle instead. Descriptions are
 * stripped recursively (nested `items` / `properties` / `oneOf` and friends),
 * then `mcp.params` overrides are applied to the top-level properties only.
 */
function rebuildSchema(src: JsonSchema, params: Record<string, string>): GeneratedTool["inputSchema"] {
  const s = src as { type?: string; properties?: Record<string, JsonSchema>; required?: string[] };
  const properties: Record<string, JsonSchema> = {};
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    if (key === "tabId") continue; // target tab is decided by the session, not the caller
    const stripped = stripDescriptions(prop) as Record<string, unknown>;
    properties[key] = (params[key] ? { ...stripped, description: params[key] } : stripped) as JsonSchema;
  }
  properties.session_id = SESSION_ID_FIELD;
  const required = [...new Set([...(s.required ?? []).filter((r) => r !== "tabId"), "session_id"])];
  return { type: "object", properties, required };
}

function fromDef(t: LlmTool): GeneratedTool {
  return {
    name: `browser_${t.name}`,
    builtinTool: t.name,
    description: t.mcp?.description ?? t.description,
    resultKind: IMAGE_RESULT_TOOLS.has(t.name) ? "image" : "json",
    stepKind: JS_STEP_TOOLS.has(t.name) ? "js" : "tool",
    inputSchema: rebuildSchema(t.input_schema, t.mcp?.params ?? {})
  };
}

export function generateBrowserTools(mode: ToolMode = "core"): GeneratedTool[] {
  const core = new Set(CORE_TOOLS);
  return TOOL_DEFS.filter((t) => {
    if (BLOCKED_TOOLS.has(t.name)) return false;
    return mode === "full" || core.has(t.name);
  }).map(fromDef);
}

/**
 * Defaults to `core`. An unrecognised value falls back to `core` with a
 * warning on stderr — stdout is the MCP channel and must stay clean.
 */
export function readToolMode(env: Record<string, string | undefined>): ToolMode {
  const raw = env.ATWEBPILOT_MCP_TOOLS;
  if (raw == null || raw === "") return "core";
  if (raw === "core" || raw === "full") return raw;
  process.stderr.write(
    `[atwebpilot-mcp] ATWEBPILOT_MCP_TOOLS="${raw}" is not recognised; using "core"\n`
  );
  return "core";
}
