import { TOOL_DEFS } from "@atwebpilot/shared/llm";
import type { JsonSchema } from "@atwebpilot/shared/types";

/**
 * Tools deliberately withheld from MCP.
 *
 * - askUser needs a human at the side panel; an MCP session has none.
 * - attachTab / detachTab are side-panel multi-tab bookkeeping. An MCP
 *   session already has its tab bound by open_session.
 *
 * Everything else in TOOL_DEFS is exposed. This is a block-list rather than
 * the former 19-name allow-list so that new built-ins reach external agents
 * without a second edit.
 */
export const BLOCKED_TOOLS = new Set<string>(["askUser", "attachTab", "detachTab"]);

/**
 * The subset whose capabilities cover playwright-ext's 24 tools one-for-one,
 * under AtWebPilot names. Selected with `ATWEBPILOT_MCP_TOOLS=parity` by users
 * who would rather have the context back than have the full surface.
 */
export const PARITY_TOOLS: readonly string[] = [
  // page state and search
  "takeSnapshot", "findElements", "getPageInfo",
  // interaction
  "clickByUid", "click", "fillInput", "fillForm", "selectOption", "setCheckbox",
  "hover", "pressKey", "drag", "drop", "uploadFile",
  // navigation and tabs
  "navigate", "navigateBack", "listTabs", "openTab", "resize",
  // observation
  "screenshot", "waitFor", "runJS", "consoleMessages", "networkRequests"
] as const;

export type ToolMode = "full" | "parity";

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

function rebuildSchema(src: JsonSchema): GeneratedTool["inputSchema"] {
  const s = src as { type?: string; properties?: Record<string, JsonSchema>; required?: string[] };
  const properties: Record<string, JsonSchema> = { ...(s.properties ?? {}) };
  delete properties.tabId; // target tab is decided by the session, not the caller
  properties.session_id = {
    type: "string",
    description: "open_session 返回的会话 id（决定目标 worker 与 tab）"
  } as JsonSchema;
  const required = [...new Set([...(s.required ?? []).filter((r) => r !== "tabId"), "session_id"])];
  return { type: "object", properties, required };
}

export function generateBrowserTools(mode: ToolMode = "full"): GeneratedTool[] {
  const parity = new Set(PARITY_TOOLS);
  return TOOL_DEFS.filter((t) => {
    if (BLOCKED_TOOLS.has(t.name)) return false;
    return mode === "full" || parity.has(t.name);
  }).map((t) => ({
    name: `browser_${t.name}`,
    builtinTool: t.name,
    description: t.description,
    resultKind: IMAGE_RESULT_TOOLS.has(t.name) ? ("image" as const) : ("json" as const),
    stepKind: JS_STEP_TOOLS.has(t.name) ? ("js" as const) : ("tool" as const),
    inputSchema: rebuildSchema(t.input_schema)
  }));
}

/**
 * Defaults to `full`. An unrecognised value falls back to `full` with a
 * warning on stderr — stdout is the MCP channel and must stay clean.
 */
export function readToolMode(env: Record<string, string | undefined>): ToolMode {
  const raw = env.ATWEBPILOT_MCP_TOOLS;
  if (raw == null || raw === "") return "full";
  if (raw === "full" || raw === "parity") return raw;
  process.stderr.write(
    `[atwebpilot-mcp] ATWEBPILOT_MCP_TOOLS="${raw}" is not recognised; using "full"\n`
  );
  return "full";
}
