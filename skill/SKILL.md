# atwebpilot-browser skill

A reusable strategy for agents that drive AtWebPilot's browser extension via
MCP. Inspired by AIPex's [aipex-browser](https://github.com/AIPexStudio/AIPex)
pattern: tool usage flow, common scenarios, safety rails — all in one bundle
so an agent doesn't have to discover them from scratch.

## Capabilities you have

When this skill is loaded, you can drive any open tab through these tools
(exposed by `@attson/atwebpilot-mcp`):

### Control plane

- `list_tabs` — enumerate Chrome tabs you can operate on. Entries carry `busy`
  and `busy_label` when **another** Claude Code session is already driving that
  tab, and `mine` for tabs you hold. This is advisory — nothing blocks you — but
  contending for a tab another agent is typing into is rarely what you want.
  Open your own with `browser_openTab` instead.
- `open_session(tabId)` — pin a tab so subsequent calls target it
- `close_session(sessionId)` — release the tab
- `get_quota(sessionId)` — see remaining requests this minute

### Browser-side built-ins (per session)

| Class | Tools |
|---|---|
| 探查（safe） | `snapshotDOM`, `takeSnapshot`, `findElements`, `querySelector`, `querySelectorAll`, `extractText`, `extractImages`, `getValue`, `extractFormState`, `getPageInfo`, `hover`, `focus` |
| 页面索引（safe） | `createPageIndex`, `searchPageIndex`, `readPageBlock`, `extractPageFields` |
| 流程（safe） | `scroll`, `waitFor`, `navigate`, `navigateBack`, `navigateForward`, `resize` |
| 交互（caution） | `click`, `clickByUid`, `fillInput`, `fillByUid`, `fillForm`, `setCheckbox`, `selectOption`, `pressKey`, `drag`, `drop` |
| 观察（safe → dangerous） | `consoleMessages`（safe）, `networkRequests`（caution）, `networkRequestDetail`（**dangerous**）, `handleDialog`, `recorderConfig` |
| 视觉 | `screenshot`（支持 `fullPage` / `selector` / `blockId`） |
| 网络（caution / dangerous） | `httpRequest`（按 `withCredentials` 区分）, `runJS`（按静态扫描结果区分） |
| 重写态（dangerous） | `submitForm`, `uploadFile`, `readStorage`, `writeStorage` |
| 导出 | `downloadImage`, `downloadSpreadsheet`（真 `.xlsx`，多 sheet） |
| 跨 tab | `listTabs`, `openTab`, `closeTab`, `switchToTab` |
| 浏览器数据 | `searchBookmarks`, `searchHistory` |

All of these are prefixed `browser_` over MCP, e.g. `browser_takeSnapshot`.
`askUser`, `attachTab` and `detachTab` are **not** exposed: an MCP session has
no human at the side panel, and its tab is already bound by `open_session`.

Set `ATWEBPILOT_MCP_TOOLS=parity` to trim the surface to the subset that
covers playwright-ext one-for-one, if the full list costs too much context.

## Recommended flow

1. **探查先于操作**：每次进入新页面，先 `snapshotDOM` 看结构，再 `querySelector` 定位关键节点。
2. **小步快跑**：每次只动一个元素，验证 DOM 变化后再继续，避免连点连填触发反爬。
3. **dangerous 工具会被人工审核**：调用前用 `extractText` 给用户看上下文，让审批更顺。
4. **跑不动了就 `askUser`**：候选不唯一、缺关键信息、需要二次确认时主动询问，不要瞎猜。
5. **完成后给一个简洁的总结**：用户希望看到「做了 N 步，最终结果 X」，不希望看流水账。

## Scenarios

### 总结此页

```
snapshotDOM({ maxDepth: 4 })
extractText({ selector: "main, article, .content" })
→ 文本总结
```

### 填表 + 提交

```
snapshotDOM()  // 找输入框
fillInput({ selector: "#name", value: "张三" })
setCheckbox({ selector: "#agree", checked: true })
selectOption({ selector: "#city", value: "北京" })
→ askUser({ kind: "confirm", prompt: "确认提交吗？" })
→ submitForm()  // dangerous，审批通过后执行
```

### 翻页采集

```
snapshotDOM({ selector: "[data-pagination]" })  // 找翻页结构
extractText({ selector: ".item", multiple: true })
→ 累积到内存
→ click({ selector: ".next" })
waitFor({ selector: ".item:nth-child(N+1)" })
→ 重复
```

### 跨 tab 协作

```
listTabs()
openTab({ url: "https://example.com" })  // 自动 attach
→ 在新 tab 操作
detachTab({ tabId })  // 完成后释放
```

## Safety / quota rails

- **Quota**：默认 60 请求/分钟。超过会被拒绝，到 60s 自动恢复。先 `get_quota` 看额度。
- **Dangerous gating**：用户已在 sidepanel 配置了授权模式（read / default / trust / yolo），你不需要预判，调就是了，会被拦下来或自动通过。
- **超时**：默认每步 30s。慢操作（大页面 snapshot、长等待）记得显式传 `timeoutMs`。

## Don'ts

- ❌ 不要在 `runJS` 里直接读 cookie / localStorage（会被静态扫描归 dangerous，每次问审批）
- ❌ 不要循环调 `snapshotDOM`——单次抓全树用 `maxDepth` 而不是多次
- ❌ 不要把 `askUser` 当闲聊（每次弹窗用户都要点确认）
- ❌ 不要无视 `attachedTabs`——AI 跨 tab 操作前用 `attachTab` 申请

## When to use

- 用户要你「在网页上做某事」、「抓某站点数据」、「填某表单」
- 用户给了一个 URL 让你看
- 用户问「这页面在讲什么」

## When NOT to use

- 纯文本任务（写代码、改文件）不需要浏览器
- 用户明确说「不要打开浏览器」
- 网页需要复杂登录但用户没在浏览器里登录过

## Reference

- README: https://github.com/attson/atwebpilot
- 工具完整 schema 由 mcp-server 的 `tools/list` 暴露

## Observing a page: console, network, dialogs

These read from a recorder that is running on the page already, so you can ask
about things that happened *before* you called.

**Two backends, and you must check which one you got.** Every result carries
`backend`:

- `main-world` (default) — patches installed in the page's own realm. Cannot
  see messages emitted before the patches installed, browser-level CORS/CSP
  errors, or requests made by a service worker.
- `cdp` — `chrome.debugger`, opt-in from the extension settings. Sees all of
  the above plus real response bodies.

If a result carries `degradedReason`, a CDP session was expected but is gone
(DevTools opened, or another extension took the tab). Treat the data as
incomplete rather than concluding the page did nothing. If it carries
`disabled`, the recorder is not on that page at all.

**Response bodies are off by default.** They cost memory on every page the user
visits, so arm them first and then reproduce:

```
browser_recorderConfig({ bodies: true })   → arm
… trigger the request …
browser_networkRequests({ urlPattern: "/api/" })
browser_networkRequestDetail({ id: <id from above> })
```

Calling `networkRequestDetail` without arming returns metadata plus
`bodyUnavailable` explaining the fix. Note this tool is **dangerous**: response
headers routinely carry `Authorization`, `Set-Cookie`, and bearer tokens.

**`handleDialog` is a pre-set policy on the default backend, not a reaction.**
`alert`, `confirm`, and `prompt` are synchronous, so a patched implementation
cannot pause and ask you. Declare what should happen *before* triggering the
dialog:

```
browser_handleDialog({ accept: true, promptText: "yes", scope: "all" })
… click the thing that opens the dialog …
browser_handleDialog({ accept: true })   → also returns the recorded dialogs
```

Under the CDP backend the dialog genuinely suspends, and a `handleDialog` call
answers the pending one immediately.

Until you arm it, dialogs behave exactly as they would without the extension —
the recorder never silently changes page behaviour.

## Debugging flow

When a page misbehaves, this ordering costs the least context:

1. `browser_consoleMessages({ level: "error" })` — cheap, and already buffered.
2. `browser_networkRequests({ status: 500 })` or `{ urlPattern: "/api/" }` —
   summaries only.
3. `browser_recorderConfig({ bodies: true })`, reproduce, then
   `browser_networkRequestDetail({ id })` for the one request that matters.

Poll incrementally with `sinceId` rather than re-reading the whole buffer. If a
result reports `dropped > 0`, the ring overflowed and you are seeing a window,
not the whole history.

## Multiple sessions share one browser

Several Claude Code sessions can be attached to the same browser at once, each
through its own connection. Two consequences worth knowing:

- **The first call that needs the browser waits for pairing.** The MCP server
  binds its port lazily and opens a confirmation page in the user's browser.
  Ask the user only to click Allow; keep the original call pending. It resumes
  automatically when the extension connects, so do not ask the user to report
  success or manually retry. Pairing denial or the 90-second timeout returns an
  actionable error. Once approved, every later session on that machine connects
  silently.
- **Pick a free tab.** `list_tabs` marks tabs held by other sessions as `busy`.
  Prefer an unowned tab, or open your own — two agents typing into one form
  produces failures that look like your own tool calls not working.
