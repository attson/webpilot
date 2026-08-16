import type { Coordinator } from "@atwebpilot/coordinator";
import {
  CAPABILITIES,
  isCapability,
  type Capability
} from "@atwebpilot/shared/capability";
import type { BuiltinTool, Json } from "@atwebpilot/shared/types";
import type { Result } from "@atwebpilot/shared/protocol";
import type { GeneratedTool } from "./tool-gen";

export interface Hub {
  exec(worker_id: string, params: { session_id: string; tab_id: string; step: { kind: "tool"; tool: string; args: unknown } }): Promise<Result>;
}

export interface Deps { coordinator: Coordinator; hub: Hub; }

function singleWorkerId(c: Coordinator): string {
  const workers = c.workers.list();
  if (workers.length === 0) throw new Error("没有浏览器连入，请在扩展设置页填 ws://127.0.0.1:<port>/worker 连接");
  if (workers.length > 1) throw new Error("检测到多个浏览器连入；v1 仅支持单 worker，请只保留一个连接");
  return workers[0].id;
}

export function handleListTabs(deps: Deps): { tabs: unknown[] } {
  const w = deps.coordinator.workers.get(singleWorkerId(deps.coordinator))!;
  return { tabs: w.available_tabs };
}

export function handleOpenSession(deps: Deps, args: Record<string, unknown>): { session_id: string } {
  const worker_id = singleWorkerId(deps.coordinator);
  const tab_id = String(args.tab_id);
  const requested = Array.isArray(args.capabilities) ? (args.capabilities as unknown[]).map(String).filter(isCapability) : [];
  const scope = new Set<Capability>(requested.length ? requested : (CAPABILITIES as readonly Capability[]));
  const idle_timeout_ms = typeof args.idle_timeout_min === "number" ? args.idle_timeout_min * 60_000 : undefined;
  const s = deps.coordinator.openSession({ ai_client_fingerprint: "mcp-local", worker_id, tab_id, scope, idle_timeout_ms });
  return { session_id: s.id };
}

export function handleCloseSession(deps: Deps, args: Record<string, unknown>): { ok: true } {
  deps.coordinator.closeSession(String(args.session_id));
  return { ok: true };
}

export function handleGetQuota(deps: Deps, args: Record<string, unknown>): unknown {
  const q = deps.coordinator.quotaFor(String(args.session_id));
  if (!q) throw new Error(`session ${String(args.session_id)} not found`);
  return q;
}

/**
 * `listTabs` and `openTab` are TOOL_DEFS entries without a BuiltinTool member,
 * so `capabilityForTool`'s exhaustive switch would throw on them. They are
 * tab-plane operations, which is exactly what `tab:open` covers.
 */
const NON_BUILTIN_CAPABILITY: Record<string, Capability> = {
  listTabs: "tab:open",
  openTab: "tab:open"
};

export async function handleBrowserTool(deps: Deps, gen: GeneratedTool, args: Record<string, unknown>): Promise<Json> {
  const session_id = String(args.session_id);
  const session = deps.coordinator.sessions.get(session_id);
  if (!session) throw new Error(`session ${session_id} not found`);

  const { session_id: _omit, ...toolArgs } = args;
  const tool = gen.builtinTool as BuiltinTool;

  // runJS travels as a `js` step. The MCP server cannot run the static scan
  // itself, so it declares the call unsafe and lets the extension's scanner
  // have the final say.
  if (gen.stepKind === "js") {
    const source = String((toolArgs as Record<string, unknown>).source ?? "");
    if (!source) throw new Error("browser_runJS: source required");
    const v = deps.coordinator.validateCall({ session_id, kind: "runJS", unsafe: true });
    if (!v.ok) throw new Error(`${v.error.code}: ${v.error.message}`);
    deps.coordinator.recordCall(session_id, v.dangerous);
    const jsResult = await deps.hub.exec(session.worker_id, {
      session_id,
      tab_id: session.tab_id,
      step: { kind: "js", source } as unknown as { kind: "tool"; tool: string; args: unknown }
    });
    if (!jsResult.ok) {
      throw new Error(
        jsResult.error ? `${jsResult.error.code}: ${jsResult.error.message}` : "EXEC failed"
      );
    }
    return (jsResult.return ?? null) as Json;
  }

  const override = NON_BUILTIN_CAPABILITY[gen.builtinTool];
  if (override) {
    const v = deps.coordinator.validateCall({ session_id, kind: "capability", capability: override });
    if (!v.ok) throw new Error(`${v.error.code}: ${v.error.message}`);
    deps.coordinator.recordCall(session_id, v.dangerous);
  } else {
    const raw = toolArgs as Record<string, unknown>;
    const v = deps.coordinator.validateCall({
      session_id,
      kind: "extension_tool",
      tool,
      httpCookied: tool === "httpRequest" ? Boolean(raw.withCredentials) : undefined,
      dropHasFiles: tool === "drop" ? Array.isArray(raw.files) && raw.files.length > 0 : undefined,
      recorderArmsBodies: tool === "recorderConfig" ? raw.bodies === true : undefined
    });
    if (!v.ok) throw new Error(`${v.error.code}: ${v.error.message}`);
    deps.coordinator.recordCall(session_id, v.dangerous);
  }

  const result = await deps.hub.exec(session.worker_id, { session_id, tab_id: session.tab_id, step: { kind: "tool", tool, args: toolArgs as Json } });
  if (!result.ok) throw new Error(result.error ? `${result.error.code}: ${result.error.message}` : "EXEC failed");
  return (result.return ?? null) as Json;
}
