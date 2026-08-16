/**
 * Shared shapes for the page-event recorder (Plan 32).
 *
 * Both recorder backends — the MAIN-world content script and the
 * `chrome.debugger` CDP client — fill these same structures, so the query
 * filters and the tool adapters stay backend-agnostic.
 */

export type RecorderBackend = "main-world" | "cdp";

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug" | "trace";

export type ConsoleEntry = {
  id: number;
  ts: number;
  level: ConsoleLevel;
  text: string;
  stack?: string;
  url?: string;
  line?: number;
};

export type NetworkEntry = {
  id: number;
  ts: number;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  ms?: number;
  resourceType?: string;
  /** true when sourced from PerformanceObserver rather than a wrapped call */
  observed?: boolean;
  transferSize?: number;
  error?: string;
};

export type NetworkPart =
  | "request-headers"
  | "request-body"
  | "response-headers"
  | "response-body";

export type NetworkDetail = NetworkEntry & {
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  /** why a body is missing, when the caller could have had one */
  bodyUnavailable?: string;
};

export type DialogEntry = {
  id: number;
  ts: number;
  kind: "alert" | "confirm" | "prompt";
  message: string;
  defaultValue?: string;
  handled: "passthrough" | "accepted" | "dismissed";
  promptText?: string;
};

export type DialogPolicy = {
  accept: boolean;
  promptText?: string;
  scope: "next" | "all";
};

export type RecorderConfig = {
  console: boolean;
  network: boolean;
  /** request/response body capture; implies the read:network-body capability */
  bodies: boolean;
  /** when false, alert/confirm/prompt run unpatched */
  dialog: boolean;
};

/**
 * Defaults are deliberately inert: the recorder loads on every page the user
 * visits, so body capture stays off and dialogs pass through to the native
 * implementations until an agent explicitly arms them.
 */
export const DEFAULT_RECORDER_CONFIG: RecorderConfig = {
  console: true,
  network: true,
  bodies: false,
  dialog: false
};

export const RING_SIZES = { console: 500, network: 300, dialog: 100 } as const;

/** Max bytes retained per captured request/response body. */
export const BODY_CAP_BYTES = 256 * 1024;

/** Content types worth capturing a body for. */
export const TEXTY_CONTENT_TYPE = /(json|text|xml|javascript|urlencoded|form-data)/i;

export type BackendTag = {
  backend: RecorderBackend;
  /** set when a higher-fidelity backend was expected but unavailable */
  degradedReason?: string;
  /** set when the recorder is not running at all on this page */
  disabled?: string;
};

export type ConsoleReadResult = BackendTag & { dropped: number; messages: ConsoleEntry[] };
export type NetworkReadResult = BackendTag & { dropped: number; requests: NetworkEntry[] };
export type DialogReadResult = BackendTag & { dropped: number; dialogs: DialogEntry[] };
export type NetworkDetailResult = BackendTag & { detail: NetworkDetail | null };

export type ConsoleQuery = { level?: ConsoleLevel; limit?: number; sinceId?: number };

export type NetworkQuery = {
  urlPattern?: string;
  method?: string;
  status?: number;
  includeStatic?: boolean;
  limit?: number;
  sinceId?: number;
};

export type RecorderConfigPatch = Partial<RecorderConfig> & {
  clear?: Array<"console" | "network" | "dialog">;
};

/** Backend-agnostic recorder surface consumed by the background tool adapters. */
export interface PageRecorder {
  readonly backend: RecorderBackend;
  readConsole(q: ConsoleQuery): Promise<ConsoleReadResult>;
  readNetwork(q: NetworkQuery): Promise<NetworkReadResult>;
  readNetworkDetail(q: { id: number; part?: NetworkPart }): Promise<NetworkDetailResult>;
  setDialogPolicy(p: DialogPolicy): Promise<DialogReadResult>;
  readDialogs(q: { limit?: number }): Promise<DialogReadResult>;
  configure(patch: RecorderConfigPatch): Promise<BackendTag & { config: RecorderConfig }>;
}
