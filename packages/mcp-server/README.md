# @attson/atwebpilot-mcp

让 Codex 或 Claude Code 经一个本地 ws 中继驱动 atwebpilot 浏览器扩展操作网页（读 / 写 / 采）。

## 给用户：一行装

Codex：

    codex mcp add atwebpilot -- npx -y @attson/atwebpilot-mcp

Claude Code：

    claude mcp add atwebpilot --scope user -- npx -y @attson/atwebpilot-mcp

然后[下载 release zip](https://github.com/attson/atwebpilot/releases/latest) 加载已解压扩展。

**不需要手填端口。** 从 Plan 33 起是配对流程：

1. 会话启动时**不绑任何端口** —— 不碰网页的会话零副作用。
2. AI 第一次调 `list_tabs` / `browser_*` 时才绑一个空闲端口，并自动打开配对页。
3. 你在浏览器里点「允许」，扩展即接入，重试那次调用即可。
4. 之后本机的会话都免确认（信任是安装级的）；端口能复用时连配对页都不会弹。

多个 Codex / Claude Code 会话可以同时接入同一个浏览器，各自一条连接。可在扩展设置 →
Coordinator 查看已接入的会话、单独断开，或撤销信任。

可选环境变量：

- `ATWEBPILOT_WS_PORT`：固定端口（默认是自动选一个空闲端口并复用上次的）
- `ATWEBPILOT_WS_TOKEN`：要求扩展带 `bearer.<token>` 子协议

## 给开发者：本地 monorepo

    pnpm -F @attson/atwebpilot-mcp start

环境变量同上，路径用 `tsx src/index.ts` 直跑（包内 `start` script 已封）。

## 多会话

每个 MCP server 进程是 WS **服务端**，扩展是**客户端** —— MV3 service worker 没有
listen 端口的能力，所以方向只能如此。这也是配对页存在的原因：服务端没法主动找到浏览器，
只能由它把自己的端口**告知**扩展。

扩展侧维护一个连接池，每个已配对会话一条连接。`list_tabs` 会告诉你哪些 tab 正被**别的**
会话占用（`busy` / `busy_label`）——只是提示，不拦截；AI 看到占用通常直接 `openTab` 开一个新的就行。

## 工具面

- 控制面 4 个：`list_tabs / open_session / close_session / get_quota`
- 执行面 54 个 `browser_*`：扩展的全部内置工具，除了 `askUser`（MCP 会话没有人在侧边栏应答）和
  `attachTab` / `detachTab`（侧边栏多 tab 记账，MCP 的目标 tab 已由 `open_session` 绑定）。

工具列表会和扩展 `HELLO` 里上报的 `supported_tools` 求交集，所以旧版扩展配新版 server 时不会
出现「列出来但一调就 unknown tool」。字段缺失（Plan 32 之前的扩展）时回落到旧的 19 个。

### 环境变量 `ATWEBPILOT_MCP_TOOLS`

| 值 | 效果 |
|---|---|
| `full`（默认） | 全部 54 个 |
| `parity` | 只出对标 playwright-ext 那 24 个能力的子集，省上下文 |

无法识别的值按 `full` 处理，并往 stderr 打一条提示。

## 替代 playwright-ext

`@playwright/mcp --extension` 的每个工具在这里都有对应项（名字是 AtWebPilot 的，不是 playwright 的）：

| playwright-ext | AtWebPilot |
|---|---|
| `browser_snapshot` | `browser_takeSnapshot`（uid 可直接喂给 `clickByUid` / `fillByUid`） |
| `browser_find` | `browser_findElements` |
| `browser_click` | `browser_click`（含 `doubleClick` / `button` / `modifiers`）、`browser_clickByUid` |
| `browser_type` | `browser_fillInput`（含 `slowly` / `submit`） |
| `browser_fill_form` | `browser_fillForm` |
| `browser_select_option` / `browser_hover` / `browser_press_key` | 同名去掉下划线：`browser_selectOption` / `browser_hover` / `browser_pressKey` |
| `browser_drag` / `browser_drop` | `browser_drag` / `browser_drop` |
| `browser_file_upload` | `browser_uploadFile` |
| `browser_navigate` / `browser_navigate_back` | `browser_navigate` / `browser_navigateBack`（另有 `navigateForward`） |
| `browser_tabs` | `browser_listTabs` / `openTab` / `closeTab` / `switchToTab` |
| `browser_close` | `browser_closeTab` |
| `browser_resize` | `browser_resize` |
| `browser_take_screenshot` | `browser_screenshot`（含 `fullPage` / `format` / `scale`） |
| `browser_wait_for` | `browser_waitFor`（含 `text` / `textGone`） |
| `browser_evaluate` / `browser_run_code_unsafe` | `browser_runJS` |
| `browser_console_messages` | `browser_consoleMessages` |
| `browser_network_requests` / `browser_network_request` | `browser_networkRequests` / `browser_networkRequestDetail` |
| `browser_handle_dialog` | `browser_handleDialog`（默认档是预设策略，见下） |

两处语义差异，调用前要知道：

- **`handleDialog` 在默认档是预先策略，不是反应式。** `alert` / `confirm` / `prompt` 是同步的，
  打了补丁也没法挂起等 agent 决定。开启设置里的 CDP 档之后弹窗真挂起，行为才和 playwright 一致。
- **`networkRequestDetail` 的 body 默认不记。** 先 `recorderConfig({bodies:true})` 再复现请求。
  不开时返回元数据加一条 `bodyUnavailable` 说明怎么开。

AtWebPilot 额外有 playwright-ext 没有的：page-index 四件套、`extractImages`、`httpRequest`、
`downloadSpreadsheet`（真 `.xlsx`）、书签/历史搜索。

详细协议与设计见 [`../../docs/superpowers/specs/2026-06-06-mcp-bridge-design.md`](../../docs/superpowers/specs/2026-06-06-mcp-bridge-design.md)。

⚠ 进程禁止往 stdout 写非 MCP 内容（stdout 是 MCP 通道）。所有日志走 stderr。
