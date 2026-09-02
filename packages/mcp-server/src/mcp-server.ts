import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { JsonSchema } from "@atwebpilot/shared/types";
import { CONTROL_TOOLS } from "./control-tools";
import { DISCOVER_TOOL, handleDiscover } from "./discover-tool";
import { generateBrowserTools, readToolMode, type GeneratedTool, type ToolMode } from "./tool-gen";
import {
  handleListTabs, handleOpenSession, handleCloseSession, handleGetQuota, handleBrowserTool,
  type Deps, type PairingRequiredHandler
} from "./handlers";
import { readSkillBundle, SKILL_TOOL } from "./skill-bundle";

export type ToolListEntry = { name: string; description: string; inputSchema: JsonSchema };

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type CallResult = { content: ContentBlock[]; isError?: boolean };

/** Every tool the server can execute, regardless of what is currently advertised. */
const ALL_BROWSER_TOOLS: GeneratedTool[] = generateBrowserTools("full");
const BROWSER_BY_NAME = new Map(ALL_BROWSER_TOOLS.map((t) => [t.name, t]));

/**
 * Process-wide advertised set. MCP `tools/list` has no per-session scope, so
 * neither does this; discovery only ever grows it.
 */
export type ToolState = { advertised: Set<string> };

export function createToolState(mode: ToolMode): ToolState {
  return { advertised: new Set(generateBrowserTools(mode).map((t) => t.name)) };
}

const DEFAULT_STATE = createToolState(readToolMode(process.env));

/**
 * The surface an extension predating Plan 32 can execute. Used when a worker
 * connects without `supported_tools`, so the server never advertises a tool
 * that would fail at call time with "unknown tool".
 */
export const LEGACY_TOOLS: readonly string[] = [
  "snapshotDOM", "querySelector", "querySelectorAll", "extractText", "extractImages",
  "getValue", "extractFormState", "hover", "focus", "scroll", "waitFor",
  "click", "fillInput", "setCheckbox", "selectOption", "httpRequest",
  "submitForm", "uploadFile", "readStorage"
] as const;

/**
 * Which built-ins the connected worker can run. Undefined means "no worker
 * connected yet" — `tools/list` is often called before the browser attaches,
 * and answering with an empty surface then would be worse than optimistic.
 */
function workerToolSupport(deps?: Deps): ReadonlySet<string> | undefined {
  // peek(), never ensure(): answering tools/list must not bind a port.
  const bundle = deps?.peek();
  if (!bundle) return undefined;
  const workers = bundle.coordinator.workers.list();
  if (workers.length === 0) return undefined;
  const supported = workers[0].supported_tools;
  return supported ?? new Set(LEGACY_TOOLS);
}

export function buildToolList(deps?: Deps, state: ToolState = DEFAULT_STATE): ToolListEntry[] {
  const supported = workerToolSupport(deps);
  const browser = ALL_BROWSER_TOOLS.filter((t) => state.advertised.has(t.name))
    .filter((t) => !supported || t.builtinTools.every((b) => supported.has(b)));
  return [
    { name: SKILL_TOOL.name, description: SKILL_TOOL.description, inputSchema: SKILL_TOOL.inputSchema as JsonSchema },
    ...CONTROL_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    { name: DISCOVER_TOOL.name, description: DISCOVER_TOOL.description, inputSchema: DISCOVER_TOOL.inputSchema },
    ...browser.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as JsonSchema }))
  ];
}

const ok = (data: unknown): CallResult => ({
  content: [{ type: "text", text: JSON.stringify(data ?? null) }]
});

/**
 * Screenshots have to reach the model as an image block; JSON-stringifying the
 * base64 would just burn context. Falls back to text when the payload does not
 * look like an image so a malformed result is still legible.
 */
function toolResult(gen: GeneratedTool, data: unknown): CallResult {
  if (gen.resultKind !== "image") return ok(data);
  const d = (data ?? {}) as { data?: unknown; media_type?: unknown };
  if (typeof d.data !== "string") return ok(data);
  const mimeType = typeof d.media_type === "string" ? d.media_type : "image/png";
  return { content: [{ type: "image", data: d.data, mimeType }] };
}
const fail = (message: string): CallResult => ({ content: [{ type: "text", text: message }], isError: true });

export async function dispatchCall(
  deps: Deps,
  name: string,
  args: Record<string, unknown>,
  onPairingRequired?: PairingRequiredHandler,
  state: ToolState = DEFAULT_STATE,
  onListChanged?: () => Promise<void>
): Promise<CallResult> {
  try {
    if (name === SKILL_TOOL.name) {
      const bundle = readSkillBundle();
      return { content: [{ type: "text", text: bundle.content }] };
    }
    if (name === DISCOVER_TOOL.name) {
      const r = handleDiscover({ all: ALL_BROWSER_TOOLS, advertised: state.advertised, args });
      if (r.changed && onListChanged) await onListChanged();
      const { changed: _c, ...body } = r;
      return ok(body);
    }
    if (name === "list_tabs") return ok(await handleListTabs(deps, onPairingRequired));
    if (name === "open_session") return ok(await handleOpenSession(deps, args, onPairingRequired));
    if (name === "close_session") return ok(await handleCloseSession(deps, args));
    if (name === "get_quota") return ok(await handleGetQuota(deps, args));
    const gen = BROWSER_BY_NAME.get(name);
    if (gen) return toolResult(gen, await handleBrowserTool(deps, gen, args));
    return fail(`unknown tool: ${name}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export function createMcpServer(deps: Deps, state: ToolState = DEFAULT_STATE): Server {
  const server = new Server(
    { name: "atwebpilot-mcp", version: "0.1.0" },
    { capabilities: { tools: { listChanged: true }, logging: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: buildToolList(deps, state) }));
  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const onPairingRequired: PairingRequiredHandler = async (url) => {
      const message = `等待浏览器授权（最多 90 秒）。配对页：${url}。已尝试自动打开；若未弹出，请手动打开。`;
      try {
        const progressToken = extra._meta?.progressToken;
        if (progressToken != null) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: 0, total: 1, message }
          });
        } else {
          await server.sendLoggingMessage({ level: "info", logger: "atwebpilot", data: message });
        }
      } catch (error) {
        console.error(
          "[atwebpilot-mcp] failed to report pairing URL:",
          error instanceof Error ? error.message : String(error)
        );
      }
    };
    const onListChanged = async () => {
      try {
        await server.sendToolListChanged();
      } catch (error) {
        console.error("[atwebpilot-mcp] failed to send tools/list_changed:", error instanceof Error ? error.message : String(error));
      }
    };
    return dispatchCall(deps, req.params.name, args, onPairingRequired, state, onListChanged);
  });
  return server;
}
