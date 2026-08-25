import { z } from "zod";

export const StepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool"),
    tool: z.enum([
      "snapshotDOM",
      "querySelector",
      "querySelectorAll",
      "extractImages",
      "extractText",
      "scroll",
      "waitFor",
      "click",
      "httpRequest",
      "readStorage",
      "fillInput",
      "setCheckbox",
      "selectOption",
      "submitForm",
      "hover",
      "focus",
      "uploadFile",
      "getValue",
      "extractFormState",
      // Round 5 — content-script-routable additions (some are replayable as Steps;
      // the UID-based + visual ones aren't kept by save-as-tool but the runtime
      // still needs to pass them through to the content script).
      "closeTab",
      "switchToTab",
      "downloadImage",
      "fillForm",
      "takeSnapshot",
      "clickByUid",
      "fillByUid",
      "highlightElement",
      "highlightText",
      // Round 6 — common helpers
      "navigate",
      "getPageInfo",
      "pressKey",
      "writeStorage",
      "createPageIndex",
      "searchPageIndex",
      "readPageBlock",
      "extractPageFields",
      // Plan 32 — playwright parity. The recorder tools are not kept by
      // save-as-tool (they're excluded from ReplayableTool), but the runtime
      // still transports them as Steps to reach the background router.
      "consoleMessages",
      "networkRequests",
      "networkRequestDetail",
      "handleDialog",
      "recorderConfig",
      "navigateBack",
      "navigateForward",
      "resize",
      "drag",
      "drop",
      "findElements",
      "inspectElement"
    ]),
    args: z.unknown(),
    bindResultTo: z.string().optional(),
    timeoutMs: z.number().int().positive().optional()
  }),
  z.object({
    kind: z.literal("js"),
    source: z.string(),
    bindResultTo: z.string().optional(),
    timeoutMs: z.number().int().positive().optional()
  })
]);

const ToolStatsSchema = z.object({
  runs: z.number().int().min(0),
  lastRunAt: z.number().optional(),
  lastRunOk: z.boolean().optional()
});

export const ToolOriginSchema = z.object({
  kind: z.literal("preset"),
  presetId: z.string().min(1),
  presetVersion: z.number().int().min(1)
});

export const StepsToolDraftSchema = z.object({
  kind: z.literal("steps"),
  name: z.string().min(1),
  urlPatterns: z.array(z.string().min(1)).min(1),
  description: z.string().default(""),
  steps: z.array(StepSchema).min(1),
  outputSchema: z.unknown().default({})
});

export const PromptToolDraftSchema = z.object({
  kind: z.literal("prompt"),
  name: z.string().min(1),
  urlPatterns: z.array(z.string().min(1)).min(1),
  description: z.string().default(""),
  prompt: z.string().min(1)
});

export const ToolDraftSchema = z.discriminatedUnion("kind", [
  StepsToolDraftSchema,
  PromptToolDraftSchema
]);

const StepsToolVersionSchema = z.object({
  version: z.number().int().positive(),
  kind: z.literal("steps"),
  steps: z.array(StepSchema).min(1),
  outputSchema: z.unknown().default({}),
  createdAt: z.number(),
  note: z.string().optional()
});

const PromptToolVersionSchema = z.object({
  version: z.number().int().positive(),
  kind: z.literal("prompt"),
  prompt: z.string().min(1),
  createdAt: z.number(),
  note: z.string().optional()
});

export const StepsToolSchema = z.object({
  kind: z.literal("steps"),
  id: z.string().min(1),
  name: z.string().min(1),
  urlPatterns: z.array(z.string().min(1)).min(1),
  description: z.string().default(""),
  steps: z.array(StepSchema).min(1),
  outputSchema: z.unknown().default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
  versions: z.array(StepsToolVersionSchema).min(1),
  stats: ToolStatsSchema,
  origin: ToolOriginSchema.optional()
});

export const PromptToolSchema = z.object({
  kind: z.literal("prompt"),
  id: z.string().min(1),
  name: z.string().min(1),
  urlPatterns: z.array(z.string().min(1)).min(1),
  description: z.string().default(""),
  prompt: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  versions: z.array(PromptToolVersionSchema).min(1),
  stats: ToolStatsSchema,
  origin: ToolOriginSchema.optional()
});

export const ToolSchema = z.discriminatedUnion("kind", [StepsToolSchema, PromptToolSchema]);

export const RpcRequest = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tools.list") }),
  z.object({ type: z.literal("tools.get"), id: z.string() }),
  z.object({ type: z.literal("tools.save"), draft: ToolDraftSchema }),
  z.object({ type: z.literal("tools.delete"), id: z.string() }),
  z.object({ type: z.literal("tools.matching"), url: z.string() }),
  z.object({ type: z.literal("tools.export") }),
  z.object({ type: z.literal("tools.import"), bundle: z.unknown() }),
  z.object({
    type: z.literal("runs.start"),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("draft"), draft: ToolDraftSchema }),
      z.object({ kind: z.literal("tool"), id: z.string() })
    ]),
    tabId: z.number()
  }),
  z.object({ type: z.literal("runs.list"), toolId: z.string().optional() }),
  z.object({ type: z.literal("runs.get"), id: z.string() }),
  z.object({
    type: z.literal("http.request"),
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    withCredentials: z.boolean().default(false)
  }),
  z.object({
    type: z.literal("scripting.injectMain"),
    tabId: z.number().optional(),
    source: z.string(),
    args: z.unknown()
  }),

  // chat session
  z.object({ type: z.literal("chat.session.start"), url: z.string() }),
  z.object({
    type: z.literal("chat.session.appendLog"),
    runId: z.string(),
    entry: z.object({
      stepIndex: z.number().int().min(0),
      input: z.unknown(),
      output: z.unknown(),
      ms: z.number().int().min(0),
      error: z.string().optional()
    })
  }),
  z.object({
    type: z.literal("chat.session.end"),
    runId: z.string(),
    status: z.enum(["ok", "error", "aborted"]),
    output: z.unknown().optional()
  }),

  // single step (for sidepanel-driven session loop)
  z.object({
    type: z.literal("runs.runOneStep"),
    step: StepSchema,
    tabId: z.number(),
    attachedTabIds: z.array(z.number()).default([]),
    bindings: z.record(z.unknown()).default({})
  }),

  z.object({
    type: z.literal("tabs.list"),
    windowId: z.number().int().optional()
  }),
  z.object({
    type: z.literal("tabs.open"),
    url: z.string().url(),
    active: z.boolean().optional()
  }),

  // binary fetch (for uploadFile)
  z.object({
    type: z.literal("http.fetchBinary"),
    url: z.string().url()
  }),

  z.object({
    type: z.literal("elementCapture.start"),
    tabId: z.number().int()
  }),

  // presets
  z.object({ type: z.literal("presets.list") }),
  z.object({ type: z.literal("presets.materialize"), presetId: z.string().min(1) }),

  // widget RPCs
  z.object({
    type: z.literal("widget.openSidepanel"),
    tabId: z.number().int(),
    pendingApprovalId: z.string().optional()
  }),
  z.object({
    type: z.literal("widget.openSidepanelWithSave"),
    tabId: z.number().int()
  }),
  z.object({
    type: z.literal("widget.markHostHidden"),
    host: z.string().min(1)
  })
]);

export type RpcRequest = z.infer<typeof RpcRequest>;

export type RpcOk<T> = { ok: true; data: T };
export type RpcErr = { ok: false; error: string };
export type RpcResult<T> = RpcOk<T> | RpcErr;

export const ContentRequest = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("content.runStep"),
    step: StepSchema,
    bindings: z.record(z.unknown())
  })
]);
export type ContentRequest = z.infer<typeof ContentRequest>;
