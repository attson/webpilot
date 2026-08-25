# Plan 4: Per-Tab Chat Sessions 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 sidepanel 的全局单例 ChatSession 改造成"按 tabId 分桶"的多会话——每个浏览器 tab 一份独立 SessionData（messages / cards / status / inputDraft / abortController / approver），切 tab 看到该 tab 的对话历史，关 tab 后非空 SessionData 进入 5 分钟 closedSessions 临时区可恢复。

**Architecture:** 单 zustand store + `sessionsByTab: Record<number, SessionData>` 切片 + `currentTabId` 状态；所有 actions 显式接 tabId 参数（不依赖 currentTabId 兜底，避免 race）；Approver 改 module-level `Map<tabId, Approver>` 工厂；新建 `tab-tracker` 接 chrome.tabs.{onActivated,onUpdated,onRemoved}；run-session 接口不变（onEvent 在 chat-page 闭包里固定 tabId）。

**Tech Stack:** 复用 Plan 1-3 的 zustand + React + TS + zod；无新依赖。

---

## 文件结构（Plan 4 增量）

```
src/sidepanel/
├─ chat/
│  ├─ session-store.ts                  # MOD: 全部重写（按 tabId 切片）
│  ├─ approval.ts                       # MOD: per-tab factory
│  ├─ run-session.ts                    # 不变（onEvent 接口不变）
│  ├─ tab-tracker.ts                    # NEW
│  └─ closed-sessions-pruner.ts         # NEW
├─ pages/
│  └─ chat-page.tsx                     # MOD: send() 全带 tabId；input ↔ inputDraft
├─ components/
│  ├─ closed-sessions-banner.tsx        # NEW
│  ├─ tab-info-bar.tsx                  # NEW
│  ├─ chat-view.tsx                     # MOD: getApproverForTab + tabId
│  ├─ logs-drawer.tsx                   # MOD: actions 带 tabId
│  └─ status-bar.tsx                    # 不变（仍 useSession）
└─ app.tsx                              # MOD: 安装 tab-tracker + pruner

tests/sidepanel/chat/
├─ session-store.test.ts                # NEW
└─ tab-tracker.test.ts                  # NEW
```

每个文件单一职责。`session-store.ts` 是数据中心；`tab-tracker.ts` 把 chrome.tabs 事件映射到 store actions；`closed-sessions-pruner.ts` 提供一个轻量 React hook 装 setInterval。

---

## Task 1: 数据结构骨架（types + EMPTY_SESSION）

**Files:**
- Modify: `src/sidepanel/chat/session-store.ts`

要把 store 完全重写。先把新数据结构 + 空 sentinel 定义清楚，让其他文件能引用。

- [ ] **Step 1: 重写 `src/sidepanel/chat/session-store.ts`（仅类型 + sentinel + 空 store）**

```ts
// src/sidepanel/chat/session-store.ts
import { create } from "zustand";
import type { ChatMessage, Json, Step, ToolUsePart } from "@/shared/types";

export type StepCardState = {
  toolUseId: string;
  name: string;
  input: Json;
  partialJson: string;
  inputReady: boolean;
  status: "draft" | "awaiting" | "running" | "ok" | "error" | "skipped" | "denied";
  output?: Json;
  error?: string;
  ms?: number;
};

export type LogEntry = {
  ts: number;
  level: "info" | "warn" | "error";
  message: string;
  details?: string;
};

export type SessionStatus =
  | "idle"
  | "streaming"
  | "awaiting"
  | "running"
  | "done"
  | "error"
  | "aborted";

export type SessionData = {
  tabId: number;
  url: string;
  runRecordId: string | null;

  messages: ChatMessage[];
  streamingAssistantText: string;
  cards: StepCardState[];

  approveAllSafe: boolean;

  status: SessionStatus;
  errorMessage: string | null;
  roundCount: number;
  tokenUsage: { input: number; output: number };

  executedSteps: Step[];
  lastOutput: Json;
  showSaveDialog: boolean;

  abortController: AbortController | null;

  logs: LogEntry[];
  logsOpen: boolean;

  inputDraft: string;
};

export type ClosedSession = {
  tabId: number;
  url: string;
  closedAt: number;
  data: SessionData;
};

function makeEmptySession(tabId: number, url = ""): SessionData {
  return {
    tabId,
    url,
    runRecordId: null,
    messages: [],
    streamingAssistantText: "",
    cards: [],
    approveAllSafe: true,
    status: "idle",
    errorMessage: null,
    roundCount: 0,
    tokenUsage: { input: 0, output: 0 },
    executedSteps: [],
    lastOutput: null,
    showSaveDialog: false,
    abortController: null,
    logs: [],
    logsOpen: false,
    inputDraft: ""
  };
}

// UI 在 currentTabId 为 null 时的兜底
export const EMPTY_SESSION: SessionData = Object.freeze(makeEmptySession(-1)) as SessionData;

type StoreShape = {
  sessionsByTab: Record<number, SessionData>;
  closedSessions: ClosedSession[];
  currentTabId: number | null;
};

export const useStore = create<StoreShape>(() => ({
  sessionsByTab: {},
  closedSessions: [],
  currentTabId: null
}));

// Plan 4 后续 task 会把所有 actions 加进来；先仅暴露空 store
export { makeEmptySession };
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 大量 callsite 报错（chat-page、chat-view、status-bar、logs-drawer 等都用旧 useSession() / actions）。这是预期的，后续 task 会逐个修。但本任务的提交需要让 callsite 仍能通过——所以 step 3 加 shim。

- [ ] **Step 3: 临时 shim：旧 `useSession` API 暂时返回 EMPTY_SESSION 或 currentTab session 的合并对象**

为了让现有组件（chat-view / status-bar / logs-drawer / chat-page）暂时不需要修改即可编译通过，先在 `session-store.ts` 末尾追加一个临时兼容层：

```ts
// === TEMP COMPAT (Plan 4 Task 1; will be replaced) ===
// 让现有 useSession() 调用不立刻失败。后续 task 会逐个迁移并删除这里。
type LegacyShim = SessionData & {
  reset: () => void;
  setApproveAllSafe: (v: boolean) => void;
  setStatus: (s: SessionStatus) => void;
  setError: (msg: string | null) => void;
  setIdentity: (p: { tabId: number; url: string; runRecordId: string }) => void;
  appendUserMessage: (text: string) => void;
  beginAssistantTurn: () => void;
  appendAssistantText: (delta: string) => void;
  finalizeAssistantTurn: (toolUses: ToolUsePart[]) => void;
  upsertCard: (card: Partial<StepCardState> & { toolUseId: string }) => void;
  setCardStatus: (
    toolUseId: string,
    patch: Partial<Pick<StepCardState, "status" | "output" | "error" | "ms" | "input" | "inputReady">>
  ) => void;
  appendToolResults: (
    results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>
  ) => void;
  pushExecutedStep: (step: Step) => void;
  setLastOutput: (v: Json) => void;
  incrementRound: () => void;
  addUsage: (u: { input_tokens: number; output_tokens: number }) => void;
  setAbortController: (c: AbortController | null) => void;
  showSave: () => void;
  hideSave: () => void;
  appendLog: (level: LogEntry["level"], message: string, details?: string) => void;
  clearLogs: () => void;
  setLogsOpen: (open: boolean) => void;
};

const NOOP = () => {};
const NOOP_RETURN = () => undefined;

const LEGACY_PROXY: LegacyShim = {
  ...EMPTY_SESSION,
  reset: NOOP,
  setApproveAllSafe: NOOP as LegacyShim["setApproveAllSafe"],
  setStatus: NOOP as LegacyShim["setStatus"],
  setError: NOOP as LegacyShim["setError"],
  setIdentity: NOOP as LegacyShim["setIdentity"],
  appendUserMessage: NOOP as LegacyShim["appendUserMessage"],
  beginAssistantTurn: NOOP as LegacyShim["beginAssistantTurn"],
  appendAssistantText: NOOP as LegacyShim["appendAssistantText"],
  finalizeAssistantTurn: NOOP as LegacyShim["finalizeAssistantTurn"],
  upsertCard: NOOP as LegacyShim["upsertCard"],
  setCardStatus: NOOP as LegacyShim["setCardStatus"],
  appendToolResults: NOOP as LegacyShim["appendToolResults"],
  pushExecutedStep: NOOP as LegacyShim["pushExecutedStep"],
  setLastOutput: NOOP as LegacyShim["setLastOutput"],
  incrementRound: NOOP_RETURN as LegacyShim["incrementRound"],
  addUsage: NOOP as LegacyShim["addUsage"],
  setAbortController: NOOP as LegacyShim["setAbortController"],
  showSave: NOOP as LegacyShim["showSave"],
  hideSave: NOOP as LegacyShim["hideSave"],
  appendLog: NOOP as LegacyShim["appendLog"],
  clearLogs: NOOP as LegacyShim["clearLogs"],
  setLogsOpen: NOOP as LegacyShim["setLogsOpen"]
};

export function useSession(): LegacyShim {
  // 仅做编译过；运行时数据为空。Task 4 起会切换到真实实现。
  return LEGACY_PROXY;
}

export const useSessionLegacy = useSession;
```

注意：这是过渡 shim，所以 ChatPage 等组件的运行时行为会暂时**坏掉**——只要 typecheck + build 通过即可，后续 task 4 起切真实数据源。这种"先重新定义类型骨架、再迁移 callsite"的做法在大型 refactor 中常见。

- [ ] **Step 4: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 退出码 0。

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/chat/session-store.ts
git commit -m "refactor(session-store): introduce SessionData + sessionsByTab skeleton (compat shim)"
```

---

## Task 2: 完整 actions 实现（per-tab）

**Files:**
- Modify: `src/sidepanel/chat/session-store.ts`

把 store 的 actions 全部填上。仍然保留 `useSession()` shim 让旧 callsite 编译通过；shim 此时切换到读 `currentTabId` 对应的 SessionData，并把 actions 包装成"自动取 currentTabId"形式（仅 shim 内部，新代码必须显式传 tabId）。

- [ ] **Step 1: 把 actions 全部加到 store + 改 useSession 用 currentTabId**

把 `src/sidepanel/chat/session-store.ts` 整个替换为：

```ts
// src/sidepanel/chat/session-store.ts
import { create } from "zustand";
import type { ChatMessage, Json, Step, ToolUsePart } from "@/shared/types";

export type StepCardState = {
  toolUseId: string;
  name: string;
  input: Json;
  partialJson: string;
  inputReady: boolean;
  status: "draft" | "awaiting" | "running" | "ok" | "error" | "skipped" | "denied";
  output?: Json;
  error?: string;
  ms?: number;
};

export type LogEntry = {
  ts: number;
  level: "info" | "warn" | "error";
  message: string;
  details?: string;
};

export type SessionStatus =
  | "idle"
  | "streaming"
  | "awaiting"
  | "running"
  | "done"
  | "error"
  | "aborted";

export type SessionData = {
  tabId: number;
  url: string;
  runRecordId: string | null;

  messages: ChatMessage[];
  streamingAssistantText: string;
  cards: StepCardState[];

  approveAllSafe: boolean;

  status: SessionStatus;
  errorMessage: string | null;
  roundCount: number;
  tokenUsage: { input: number; output: number };

  executedSteps: Step[];
  lastOutput: Json;
  showSaveDialog: boolean;

  abortController: AbortController | null;

  logs: LogEntry[];
  logsOpen: boolean;

  inputDraft: string;
};

export type ClosedSession = {
  tabId: number;
  url: string;
  closedAt: number;
  data: SessionData;
};

export function makeEmptySession(tabId: number, url = ""): SessionData {
  return {
    tabId,
    url,
    runRecordId: null,
    messages: [],
    streamingAssistantText: "",
    cards: [],
    approveAllSafe: true,
    status: "idle",
    errorMessage: null,
    roundCount: 0,
    tokenUsage: { input: 0, output: 0 },
    executedSteps: [],
    lastOutput: null,
    showSaveDialog: false,
    abortController: null,
    logs: [],
    logsOpen: false,
    inputDraft: ""
  };
}

export const EMPTY_SESSION: SessionData = Object.freeze(makeEmptySession(-1)) as SessionData;

const CLOSED_TTL_MS = 5 * 60 * 1000;

type StoreShape = {
  sessionsByTab: Record<number, SessionData>;
  closedSessions: ClosedSession[];
  currentTabId: number | null;
};

export const useStore = create<StoreShape>(() => ({
  sessionsByTab: {},
  closedSessions: [],
  currentTabId: null
}));

function patchSession(tabId: number, fn: (s: SessionData) => SessionData): void {
  useStore.setState((state) => {
    const cur = state.sessionsByTab[tabId];
    if (!cur) return state;
    const next = fn(cur);
    if (next === cur) return state;
    return {
      ...state,
      sessionsByTab: { ...state.sessionsByTab, [tabId]: next }
    };
  });
}

// === per-tab actions ===

export function ensureSession(tabId: number, url: string): void {
  useStore.setState((state) => {
    if (state.sessionsByTab[tabId]) {
      // 仅更新 url（如果给了非空）
      if (url && state.sessionsByTab[tabId].url !== url) {
        return {
          ...state,
          sessionsByTab: {
            ...state.sessionsByTab,
            [tabId]: { ...state.sessionsByTab[tabId], url }
          }
        };
      }
      return state;
    }
    return {
      ...state,
      sessionsByTab: { ...state.sessionsByTab, [tabId]: makeEmptySession(tabId, url) }
    };
  });
}

export function setCurrentTab(tabId: number): void {
  useStore.setState({ currentTabId: tabId });
}

export function setUrl(tabId: number, url: string): void {
  patchSession(tabId, (s) => ({ ...s, url }));
}

export function appendSystemNote(tabId: number, text: string): void {
  patchSession(tabId, (s) =>
    s.messages.length === 0
      ? s
      : { ...s, messages: [...s.messages, { role: "user", content: text }] }
  );
}

export function appendUserMessage(tabId: number, text: string): void {
  patchSession(tabId, (s) => ({
    ...s,
    messages: [...s.messages, { role: "user", content: text }]
  }));
}

export function beginAssistantTurn(tabId: number): void {
  patchSession(tabId, (s) => ({ ...s, streamingAssistantText: "" }));
}

export function appendAssistantText(tabId: number, delta: string): void {
  patchSession(tabId, (s) => ({
    ...s,
    streamingAssistantText: s.streamingAssistantText + delta
  }));
}

export function finalizeAssistantTurn(tabId: number, toolUses: ToolUsePart[]): void {
  patchSession(tabId, (s) => {
    const content: ChatMessage extends { role: "assistant"; content: infer C }
      ? C
      : never = [] as never;
    const arr = content as Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Json }
    >;
    if (s.streamingAssistantText) arr.push({ type: "text", text: s.streamingAssistantText });
    for (const tu of toolUses) arr.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
    return {
      ...s,
      messages: [...s.messages, { role: "assistant", content: arr }],
      streamingAssistantText: ""
    };
  });
}

export function upsertCard(
  tabId: number,
  card: Partial<StepCardState> & { toolUseId: string }
): void {
  patchSession(tabId, (s) => {
    const idx = s.cards.findIndex((c) => c.toolUseId === card.toolUseId);
    if (idx === -1) {
      const next: StepCardState = {
        toolUseId: card.toolUseId,
        name: card.name ?? "",
        input: card.input ?? {},
        partialJson: card.partialJson ?? "",
        inputReady: card.inputReady ?? false,
        status: card.status ?? "draft",
        output: card.output,
        error: card.error,
        ms: card.ms
      };
      return { ...s, cards: [...s.cards, next] };
    }
    const merged = { ...s.cards[idx], ...card };
    const cards = s.cards.slice();
    cards[idx] = merged;
    return { ...s, cards };
  });
}

export function setCardStatus(
  tabId: number,
  toolUseId: string,
  patch: Partial<Pick<StepCardState, "status" | "output" | "error" | "ms" | "input" | "inputReady">>
): void {
  patchSession(tabId, (s) => {
    const idx = s.cards.findIndex((c) => c.toolUseId === toolUseId);
    if (idx === -1) return s;
    const cards = s.cards.slice();
    cards[idx] = { ...cards[idx], ...patch };
    return { ...s, cards };
  });
}

export function appendToolResults(
  tabId: number,
  results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>
): void {
  patchSession(tabId, (s) => ({
    ...s,
    messages: [
      ...s.messages,
      {
        role: "user",
        content: results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error
        }))
      }
    ]
  }));
}

export function pushExecutedStep(tabId: number, step: Step): void {
  patchSession(tabId, (s) => ({ ...s, executedSteps: [...s.executedSteps, step] }));
}

export function setLastOutput(tabId: number, v: Json): void {
  patchSession(tabId, (s) => ({ ...s, lastOutput: v }));
}

export function incrementRound(tabId: number): void {
  patchSession(tabId, (s) => ({ ...s, roundCount: s.roundCount + 1 }));
}

export function addUsage(
  tabId: number,
  u: { input_tokens: number; output_tokens: number }
): void {
  patchSession(tabId, (s) => ({
    ...s,
    tokenUsage: {
      input: s.tokenUsage.input + (u.input_tokens ?? 0),
      output: s.tokenUsage.output + (u.output_tokens ?? 0)
    }
  }));
}

export function setStatus(tabId: number, status: SessionStatus): void {
  patchSession(tabId, (s) => ({ ...s, status }));
}

export function setError(tabId: number, errorMessage: string | null): void {
  patchSession(tabId, (s) => ({ ...s, errorMessage }));
}

export function setApproveAllSafe(tabId: number, v: boolean): void {
  patchSession(tabId, (s) => ({ ...s, approveAllSafe: v }));
}

export function setIdentity(
  tabId: number,
  p: { url: string; runRecordId: string }
): void {
  patchSession(tabId, (s) => ({ ...s, url: p.url, runRecordId: p.runRecordId }));
}

export function setAbortController(tabId: number, ac: AbortController | null): void {
  patchSession(tabId, (s) => ({ ...s, abortController: ac }));
}

export function showSave(tabId: number): void {
  patchSession(tabId, (s) => ({ ...s, showSaveDialog: true }));
}

export function hideSave(tabId: number): void {
  patchSession(tabId, (s) => ({ ...s, showSaveDialog: false }));
}

export function appendLog(
  tabId: number,
  level: LogEntry["level"],
  message: string,
  details?: string
): void {
  patchSession(tabId, (s) => ({
    ...s,
    logs: [...s.logs, { ts: Date.now(), level, message, details }]
  }));
}

export function clearLogs(tabId: number): void {
  patchSession(tabId, (s) => ({ ...s, logs: [] }));
}

export function setLogsOpen(tabId: number, open: boolean): void {
  patchSession(tabId, (s) => ({ ...s, logsOpen: open }));
}

export function setInputDraft(tabId: number, text: string): void {
  patchSession(tabId, (s) => ({ ...s, inputDraft: text }));
}

export function resetSession(tabId: number): void {
  patchSession(tabId, (s) => ({ ...makeEmptySession(tabId, s.url) }));
}

// === closed sessions ===

export function closeTab(tabId: number): void {
  useStore.setState((state) => {
    const s = state.sessionsByTab[tabId];
    if (!s) return state;
    s.abortController?.abort();
    const { [tabId]: _gone, ...rest } = state.sessionsByTab;
    void _gone;
    if (s.messages.length === 0) {
      return { ...state, sessionsByTab: rest };
    }
    return {
      ...state,
      sessionsByTab: rest,
      closedSessions: [
        ...state.closedSessions,
        { tabId, url: s.url, closedAt: Date.now(), data: s }
      ]
    };
  });
}

export function restoreClosed(closedIndex: number, targetTabId: number): void {
  useStore.setState((state) => {
    const c = state.closedSessions[closedIndex];
    if (!c) return state;
    const restored: SessionData = {
      ...c.data,
      tabId: targetTabId,
      abortController: null,
      status: "idle",
      showSaveDialog: false,
      streamingAssistantText: "",
      runRecordId: null,
      messages: [
        ...c.data.messages,
        {
          role: "user",
          content: `[已恢复] 来自原 tab ${c.tabId}（${c.url}）的会话，请继续`
        }
      ]
    };
    const closedSessions = state.closedSessions.slice();
    closedSessions.splice(closedIndex, 1);
    return {
      ...state,
      sessionsByTab: { ...state.sessionsByTab, [targetTabId]: restored },
      closedSessions
    };
  });
}

export function pruneClosed(now: number): void {
  useStore.setState((state) => {
    const next = state.closedSessions.filter((c) => now - c.closedAt < CLOSED_TTL_MS);
    return next.length === state.closedSessions.length
      ? state
      : { ...state, closedSessions: next };
  });
}

// === selectors ===

export function getSessionFor(tabId: number): SessionData {
  return useStore.getState().sessionsByTab[tabId] ?? EMPTY_SESSION;
}

// === legacy hook (transitional; will shrink as callsites migrate) ===

export function useSession(): SessionData & {
  // 保留这些方法签名仅为旧 callsite 编译；实现走 currentTabId
  reset: () => void;
  setApproveAllSafe: (v: boolean) => void;
  setStatus: (s: SessionStatus) => void;
  setError: (msg: string | null) => void;
  setIdentity: (p: { url: string; runRecordId: string }) => void;
  appendUserMessage: (text: string) => void;
  beginAssistantTurn: () => void;
  appendAssistantText: (delta: string) => void;
  finalizeAssistantTurn: (toolUses: ToolUsePart[]) => void;
  upsertCard: (card: Partial<StepCardState> & { toolUseId: string }) => void;
  setCardStatus: (
    toolUseId: string,
    patch: Partial<Pick<StepCardState, "status" | "output" | "error" | "ms" | "input" | "inputReady">>
  ) => void;
  appendToolResults: (
    results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>
  ) => void;
  pushExecutedStep: (step: Step) => void;
  setLastOutput: (v: Json) => void;
  incrementRound: () => void;
  addUsage: (u: { input_tokens: number; output_tokens: number }) => void;
  setAbortController: (c: AbortController | null) => void;
  showSave: () => void;
  hideSave: () => void;
  appendLog: (level: LogEntry["level"], message: string, details?: string) => void;
  clearLogs: () => void;
  setLogsOpen: (open: boolean) => void;
} {
  const data = useStore((s) => {
    const id = s.currentTabId;
    return id == null ? EMPTY_SESSION : (s.sessionsByTab[id] ?? EMPTY_SESSION);
  });
  const tabId = useStore.getState().currentTabId ?? -1;

  return {
    ...data,
    reset: () => resetSession(tabId),
    setApproveAllSafe: (v) => setApproveAllSafe(tabId, v),
    setStatus: (s) => setStatus(tabId, s),
    setError: (m) => setError(tabId, m),
    setIdentity: (p) => setIdentity(tabId, p),
    appendUserMessage: (t) => appendUserMessage(tabId, t),
    beginAssistantTurn: () => beginAssistantTurn(tabId),
    appendAssistantText: (d) => appendAssistantText(tabId, d),
    finalizeAssistantTurn: (tu) => finalizeAssistantTurn(tabId, tu),
    upsertCard: (c) => upsertCard(tabId, c),
    setCardStatus: (id, p) => setCardStatus(tabId, id, p),
    appendToolResults: (r) => appendToolResults(tabId, r),
    pushExecutedStep: (s) => pushExecutedStep(tabId, s),
    setLastOutput: (v) => setLastOutput(tabId, v),
    incrementRound: () => incrementRound(tabId),
    addUsage: (u) => addUsage(tabId, u),
    setAbortController: (ac) => setAbortController(tabId, ac),
    showSave: () => showSave(tabId),
    hideSave: () => hideSave(tabId),
    appendLog: (l, m, d) => appendLog(tabId, l, m, d),
    clearLogs: () => clearLogs(tabId),
    setLogsOpen: (o) => setLogsOpen(tabId, o)
  };
}

export function useCurrentTabId(): number | null {
  return useStore((s) => s.currentTabId);
}

export function useClosedSessions(): ClosedSession[] {
  return useStore((s) => s.closedSessions);
}
```

注意：现有 `chat-page.tsx` 调 `setIdentity({ tabId, url, runRecordId })`——三参；新签名是 `setIdentity(tabId, { url, runRecordId })`——两参（tabId 在外层）。Legacy hook 内 `setIdentity: (p) => setIdentity(tabId, p)`——但旧 callsite 仍传 `{ tabId, url, runRecordId }`。让 legacy hook 兼容旧形态：

```ts
    setIdentity: (p: { tabId?: number; url: string; runRecordId: string }) =>
      setIdentity(tabId, { url: p.url, runRecordId: p.runRecordId }),
```

把上面 `useSession()` 内 `setIdentity` 那行改成这个版本。

- [ ] **Step 2: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/chat/session-store.ts
git commit -m "feat(session-store): per-tab actions + closed sessions + legacy hook"
```

---

## Task 3: session-store 单测

**Files:**
- Create: `tests/sidepanel/chat/session-store.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/sidepanel/chat/session-store.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendUserMessage,
  closeTab,
  ensureSession,
  getSessionFor,
  pruneClosed,
  resetSession,
  restoreClosed,
  setAbortController,
  setCurrentTab,
  setInputDraft,
  setUrl,
  useStore
} from "@/sidepanel/chat/session-store";

function reset() {
  useStore.setState({ sessionsByTab: {}, closedSessions: [], currentTabId: null });
}

describe("session-store per-tab", () => {
  beforeEach(reset);

  it("ensureSession creates empty SessionData and is idempotent", () => {
    ensureSession(7, "https://x.com");
    const s = getSessionFor(7);
    expect(s.tabId).toBe(7);
    expect(s.url).toBe("https://x.com");
    expect(s.messages).toEqual([]);

    // 再次 ensure 不重置 messages
    appendUserMessage(7, "hi");
    ensureSession(7, "https://x.com");
    expect(getSessionFor(7).messages).toHaveLength(1);
  });

  it("appendUserMessage targets only the given tab", () => {
    ensureSession(1, "");
    ensureSession(2, "");
    appendUserMessage(1, "in tab 1");
    expect(getSessionFor(1).messages).toHaveLength(1);
    expect(getSessionFor(2).messages).toHaveLength(0);
  });

  it("setCurrentTab does not touch sessionsByTab", () => {
    ensureSession(5, "u");
    appendUserMessage(5, "x");
    setCurrentTab(5);
    expect(useStore.getState().currentTabId).toBe(5);
    expect(getSessionFor(5).messages).toHaveLength(1);
  });

  it("setUrl updates only the target tab url", () => {
    ensureSession(1, "a");
    ensureSession(2, "b");
    setUrl(1, "a2");
    expect(getSessionFor(1).url).toBe("a2");
    expect(getSessionFor(2).url).toBe("b");
  });

  it("closeTab moves non-empty session into closedSessions", () => {
    ensureSession(9, "https://x");
    appendUserMessage(9, "hello");
    closeTab(9);
    const s = useStore.getState();
    expect(s.sessionsByTab[9]).toBeUndefined();
    expect(s.closedSessions).toHaveLength(1);
    expect(s.closedSessions[0].tabId).toBe(9);
    expect(s.closedSessions[0].data.messages).toHaveLength(1);
  });

  it("closeTab drops empty session without enqueueing", () => {
    ensureSession(3, "u");
    closeTab(3);
    expect(useStore.getState().sessionsByTab[3]).toBeUndefined();
    expect(useStore.getState().closedSessions).toHaveLength(0);
  });

  it("closeTab aborts active controller", () => {
    ensureSession(1, "u");
    const ac = new AbortController();
    setAbortController(1, ac);
    appendUserMessage(1, "x");
    closeTab(1);
    expect(ac.signal.aborted).toBe(true);
  });

  it("restoreClosed copies data to target tab and clears volatile fields", () => {
    ensureSession(1, "u1");
    appendUserMessage(1, "old");
    closeTab(1);
    ensureSession(2, "u2");
    restoreClosed(0, 2);
    const s2 = getSessionFor(2);
    expect(s2.messages.find((m) => typeof m.content === "string" && m.content === "old")).toBeTruthy();
    expect(s2.messages.at(-1)?.content).toContain("[已恢复]");
    expect(s2.abortController).toBeNull();
    expect(s2.status).toBe("idle");
    expect(useStore.getState().closedSessions).toHaveLength(0);
  });

  it("pruneClosed removes entries older than 5 minutes", () => {
    ensureSession(1, "u");
    appendUserMessage(1, "x");
    closeTab(1);
    // 手工把 closedAt 推到 6 分钟前
    useStore.setState((s) => ({
      ...s,
      closedSessions: s.closedSessions.map((c) => ({
        ...c,
        closedAt: c.closedAt - 6 * 60 * 1000
      }))
    }));
    pruneClosed(Date.now());
    expect(useStore.getState().closedSessions).toHaveLength(0);
  });

  it("setInputDraft scopes to tab", () => {
    ensureSession(1, "");
    ensureSession(2, "");
    setInputDraft(1, "draft1");
    expect(getSessionFor(1).inputDraft).toBe("draft1");
    expect(getSessionFor(2).inputDraft).toBe("");
  });

  it("resetSession keeps url but clears messages and counters", () => {
    ensureSession(1, "u");
    appendUserMessage(1, "x");
    resetSession(1);
    const s = getSessionFor(1);
    expect(s.messages).toHaveLength(0);
    expect(s.url).toBe("u");
    expect(s.status).toBe("idle");
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm test tests/sidepanel/chat/session-store.test.ts`
Expected: 11 个 test PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/sidepanel/chat/session-store.test.ts
git commit -m "test(session-store): cover per-tab actions + close/restore/prune"
```

---

## Task 4: per-tab Approver factory

**Files:**
- Modify: `src/sidepanel/chat/approval.ts`

- [ ] **Step 1: 替换为 per-tab factory，保留旧 `getGlobalApprover` 作为 deprecated alias**

```ts
// src/sidepanel/chat/approval.ts
export type Decision = { kind: "run" } | { kind: "skip" } | { kind: "deny" };

export class Approver {
  private pending = new Map<string, (d: Decision) => void>();

  request(toolUseId: string): Promise<Decision> {
    return new Promise((resolve) => {
      this.pending.set(toolUseId, resolve);
    });
  }

  resolve(toolUseId: string, decision: Decision): void {
    const r = this.pending.get(toolUseId);
    if (!r) return;
    this.pending.delete(toolUseId);
    r(decision);
  }

  resolveAllPending(decision: Decision): void {
    for (const [id, r] of this.pending) {
      r(decision);
      this.pending.delete(id);
    }
  }

  has(toolUseId: string): boolean {
    return this.pending.has(toolUseId);
  }
}

const approversByTab = new Map<number, Approver>();

export function getApproverForTab(tabId: number): Approver {
  let a = approversByTab.get(tabId);
  if (!a) {
    a = new Approver();
    approversByTab.set(tabId, a);
  }
  return a;
}

export function disposeApproverForTab(tabId: number): void {
  const a = approversByTab.get(tabId);
  if (!a) return;
  a.resolveAllPending({ kind: "deny" });
  approversByTab.delete(tabId);
}

// Plan 4 transitional alias: 旧 callsite 仍调 getGlobalApprover()，返回 tabId=-1 的实例。
// chat-page.tsx 在 Task 7 起切到 getApproverForTab。
export function getGlobalApprover(): Approver {
  return getApproverForTab(-1);
}
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/chat/approval.ts
git commit -m "feat(approval): per-tab Approver factory + dispose"
```

---

## Task 5: tab-tracker 监听 chrome.tabs

**Files:**
- Create: `src/sidepanel/chat/tab-tracker.ts`
- Create: `tests/sidepanel/chat/tab-tracker.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/sidepanel/chat/tab-tracker.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTabTracker } from "@/sidepanel/chat/tab-tracker";
import { appendUserMessage, ensureSession, getSessionFor, useStore } from "@/sidepanel/chat/session-store";

type Listener<T> = (arg: T) => void;

function setupChromeMock() {
  const onActivatedListeners: Listener<{ tabId: number }>[] = [];
  const onUpdatedListeners: Listener<[number, chrome.tabs.TabChangeInfo]>[] = [];
  const onRemovedListeners: Listener<number>[] = [];
  const tabsGet = vi.fn();
  (globalThis as unknown as { chrome: typeof chrome }).chrome = {
    tabs: {
      onActivated: {
        addListener: (l: Listener<{ tabId: number }>) => onActivatedListeners.push(l),
        removeListener: (l: Listener<{ tabId: number }>) => {
          const i = onActivatedListeners.indexOf(l);
          if (i !== -1) onActivatedListeners.splice(i, 1);
        }
      },
      onUpdated: {
        addListener: (l: (id: number, c: chrome.tabs.TabChangeInfo) => void) =>
          onUpdatedListeners.push((args) => l(args[0], args[1])),
        removeListener: () => {}
      },
      onRemoved: {
        addListener: (l: Listener<number>) => onRemovedListeners.push(l),
        removeListener: () => {}
      },
      get: tabsGet
    }
  } as unknown as typeof chrome;
  return {
    fire: {
      activated: (id: number) => onActivatedListeners.forEach((l) => l({ tabId: id })),
      updated: (id: number, change: chrome.tabs.TabChangeInfo) =>
        onUpdatedListeners.forEach((l) => l([id, change])),
      removed: (id: number) => onRemovedListeners.forEach((l) => l(id))
    },
    tabsGet
  };
}

describe("tab-tracker", () => {
  beforeEach(() => {
    useStore.setState({ sessionsByTab: {}, closedSessions: [], currentTabId: null });
  });

  it("onActivated sets currentTabId and ensures session", async () => {
    const m = setupChromeMock();
    m.tabsGet.mockResolvedValue({ url: "https://x.com" });
    installTabTracker();
    m.fire.activated(7);
    await Promise.resolve();
    await Promise.resolve();
    expect(useStore.getState().currentTabId).toBe(7);
    expect(getSessionFor(7).url).toBe("https://x.com");
  });

  it("onUpdated url change appends system note when messages non-empty", async () => {
    const m = setupChromeMock();
    m.tabsGet.mockResolvedValue({ url: "u1" });
    installTabTracker();
    ensureSession(1, "u1");
    appendUserMessage(1, "hi");
    m.fire.updated(1, { url: "u2" });
    expect(getSessionFor(1).url).toBe("u2");
    const last = getSessionFor(1).messages.at(-1);
    expect(last && typeof last.content === "string" && last.content.includes("u2")).toBe(true);
  });

  it("onUpdated url change skips system note when messages empty", () => {
    const m = setupChromeMock();
    m.tabsGet.mockResolvedValue({ url: "u1" });
    installTabTracker();
    ensureSession(1, "u1");
    m.fire.updated(1, { url: "u2" });
    expect(getSessionFor(1).messages).toHaveLength(0);
  });

  it("onRemoved closes the tab session", () => {
    const m = setupChromeMock();
    installTabTracker();
    ensureSession(2, "u");
    appendUserMessage(2, "x");
    m.fire.removed(2);
    expect(useStore.getState().sessionsByTab[2]).toBeUndefined();
    expect(useStore.getState().closedSessions).toHaveLength(1);
  });

  it("uninstall stops dispatching", () => {
    const m = setupChromeMock();
    m.tabsGet.mockResolvedValue({ url: "u" });
    const off = installTabTracker();
    off();
    m.fire.activated(99);
    expect(useStore.getState().currentTabId).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm test tests/sidepanel/chat/tab-tracker.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```ts
// src/sidepanel/chat/tab-tracker.ts
import {
  appendSystemNote,
  closeTab,
  ensureSession,
  getSessionFor,
  setCurrentTab,
  setUrl
} from "./session-store";
import { disposeApproverForTab } from "./approval";

export function installTabTracker(): () => void {
  const onAct = ({ tabId }: { tabId: number }) => {
    setCurrentTab(tabId);
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        ensureSession(tabId, tab.url ?? "");
      })
      .catch(() => {
        ensureSession(tabId, "");
      });
  };

  const onUpd = (tabId: number, change: chrome.tabs.TabChangeInfo) => {
    if (!change.url) return;
    setUrl(tabId, change.url);
    if (getSessionFor(tabId).messages.length > 0) {
      appendSystemNote(tabId, `[页面跳转] 新 URL: ${change.url}`);
    }
  };

  const onRem = (tabId: number) => {
    closeTab(tabId);
    disposeApproverForTab(tabId);
  };

  chrome.tabs.onActivated.addListener(onAct);
  chrome.tabs.onUpdated.addListener(onUpd);
  chrome.tabs.onRemoved.addListener(onRem);

  return () => {
    chrome.tabs.onActivated.removeListener(onAct);
    chrome.tabs.onUpdated.removeListener(onUpd);
    chrome.tabs.onRemoved.removeListener(onRem);
  };
}
```

- [ ] **Step 4: 跑测试，确认全过**

Run: `pnpm test tests/sidepanel/chat/tab-tracker.test.ts`
Expected: 5 个 test PASS。

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/chat/tab-tracker.ts tests/sidepanel/chat/tab-tracker.test.ts
git commit -m "feat(chat): tab-tracker mapping chrome.tabs events to per-tab actions"
```

---

## Task 6: closed-sessions-pruner hook

**Files:**
- Create: `src/sidepanel/chat/closed-sessions-pruner.ts`

- [ ] **Step 1: 实现**

```ts
// src/sidepanel/chat/closed-sessions-pruner.ts
import { useEffect } from "react";
import { pruneClosed } from "./session-store";

export function useClosedSessionsPruner(intervalMs = 30_000): void {
  useEffect(() => {
    const t = setInterval(() => pruneClosed(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/chat/closed-sessions-pruner.ts
git commit -m "feat(chat): add closed-sessions pruner hook"
```

---

## Task 7: closed-sessions-banner 组件

**Files:**
- Create: `src/sidepanel/components/closed-sessions-banner.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/sidepanel/components/closed-sessions-banner.tsx
import {
  restoreClosed,
  useClosedSessions,
  useCurrentTabId,
  useStore,
  type ClosedSession
} from "../chat/session-store";

function firstUserText(s: ClosedSession): string {
  const m = s.data.messages.find((m) => m.role === "user" && typeof m.content === "string");
  if (!m || typeof m.content !== "string") return "(无文本)";
  return m.content.slice(0, 30) + (m.content.length > 30 ? "…" : "");
}

function shortHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname.length > 1 ? u.pathname.slice(0, 16) : "");
  } catch {
    return url.slice(0, 30);
  }
}

function ago(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s 前`;
  return `${Math.floor(sec / 60)}m 前`;
}

export function ClosedSessionsBanner() {
  const closed = useClosedSessions();
  const currentTabId = useCurrentTabId();
  if (closed.length === 0 || currentTabId == null) return null;

  function onRestore(idx: number) {
    if (currentTabId == null) return;
    const cur = useStore.getState().sessionsByTab[currentTabId];
    if (cur && cur.messages.length > 0) {
      if (!confirm("将覆盖当前 tab 会话？")) return;
    }
    restoreClosed(idx, currentTabId);
  }

  return (
    <div className="bg-zinc-900/60 border-b border-zinc-800 p-2 text-xs">
      <div className="text-zinc-300 mb-1">📁 近期会话（5 分钟内可恢复）</div>
      <ul className="space-y-1">
        {closed.map((c, i) => (
          <li key={`${c.tabId}-${c.closedAt}`} className="flex items-center gap-2">
            <span className="flex-1 truncate text-zinc-200">{firstUserText(c)}</span>
            <span className="text-zinc-500 truncate">{shortHost(c.url)}</span>
            <span className="text-zinc-500 shrink-0">{ago(c.closedAt)}</span>
            <button
              onClick={() => onRestore(i)}
              className="px-2 py-0.5 bg-emerald-700 rounded shrink-0"
            >
              恢复
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/closed-sessions-banner.tsx
git commit -m "feat(sidepanel): closed-sessions banner with restore"
```

---

## Task 8: tab-info-bar 组件

**Files:**
- Create: `src/sidepanel/components/tab-info-bar.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/sidepanel/components/tab-info-bar.tsx
import { useCurrentTabId, useSession } from "../chat/session-store";

export function TabInfoBar() {
  const tabId = useCurrentTabId();
  const session = useSession();
  if (tabId == null || !session.url) return null;
  let display = session.url;
  try {
    const u = new URL(session.url);
    display = u.host + (u.pathname.length > 1 ? u.pathname : "");
  } catch {
    // keep raw
  }
  return (
    <div className="px-2 py-0.5 text-[11px] text-zinc-500 border-b border-zinc-900 bg-zinc-950 flex items-center gap-2">
      <span className="text-zinc-600">[Tab #{tabId}]</span>
      <span className="truncate">{display}</span>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/tab-info-bar.tsx
git commit -m "feat(sidepanel): tab-info-bar showing current tabId + url"
```

---

## Task 9: chat-page send() 改造（传 tabId）

**Files:**
- Modify: `src/sidepanel/pages/chat-page.tsx`

把 chat-page 内 onEvent 的所有 store 调用从 legacy `session.actionXXX(...)` 形式改成显式 `actionXXX(tabId, ...)`，approver 改 per-tab。

- [ ] **Step 1: import 替换**

把 chat-page 顶部 imports 中：

```ts
import { getGlobalApprover } from "../chat/approval";
import { useSession } from "../chat/session-store";
```

替换为：

```ts
import { getApproverForTab } from "../chat/approval";
import {
  addUsage,
  appendAssistantText,
  appendLog,
  appendUserMessage,
  beginAssistantTurn,
  ensureSession,
  finalizeAssistantTurn,
  hideSave,
  incrementRound,
  pushExecutedStep,
  resetSession,
  setAbortController,
  setApproveAllSafe,
  setCardStatus,
  setError,
  setIdentity,
  setInputDraft,
  setLastOutput,
  setLogsOpen,
  setStatus,
  showSave,
  upsertCard,
  useSession,
  useStore
} from "../chat/session-store";
```

(注意保留 `useSession` 用于读 currentTab 数据；写操作改用具名 import)

- [ ] **Step 2: 替换 send() 整体实现**

把 chat-page.tsx 中现有的 `const send = useCallback(...)` 函数体（从 `if (!prompt.trim()) return;` 到末尾的 `[session, settings, initialContext]`）整段替换为：

```tsx
  const send = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;
      if (!settings.apiKey) {
        const cur = useStore.getState().currentTabId;
        if (cur != null) setError(cur, "请先在设置页填入 API Key");
        return;
      }
      const { tabId, url } = await currentTabInfo();
      ensureSession(tabId, url);
      setIdentity(tabId, { url, runRecordId: "" });
      setError(tabId, null);
      setStatus(tabId, "streaming");
      appendUserMessage(tabId, prompt);
      appendLog(
        tabId,
        "info",
        `提交 prompt`,
        `provider=${settings.provider} model=${settings.model} endpoint=${settings.endpoint || "(默认)"} maxRounds=${settings.maxRounds}\n---\n${prompt}`
      );
      setInputDraft(tabId, "");
      setInput("");
      const ac = new AbortController();
      setAbortController(tabId, ac);
      const client = pickClient(settings.provider);
      const runner = new RpcToolRunner((req) =>
        chrome.runtime.sendMessage(req) as Promise<{ ok: true; data: Json } | { ok: false; error: string }>
      );

      function stepFromCard(id: string): Step {
        const card = useStore.getState().sessionsByTab[tabId]?.cards.find((c) => c.toolUseId === id);
        if (!card) throw new Error(`card not found: ${id}`);
        if (card.name === "runJS") {
          return { kind: "js", source: (card.input as { source: string }).source };
        }
        return { kind: "tool", tool: card.name as BuiltinTool, args: card.input };
      }

      const onEvent = (e: SessionEvent) => {
        switch (e.type) {
          case "round_start":
            incrementRound(tabId);
            beginAssistantTurn(tabId);
            appendLog(tabId, "info", `round ${e.round + 1} 开始`);
            break;
          case "text_delta":
            appendAssistantText(tabId, e.text);
            break;
          case "tool_use_start":
            upsertCard(tabId, { toolUseId: e.id, name: e.name, status: "draft", inputReady: false });
            appendLog(tabId, "info", `tool_use_start: ${e.name} (${e.id})`);
            break;
          case "tool_use_input_delta": {
            const fresh = useStore.getState().sessionsByTab[tabId]?.cards.find((c) => c.toolUseId === e.id);
            upsertCard(tabId, {
              toolUseId: e.id,
              partialJson: (fresh?.partialJson ?? "") + e.partial_json
            });
            break;
          }
          case "tool_use_end":
            upsertCard(tabId, { toolUseId: e.id, input: e.input, inputReady: true, status: "awaiting" });
            setStatus(tabId, "awaiting");
            appendLog(tabId, "info", `tool_use_end: ${e.id}`, JSON.stringify(e.input, null, 2));
            break;
          case "assistant_turn_end":
            finalizeAssistantTurn(tabId, e.toolUses);
            break;
          case "tool_running":
            setCardStatus(tabId, e.id, { status: "running" });
            setStatus(tabId, "running");
            appendLog(tabId, "info", `step running: ${e.id}`);
            break;
          case "tool_done":
            setCardStatus(tabId, e.id, { status: "ok", output: e.output, ms: e.ms });
            pushExecutedStep(tabId, stepFromCard(e.id));
            setLastOutput(tabId, e.output);
            setStatus(tabId, "streaming");
            appendLog(tabId, "info", `step ok: ${e.id} (${e.ms}ms)`);
            break;
          case "tool_error":
            setCardStatus(tabId, e.id, { status: "error", error: e.error, ms: e.ms });
            setStatus(tabId, "streaming");
            appendLog(tabId, "error", `step error: ${e.id}`, e.error);
            break;
          case "tool_skipped":
            setCardStatus(tabId, e.id, { status: "skipped" });
            appendLog(tabId, "warn", `step skipped: ${e.id}`);
            break;
          case "usage":
            addUsage(tabId, { input_tokens: e.input_tokens, output_tokens: e.output_tokens });
            break;
          case "stream_error":
            appendLog(tabId, "error", "LLM stream error", e.error);
            setError(tabId, e.error);
            setLogsOpen(tabId, true);
            break;
          case "exception":
            appendLog(tabId, "error", "exception in run-session", e.error);
            setError(tabId, e.error);
            setLogsOpen(tabId, true);
            break;
          case "session_end":
            appendLog(
              tabId,
              e.status === "done" ? "info" : "warn",
              `session_end: ${e.status}${e.reason ? " — " + e.reason : ""}`
            );
            if (e.status === "done") {
              setStatus(tabId, "done");
            } else if (e.status === "max_rounds") {
              setStatus(tabId, "error");
              setError(tabId, "达到最大轮数");
              setLogsOpen(tabId, true);
            } else if (e.status === "aborted") {
              setStatus(tabId, "aborted");
            } else {
              setStatus(tabId, "error");
              if (e.reason) setError(tabId, e.reason);
              setLogsOpen(tabId, true);
            }
            break;
        }
      };

      const approver = getApproverForTab(tabId);
      try {
        await runChatSession({
          client,
          runner,
          approver,
          rpc: {
            startSession: (i) => rpc.startSession(i).then((r) => ({ id: r.id })),
            appendStepLog: (runId, entry) => rpc.appendStepLog(runId, entry),
            finalizeSession: (runId, status, output) => rpc.finalizeSession(runId, status, output)
          },
          input: { userPrompt: prompt, tabId, url },
          settings: { ...settings, autoApproveDangerous: settings.autoApproveDangerous ?? [] },
          systemPrompt: buildSystemPrompt({ url }),
          tools: TOOL_DEFS,
          approveAllSafe: useStore.getState().sessionsByTab[tabId]?.approveAllSafe ?? true,
          abortSignal: ac.signal,
          onEvent,
          initialMessages: initialContext ? [{ role: "user", content: initialContext }] : undefined
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(tabId, msg);
        setStatus(tabId, "error");
      } finally {
        approver.resolveAllPending({ kind: "deny" });
        setAbortController(tabId, null);
      }
    },
    [settings, initialContext]
  );
```

注意几个细节：
- `setIdentity` 现在两参签名：`setIdentity(tabId, { url, runRecordId })`
- approver 通过 `getApproverForTab(tabId)` 取，不再用 module-level
- `approveAllSafe` 从 store 直接读，不通过 React state，避免 stale closure

- [ ] **Step 3: 改 handleApprove + clearChat**

找到现有的：

```tsx
  const handleApprove = useCallback(
    (id: string, decision: "run" | "skip" | "deny") => {
      approver.resolve(id, { kind: decision });
      session.setCardStatus(id, {
        status: decision === "run" ? "running" : decision === "skip" ? "skipped" : "denied"
      });
    },
    [session, approver]
  );

  const clearChat = useCallback(() => {
    session.abortController?.abort();
    approver.resolveAllPending({ kind: "deny" });
    session.reset();
  }, [session, approver]);
```

替换为：

```tsx
  const handleApprove = useCallback(
    (id: string, decision: "run" | "skip" | "deny") => {
      const tabId = useStore.getState().currentTabId;
      if (tabId == null) return;
      getApproverForTab(tabId).resolve(id, { kind: decision });
      setCardStatus(tabId, id, {
        status: decision === "run" ? "running" : decision === "skip" ? "skipped" : "denied"
      });
    },
    []
  );

  const clearChat = useCallback(() => {
    const tabId = useStore.getState().currentTabId;
    if (tabId == null) return;
    const cur = useStore.getState().sessionsByTab[tabId];
    cur?.abortController?.abort();
    getApproverForTab(tabId).resolveAllPending({ kind: "deny" });
    resetSession(tabId);
  }, []);
```

并把文件顶部的：

```ts
const approver = getGlobalApprover();
```

整行删除。

- [ ] **Step 4: 输入框 ↔ inputDraft 双向绑定**

找到 textarea 那段，它现在只读 React state `input`。改为：

```tsx
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const tabId = useStore.getState().currentTabId;
            if (tabId != null) setInputDraft(tabId, e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              const busy =
                session.status === "streaming" ||
                session.status === "awaiting" ||
                session.status === "running";
              if (!busy && input.trim()) send(input);
            }
          }}
          placeholder={'要让 AI 做什么？例如"总结此页"/"填写注册表单"/"采集前 50 条评论"（Ctrl/⌘ + Enter 发送）'}
          rows={3}
          className="bg-zinc-900 rounded p-2 text-xs resize-none"
        />
```

并在 `send()` 之外、组件顶层加一个 effect：切 tab 时把 input 同步到该 tab 的 inputDraft。

先在 ChatPage 顶部（`const session = useSession();` 附近）增加：

```tsx
  const currentTabId = useCurrentTabId();
```

然后加 effect：

```tsx
  useEffect(() => {
    setInput(session.inputDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTabId]);
```

注意 `useCurrentTabId` 要 import。

- [ ] **Step 5: 在 mount useEffect 里把 ensureSession 留下，但不再调 reset**

原 mount effect：

```tsx
  useEffect(() => {
    let active = true;
    (async () => {
      const { tabId, url } = await currentTabInfo();
      if (!active) return;
      const tools = await rpc.matchingTools(url);
      if (!active) return;
      setRecommendations(tools);
      // 仅刷新 tab 信息；保留消息流，避免 nav 切换丢失对话
      useSession.setState({ tabId, url });
    })();
    ...
  }, []);
```

把 `useSession.setState({ tabId, url });` 这行替换为：

```tsx
      ensureSession(tabId, url);
      setCurrentTab(tabId);
```

（也要 import `setCurrentTab`）

- [ ] **Step 6: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 退出码 0。

- [ ] **Step 7: Commit**

```bash
git add src/sidepanel/pages/chat-page.tsx
git commit -m "feat(chat-page): pass tabId to all session actions; per-tab approver + inputDraft"
```

---

## Task 10: chat-view 用 per-tab approver

**Files:**
- Modify: `src/sidepanel/components/chat-view.tsx`

`chat-view.tsx` 自己不调 approver，但要保证 `needsApproval` 仍正确。它已经用 `useSession()` 读 `approveAllSafe`——legacy hook 已经返回 currentTab 的值，无需改。

但要确认 `useSettings()` 还在用——保持不变。

实际上 chat-view 不需要改任何代码。但出于完整性，确认一遍：

- [ ] **Step 1: 跑 typecheck + 测试 + 构建**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 全过。

- [ ] **Step 2: 不需要 commit（无文件变化）**

如果 typecheck 偶尔报错，再开 task 修。否则跳过此 task。

---

## Task 11: logs-drawer 用 per-tab actions

**Files:**
- Modify: `src/sidepanel/components/logs-drawer.tsx`

logs-drawer 的 `clearLogs` / `setLogsOpen` 走 legacy useSession——legacy 内部已 dispatch 到 currentTab，无须改。但为了未来移除 legacy，本 task 直接迁移它到具名 actions。

- [ ] **Step 1: 替换实现**

```tsx
// src/sidepanel/components/logs-drawer.tsx
import {
  clearLogs,
  setLogsOpen,
  useCurrentTabId,
  useSession,
  type LogEntry
} from "../chat/session-store";

function fmt(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function colorFor(level: LogEntry["level"]): string {
  if (level === "error") return "text-red-400";
  if (level === "warn") return "text-amber-400";
  return "text-zinc-400";
}

export function LogsDrawer() {
  const tabId = useCurrentTabId();
  const { logs, logsOpen } = useSession();
  if (!logsOpen) return null;

  async function copy() {
    const text = logs
      .map(
        (l) =>
          `[${fmt(l.ts)}] ${l.level.toUpperCase()} ${l.message}${l.details ? "\n" + l.details : ""}`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 max-h-[40%] flex flex-col">
      <div className="flex items-center gap-2 p-2 border-b border-zinc-800 text-xs">
        <span className="text-zinc-300 font-medium">日志（{logs.length}）</span>
        <button onClick={copy} className="px-2 py-0.5 bg-zinc-700 rounded text-[11px]">
          复制
        </button>
        <button
          onClick={() => tabId != null && clearLogs(tabId)}
          className="px-2 py-0.5 bg-zinc-700 rounded text-[11px]"
        >
          清空
        </button>
        <button
          onClick={() => tabId != null && setLogsOpen(tabId, false)}
          className="ml-auto px-2 py-0.5 bg-zinc-700 rounded text-[11px]"
        >
          关闭
        </button>
      </div>
      <ol className="overflow-auto p-2 space-y-1 font-mono">
        {logs.length === 0 && <li className="text-zinc-500 text-[11px]">暂无日志</li>}
        {logs.map((l, i) => (
          <li key={i} className="text-[11px] leading-tight">
            <span className="text-zinc-600">{fmt(l.ts)}</span>{" "}
            <span className={colorFor(l.level)}>{l.level}</span>{" "}
            <span className="text-zinc-200 whitespace-pre-wrap">{l.message}</span>
            {l.details && (
              <pre className="mt-1 text-[10px] text-zinc-400 bg-zinc-900 rounded p-1 overflow-auto max-h-32">
                {l.details}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/logs-drawer.tsx
git commit -m "refactor(logs-drawer): use per-tab actions explicitly"
```

---

## Task 12: app.tsx 安装 tab-tracker + pruner + banner

**Files:**
- Modify: `src/sidepanel/app.tsx`

- [ ] **Step 1: 加 imports + 钩子 + 顶部 banner**

把整个 `src/sidepanel/app.tsx` 替换为：

```tsx
import { useEffect, useState } from "react";
import { useClosedSessionsPruner } from "./chat/closed-sessions-pruner";
import { installTabTracker } from "./chat/tab-tracker";
import { ClosedSessionsBanner } from "./components/closed-sessions-banner";
import { TabInfoBar } from "./components/tab-info-bar";
import { ChatPage } from "./pages/chat-page";
import { RunPage } from "./pages/run-page";
import { SettingsPage } from "./pages/settings-page";
import { ToolDetailPage } from "./pages/tool-detail-page";
import { ToolsPage } from "./pages/tools-page";

type Route =
  | { name: "chat"; initialPrompt?: string; initialContext?: string }
  | { name: "run" }
  | { name: "tools" }
  | { name: "tool"; id: string }
  | { name: "settings" };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "chat" });

  useEffect(() => {
    const off = installTabTracker();
    return () => off();
  }, []);
  useClosedSessionsPruner();

  function fixWithAi(opts: { initialPrompt: string; initialContext: string }) {
    setRoute({ name: "chat", initialPrompt: opts.initialPrompt, initialContext: opts.initialContext });
  }

  return (
    <div className="h-full flex flex-col">
      <nav className="flex gap-1 p-2 border-b border-zinc-800 text-xs">
        <NavBtn active={route.name === "chat"} onClick={() => setRoute({ name: "chat" })}>
          对话
        </NavBtn>
        <NavBtn active={route.name === "tools" || route.name === "tool"} onClick={() => setRoute({ name: "tools" })}>
          工具库
        </NavBtn>
        <NavBtn active={route.name === "run"} onClick={() => setRoute({ name: "run" })}>
          DEV: JSON
        </NavBtn>
        <NavBtn active={route.name === "settings"} onClick={() => setRoute({ name: "settings" })}>
          设置
        </NavBtn>
      </nav>
      {route.name === "chat" && (
        <>
          <ClosedSessionsBanner />
          <TabInfoBar />
        </>
      )}
      <main className="flex-1 overflow-hidden">
        {route.name === "chat" && (
          <ChatPage
            key={(route.initialPrompt ?? "") + (route.initialContext ?? "")}
            initialPrompt={route.initialPrompt}
            initialContext={route.initialContext}
          />
        )}
        {route.name === "run" && <RunPage />}
        {route.name === "tools" && <ToolsPage onOpen={(id) => setRoute({ name: "tool", id })} />}
        {route.name === "tool" && (
          <ToolDetailPage
            id={route.id}
            onBack={() => setRoute({ name: "tools" })}
            onFixWithAi={fixWithAi}
          />
        )}
        {route.name === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

function NavBtn(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={
        "px-3 py-1 rounded " +
        (props.active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200")
      }
    >
      {props.children}
    </button>
  );
}
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build`
Expected: 退出码 0。

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/app.tsx
git commit -m "feat(sidepanel): mount tab-tracker + pruner + closed banner + tab info"
```

---

## Task 13: 全量回归

**Files:** 无

- [ ] **Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: 退出码 0。

- [ ] **Step 2: 全量单元测试**

Run: `pnpm test`
Expected: 所有 test PASS。预期数：

- 既有 134 个
- 新增：session-store.test.ts 11 个 + tab-tracker.test.ts 5 个 = 16
- 合计 134 + 16 = **150 tests**（spec 估的 ~149，相差 1 不影响）

- [ ] **Step 3: 构建**

Run: `pnpm build`
Expected: 退出码 0。

- [ ] **Step 4: 手测验证**

按 README 三个手测脚本，再加 per-tab 验证：

1. **per-tab 隔离**：
   - tab A 打开 商品详情页，发"采主图"
   - 切到 tab B 打开维基百科页，发"用三个要点总结"
   - 切回 tab A，会话历史仍是商品采集那段；切回 B，是维基那段

2. **navigate 内 system note**：
   - 同一 tab 内点链接到新 URL
   - 检查 messages 末尾应有 `[页面跳转] 新 URL: ...`

3. **关 tab 进 closed-sessions banner**：
   - 在 tab A 发过几条消息，关掉 tab A
   - 顶部出现"近期会话"banner
   - 在另一个 tab 点"恢复"，验证消息流恢复 + 末尾有"[已恢复]" system note
   - 等 5 分钟，banner 消失

4. **多 tab 后台并行**：
   - tab A 发指令，AI 还在跑（streaming）时切到 tab B
   - 在 tab B 不应该看到 tab A 的进度
   - 切回 tab A 应能继续看到流式进度（或已完成）

如有失败，记录控制台报错并修复。

- [ ] **Step 5: 收尾 commit（如手测发现 bug 修补）**

```bash
# 通常无新文件
echo "Plan 4 complete"
```

---

## 自检清单（Plan 4 完成后必须确认）

- [ ] 全量单元测试通过（约 150 个）
- [ ] 类型检查通过
- [ ] dist 装载后，多 tab 间会话相互隔离
- [ ] 同 tab 内 navigate 不重置会话，会话末尾出现 system note
- [ ] 关 tab 后顶部出现"近期会话"banner，5 min 后消失
- [ ] 后台跑会话时切 tab 不影响进度（切回看到完整进度）
- [ ] 输入框 draft 按 tab 隔离（切 tab 后 input 显示该 tab 的 draft）
- [ ] tab-info-bar 显示当前 tabId + 简短 url
- [ ] 既有 100+ tests 仍通过（无回归）
