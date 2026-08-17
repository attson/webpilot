# AtWebPilot — AI 网页助手

一个浏览器侧边面板里的 AI 助手，能在你正在浏览的网页上：

- **读**：总结、翻译、抽取重点、回答关于本页内容的问题
- **写**：填表、勾选、选下拉、点击按钮、提交表单、上传文件
- **采**：抓主图、详情图、评论列表、商品参数、表格等结构化数据

任意一段成功对话都能一键固化为 URL 模式匹配的可重放工具。每个浏览器 tab 有独立的对话上下文，互不干扰；按 URL 持久化历史会话（每个 URL ≤20 条），切回时通过顶部历史 drawer 一键恢复，关 tab 不丢。

首次打开熟悉网站会看到**场景推荐**（12 个内置 preset：维基/知乎/GitHub/Medium/公众号 总结类 + PDD/淘宝/京东/1688/Amazon 采集类），一键跑起来；tool 重放遇到网站小改动**自动自愈**（一次 LLM 生成补丁 → static-scan 拒 dangerous → 存为用户 v2 继续），失败堆栈不再是普通用户的终点。

v0.0.53 之后，大页面不再靠把整页 `body` 塞进模型。AtWebPilot 会优先在 content script 本地建立**页面上下文索引**，模型只拿小块证据、字段候选、局部截图；需要交付表格时可直接生成真正 `.xlsx` 文件。侧边面板和页内浮窗都支持图片附件，图片以多模态输入发给模型。

---

## 安装

只想 **用**（不开发）：

    claude mcp add atwebpilot --scope user -- npx -y @attson/atwebpilot-mcp

然后下载 [最新 release zip](https://github.com/attson/atwebpilot/releases/latest)，在
`chrome://extensions` 加载已解压扩展。**不用手填端口** —— AI 第一次要操作网页时，
会自动打开一个配对页请你确认，点「允许」即接入。之后本机会话都免确认。

多个 Claude Code 会话可以同时接入同一个浏览器，各自一条连接；`list_tabs` 会标出哪些
tab 正被别的会话占用，AI 通常直接开个新页就绕开了。

可选环境变量：`ATWEBPILOT_WS_PORT`（固定端口，默认自动选空闲端口并复用上次的）、
`ATWEBPILOT_WS_TOKEN`（可选）。

---

## 装载

```bash
pnpm install
pnpm build           # 产出 packages/extension/dist/
```

1. `chrome://extensions` → 「开发者模式」 → 「加载已解压的扩展程序」选 `packages/extension/dist/`
2. 任意页面右上角点扩展图标 → 侧边面板打开
3. 普通网页右下角会出现 AtWebPilot 页内浮窗；它和侧边面板共用同一个 tab 会话

刷新扩展（reload 按钮）后，已打开的页面**第一次执行 step 时**扩展会自动注入 content script + 重试，无需手动刷新页面。

## GitHub Actions 打包

仓库包含 `.github/workflows/build-extension.yml` 自动打包流程：

- `push` / `pull_request` / 手动运行会执行 `pnpm typecheck`、`pnpm test`、`pnpm build`，并上传 `atwebpilot-<version>.zip` artifact。
- 推送 `v*` tag（例如 `v0.0.1`）会在通过检查后创建 GitHub Release，并上传同一个 zip。
- zip 内容来自 `dist/` 内部，`manifest.json` 位于压缩包根目录，可直接用于 Chrome 扩展加载或发布前检查。

发布示例：

```bash
git tag v0.0.1
git push origin v0.0.1
```

---

## 第一次配置

打开「设置」页。设置页左侧按分类切换（LLM / 上下文 / MCP / 权限 / 外观 / 浮窗 / Coordinator / 高级）：

| 字段 | 说明 |
|---|---|
| Provider | Anthropic / OpenAI（也支持 OpenAI 兼容协议接 LiteLLM / Azure / Ollama 等） |
| Endpoint | 留空 = 默认；也可填自定义 base URL（例如 `https://api.deepseek.com/v1`） |
| Model | 下拉建议或自由输入（如 `claude-sonnet-4-6`、`gpt-4o-mini`、`deepseek-chat`） |
| API Key | 「仅本次会话保存」勾选 = 关浏览器即清；否则存 `chrome.storage.local` |
| max_tokens | 单次 LLM 响应上限（默认 4096，长任务可调 8192/16k） |
| 最大轮数 | 一次会话最多 LLM round 数，默认 20 |
| 续作 nudge 次数 | 模型说完没调工具时再问一遍是否真完成；默认 1，session-total 上限 |
| 上下文策略 | 默认 auto：按模型名推断 128k / 200k / 1M 档位；也可选 conservative / large / huge / custom |
| 自愈开关 | 默认 on。Tool 重放失败时自动跑一次 LLM 补丁；关闭后行为回到 v0.0.44 及之前 |
| 自愈 tokens 上限 | 每次自愈 LLM 输出 tokens 上限（默认 4096，可调 1024–8192） |
| 权限模式 | read（全 auto safe）/ default（caution 按勾选）/ trust（含 caution 免审）/ yolo（全部自动含 dangerous）；顶部 pill 可当次切换 |
| 自动通过策略 | safe 永远 auto；caution 看勾选；dangerous 按工具名白名单（5 选 N） |

API Key 不会进 IndexedDB，也不会被「导出工具库」带走。

---

## 用法

### 1. 对话页（默认）

```
[Tab #142] mobile.pinduoduo.com/goods.html?...
─────────────────────────────────────────────
▶ 此页面可用 1 个工具:
  · pdd 竞品信息采集 v3      [详情] [运行]
─────────────────────────────────────────────

✓ 已完成 · round 8/20 · in 5.2k / out 1.8k (= 7.0k)

(消息流)
─────────────────────────────────────────────
☑ 自动通过 caution     ⚠ dangerous 自动: 0/5 ▾
要让 AI 做什么？例如"总结此页"/"填写注册表单"/"采集前 50 条评论"
                                              [发送]
```

输入指令 → AI 流式回应 + 调用工具：

- **safe**（createPageIndex / searchPageIndex / readPageBlock / extractPageFields / snapshotDOM / takeSnapshot / findElements / extractText / hover / getValue / scroll / waitFor / extractImages / querySelector* / extractFormState / consoleMessages）：自动跑
- **caution**（fillInput / click / setCheckbox / selectOption / pressKey / navigate / navigateBack / resize / drag / drop / handleDialog / downloadSpreadsheet / networkRequests / recorderConfig / 不带 cookie 的 httpRequest）：默认跟随顶部 toggle
- **dangerous**（submitForm / uploadFile / readStorage / networkRequestDetail / 带文件的 drop / 带 cookie 的 httpRequest / 命中静态扫描的 runJS）：每次必须人工确认；可在白名单里逐项放行

  `networkRequestDetail` 归 dangerous 是因为响应头里常有 `Authorization`、`Set-Cookie`、各种 token。

完成后顶部小条 `已执行 N 步 [保存为工具]`——点击后弹保存对话框。

### 2. 页面上下文、附件与导出（v0.0.53）

普通网页理解、商品信息、文章元信息、表格字段、长评论列表等任务，模型会优先走：

```text
createPageIndex → extractPageFields / searchPageIndex → readPageBlock
```

完整页面文本、DOM 细节和长块内容保留在 content script 本地；模型只拿字段候选、小证据片段和必要的分页内容。这样比直接 `extractText({selector:"body"})` 更稳定，也更省上下文。

低置信度或需要判断视觉归属时，模型可以对索引块调用 `screenshot({blockId,indexId})`。扩展会滚动到目标区域、短暂高亮，再截当前视口，把图片证据送进下一轮。

输入区支持三类“附件式上下文”：

- 图片：png/jpeg/gif/webp，单张 ≤5MB，一次 ≤5 张；以多模态 base64 part 发给模型
- 页面元素：用十字准星圈选页面元素，作为 selector 引用附在用户请求上，不直接污染输入框正文
- Excel 导出：模型可调用 `downloadSpreadsheet` 生成真正 `.xlsx` 文件，支持多 sheet、二维数组行和对象数组行

### 3. 保存为工具

```
保存为工具

名称       [AtWebPilot 任务 2026-05-10]
URL 模式   [https://*.pinduoduo.com/**]
描述       [采集 PDD 评论与主图（用户初始 prompt）]

┌─ 汇总 step ──────────────────────────────────┐
│ ⚠ 重放时输出 = 最后一步 step 的 return 值。 │
│ [让 AI 生成汇总步骤]                          │
└──────────────────────────────────────────────┘

将保存 9 个成功执行的 step。

[取消] [保存]
```

**汇总 step**（Plan 5 新增）：会话期间 AI 在 chat 文本里写的"总结报告"是 markdown，重放无法复现；点击 [让 AI 生成汇总步骤] 会让 LLM 基于已执行 step + 对话历史生成一段 runJS code（追加为最后一步）——重放时该 step 把前面 step 的产物整合成稳定结构 JSON。

### 4. 工具库

- 顶部 `[导入 JSON]` 接受单条或多条工具 bundle（按 id 合并；冲突跳过）
- 每行 `[详情] [导出] [删除]` —— 单工具导出 JSON
- 工具详情页：步骤定义折叠；运行按钮在最显眼位置；运行结果（绿框）显示在按钮正下方
- banner 上的「运行」 = 跳工具详情页 + 自动开跑

### 5. 多 tab 与会话历史（Plan 4 + 7 + 8）

- 切到另一个 tab → 看到该 tab 的独立会话（消息历史、运行中状态、待审 step）
- 原 tab 的 LLM 调用在后台继续跑，UI 不可见
- 一个会话可以同时挂多个 tab：
  - 在输入框 `@` 提一个 URL 把另一个 tab 拉进会话
  - AI 可以用 `openTab(url)` 打开新 tab，成功后自动 attach（source=`ai-open`）
  - 也可以 `attachTab(tabId)` 申请把任意 tab 纳入（需用户审阅）
  - 页面级工具都接受可选 `tabId` 参数指向某个已 attached tab
- 会话按 URL 持久化（IndexedDB `chat_sessions`，每 URL ≤20 条）→ 关 tab 不丢；切回原 URL 通过顶部历史 drawer 一键恢复，或新建会话
- 同 tab 内 navigate（点超链接 / SPA 路由变更）→ 会话保留 + 末尾追加一条 `[页面跳转] 新 URL: ...` 的 system note

### 6. 场景库（Plan 27，v0.0.45）

- 顶部图标进入「场景库」drawer；12 个内置 preset 按分类展示（商品采集 / 内容站）
- 每张卡片显示 URL pattern 与当前 tab 是否命中；命中即可「在当前 tab 运行」
- 状态角标：`NEW`（未使用）/ `已复制`（v1）/ `已升级 vN`（自愈过至少 1 次）
- `prompt-form` preset 也在 chat 空态的 quick-actions 里根据 URL 优先展示

### 7. 自愈（Plan 27，v0.0.45）

- Tool 重放时任一 step 失败 → BG 自动跑一次 LLM：拿新 snapshotDOM + 已成功产物 + 错误信息，让模型输出补丁 steps
- 补丁 zod 校验 + static-scan gate（**dangerous 严格拒**，只允许 safe/caution 集合）
- 通过后替换失败步以后的 steps → `appendVersion` 存为用户本地 v2 → 继续跑
- 会话消息流实时出现 `[自愈] 正在自动修复失败步骤…` → `[自愈] 已自愈，升级到 v2`
- 单次运行**最多 1 次**自愈；补丁再失败 → 抛 `step_still_fails` 事件 + 走原 `[让 AI 修复]` 深度修复
- 关键不变：BG 不持 API key，heal 时通过 sidepanel RPC 借用 LLM（复用现有 key 位置）

### 8. 后台 LLM 交流记录（Plan 11）

每次 LLM stream 的 request（去掉 apiKey）和组装后的 response 都会被 `recording-client` 抓下来，按 round 存进会话；右上角 `Exchanges N [查看]` 打开专用面板，定位 prompt cache / continuation guard / stop_reason 这类调参问题不再靠盲猜。

---

## 失败修复

工具运行失败时，工具详情页出现 `[让 AI 修复]`。点击 → 跳到对话页 → 自动预填错误上下文 + 旧 step 数组 → 你点[发送]，AI 改新版 step。修复成功后保存为新版本（`appendVersion`）。

---

## 日志

每个会话顶部小条 `日志 N 条 [查看]` —— 展开底部抽屉看每个 SessionEvent（含 LLM stream error 与 step error 详情）。报错时自动展开。可一键复制成文本提 issue。

---

## DEV 入口

「DEV: JSON」页保留了 Plan 1 的"粘 Tool JSON 直接跑"，方便调试工具或验证 step 序列；不走 LLM。

---

## 工具集（46 个 LLM tools）

按用途 & 严重级别分层。详细定义在 `packages/shared/src/llm/builtin-tool-defs.ts`；文档站有生成的完整 [工具参考](https://attson.github.io/atwebpilot/zh-CN/tools/overview.html)。

| 类别 | 工具 |
|---|---|
| 页面索引（safe） | `createPageIndex`、`searchPageIndex`、`readPageBlock`、`extractPageFields` |
| 探查（safe） | `snapshotDOM`、`querySelector`、`querySelectorAll`、`extractText`、`extractImages`、`getValue`、`extractFormState`、`hover`、`focus`、`takeSnapshot`（UID-based） |
| 流程（safe） | `scroll`、`waitFor`、`getPageInfo` |
| 视觉辅助（safe） | `highlightElement`、`highlightText`、`screenshot`、`askUser` |
| 元信息（safe） | `searchBookmarks`、`searchHistory`、`downloadImage` |
| 交互（caution） | `click`、`fillInput`、`setCheckbox`、`selectOption`、`fillForm`（批量）、`clickByUid`、`fillByUid`、`pressKey`、`navigate` |
| Tab 控制面（caution） | `listTabs`、`openTab`、`attachTab`、`detachTab`、`switchToTab`、`closeTab` |
| 导出（caution） | `downloadSpreadsheet`（生成 `.xlsx`） |
| 网络（caution） | `httpRequest`（无 cookie）、`runJS`（扫描通过） |
| dangerous | `submitForm`、`uploadFile`、`readStorage`、`writeStorage`、`httpRequest(withCredentials)`、`runJS`（含 cookie/eval/storage 等关键词） |

---

## 测试与构建

```bash
pnpm typecheck      # pnpm -r typecheck across shared / coordinator / extension / mcp-server
pnpm test           # 全量测试 ~1122（822 extension + 174 shared + 45 coordinator + 81 mcp-server）
pnpm test:watch
pnpm build          # 产出 packages/extension/dist/
```

测试覆盖：纯逻辑（url-pattern / static-scan / infer-json-schema / protocol zod / preset schema+match）+ 工具调用层（每个内置工具一组 happy-dom 测试）+ chat loop（含 continuation guard + self-heal）+ WS 协议端到端（起真 `ws` server 跑 HELLO / EXEC / START_CHAT_SESSION）+ MCP server（LoopbackWSHub / tool-gen）。无 Playwright；UI smoke 是手动。

---

## Coordinator 远程控制（Plan 10 + 12，opt-in）

设置页有「Coordinator」子页：填一个 WS URL + token 即可让扩展挂到任意符合协议的服务器，被远程派发工具步（EXEC）。WS 协议见 `packages/shared/src/protocol/messages.ts`，参考实现见 `packages/coordinator/`。

Plan 12 之后还可以远程驱动一整个 chat session（`START_CHAT_SESSION`），并把会话事件（`CHAT_EVENT`）流式发回：仅在勾上「允许 coordinator 远程驱动 chat session」之后生效，默认关闭，独立于 EXEC 工具调用。BG 端跑的是同一个 `runChatSession`，可以走真实 LLM，也可以由 server 端直接喂一段 `mock_llm: { rounds: LlmStreamEvent[][] }` 做确定性回归测试。

本地 smoke：

```bash
node docs/superpowers/scripts/mini-coordinator.mjs
# 在设置里填 ws://127.0.0.1:8787/worker + 任意 token → 连接
```

### 用 Claude Code 驱动浏览器（MCP Bridge，Plan 13 / 32）

`packages/mcp-server` 是一个 stdio MCP server，同时起本地 ws 服务器。Claude Code 连它后可调
`list_tabs / open_session / browser_* / get_quota / close_session` 在网页上读写采。

    pnpm -F @atwebpilot/mcp-server start   # 不绑端口；首次用到浏览器时才绑并弹配对页
    # Claude Code 侧把它配成 MCP server

Plan 32 之后 MCP 面从 19 个扩到 **54 个** `browser_*`——扩展的全部内置工具，只挡掉 `askUser` /
`attachTab` / `detachTab`。嫌工具列表吃上下文可以设 `ATWEBPILOT_MCP_TOOLS=parity` 只留对标
playwright-ext 的子集。工具列表与扩展上报的 `supported_tools` 求交集，旧版扩展不会拿到调不动的工具。

这一版的目标是**能替代 `@playwright/mcp --extension`**：补齐了 console / network / dialog 捕获、
drag / drop / resize / navigateBack / findElements、整页截图，以及 click 的
`doubleClick`/`button`/`modifiers`、fillInput 的 `slowly`/`submit`、waitFor 的 `text`/`textGone`。
对照表见 `packages/mcp-server/README.md`。

### 多会话配对（Plan 33）

端口是**惰性绑定**的：会话启动什么都不做，直到 AI 真的要操作网页才绑一个空闲端口
（优先复用上次那个），并打开 `http://127.0.0.1:<port>/pair`。那个页面只负责把端口告诉扩展；
**批准 UI 由扩展自己注入**（closed shadow DOM），因为让请求方画自己的「允许」按钮等于让它
自己签发许可。

信任是**安装级**的：`~/.atwebpilot/identity.json`（0600）里一份 `installId` + `secret`，
批准一次之后本机所有会话免确认。`sessionId` 和工作目录只用于展示与管理，不参与信任判断 ——
按目录分身份的安全收益是假的（能读 home 目录的进程可以声称任意 cwd），却会让 git worktree
和目录改名莫名其妙地反复询问。

重连有了终止条件：server 正常退出会发 close code 4000，扩展**一次都不重试**；非正常退出则
连续失败 10 次后转 dormant，可在设置页手动重连。（此前 15 秒的 alarm 会无视退避一直重连，
指数退避形同虚设。）

### 页面事件录制（Plan 32）

`consoleMessages` / `networkRequests` / `networkRequestDetail` / `handleDialog` 读的是一个常驻录制器。
默认姿态是**惰性的**，因为它装在你访问的每一个页面上：

| 通道 | 默认 | 说明 |
|---|---|---|
| console 缓冲 | 开 | 便宜；不开就拿不到「提问之前」发生的报错 |
| network 元数据 | 开 | 只记 url / method / status / 耗时 |
| 请求响应 body | **关** | 要 `recorderConfig({bodies:true})` 显式打开，上限 256KB 且只记文本类 |
| 弹窗拦截 | **passthrough** | 不 arm 时 `alert`/`confirm`/`prompt` 原样调用原生实现，页面行为与没装扩展一致 |

缓冲只在内存，不进 IndexedDB，不随「导出工具库」走，没有工具来读就不出页面。

两种后端：默认在 MAIN world 打补丁；设置页 → Coordinator 里可以 opt-in `chrome.debugger`（CDP）档，
拿到响应 body、注入前日志、CORS/CSP 报错和真正挂起的弹窗，代价是浏览器顶部常驻调试提示条、且与
DevTools 互斥。被抢占时自动退回默认档，并在返回值里带 `backend` 和 `degradedReason`。
`debugger` 是 optional permission，不启用就不会向用户索取。

---

## 手测脚本（需要真 API Key）

### 阅读：总结
1. 维基百科任意条目
2. 输入「用三个要点总结此页」
3. 期望：AI 优先用 `createPageIndex + extractPageFields/searchPageIndex`（safe，自动）→ 给三个要点；必要时 `readPageBlock` 核对证据

### 操作：填表
1. https://httpbin.org/forms/post
2. 输入「填写：客户名 张三，电话 13800000000，比萨配料勾选 mushroom 和 cheese，配送时间 18:00」
3. 期望：`fillInput` / `setCheckbox` / `selectOption`（caution）；`submitForm` 要审阅
4. 不点提交退出，验证字段已填

### 采集：PDD
1. https://mobile.pinduoduo.com/goods.html?goods_id=<任一商品>
2. 输入「把主图、详情图、前 50 条评论采集出来」
3. 期望：page-index 定位商品字段 → 必要时 screenshot/readPageBlock 核验 → httpRequest 翻页评论 → 汇总
4. 完成后保存为工具，并点击「让 AI 生成汇总步骤」让重放产物结构稳定
5. 重新访问验证 banner 推荐 + [运行] 自动跑 + ResultView 显示结构化 JSON

### 多 tab
1. tab A 跑「采主图」，AI 还在跑时切到 tab B
2. tab B 输入「总结此页」
3. 切回 tab A，应该看到 A 的进度（不是 B 的会话）
4. 关掉 tab B → 顶部「近期会话」出现可恢复条目

---

## 仓库目录

详细见 [`AGENTS.md`](./AGENTS.md)（给 AI 协作者的导航）。简版：

```
packages/
├─ shared/                 纯函数 + 类型 + WS 协议 zod schemas（无 chrome / 无 DOM）
├─ coordinator/            参考 WS 服务器实现（测试用；生产可外置）
├─ mcp-server/             stdio MCP server（Claude Code 经本地 ws 驱动浏览器，Plan 13）
└─ extension/
   └─ src/
      ├─ background/       Service Worker（IDB / RPC / tab-watcher / coordinator-client）
      │  ├─ bg-tools/      SW 侧工具（tabs / capture / downloads / search / nav / recorder-tools）
      │  ├─ recorder/      页面事件录制 host（MAIN-world + CDP 双后端与降级）
      │  └─ meta-tool-router.ts  非 content-script 工具的分发（EXEC 路径可达）
      ├─ content/          Content tools + page-index + 页内 widget + 元素圈选
      │  └─ recorder/      MAIN world 常驻录制器（console / network / dialog）
      └─ sidepanel/        React UI + zustand session store + LLM 客户端 + coordinator 设置页 + xlsx/meta tools
docs/superpowers/
├─ specs/                  设计文档（Plan 1-30；见 specs/README.md）
├─ plans/                  实施计划（每份对应一份 spec）
└─ scripts/                辅助脚本（含 mini-coordinator.mjs 本地 smoke）
docs-site/                  VitePress 中英双语展示站（Plan 26；`.github/workflows/deploy-docs.yml` 发到 gh-pages）
```
