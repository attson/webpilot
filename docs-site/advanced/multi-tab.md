# 多 tab 会话

## 概念

一个"会话"绑定一个主 tab（Header 里显示 `Tab #142`），但可以额外挂载多个 tab 作为工作区。所有内置工具都接受可选 `tabId` 参数，指向已挂载的某个 tab。

## 挂载方式

### 方式 1：`@` 提当前 tab 列表

输入框输入 `@` → 弹出当前浏览器所有 tab 的下拉 → 选一个 → 挂载。

### 方式 2：AI 主动 `openTab`

AI 想开新页面时会调 `openTab(url)`。成功后自动挂载（`source=ai-open`），不用你二次确认。

### 方式 3：AI 主动 `attachTab`

AI 想访问已开的 tab 时调 `attachTab(tabId, reason)`。需要你审批（弹审批卡）。审批通过后挂载。

## 每 tool 用 tabId

19 个内置工具都接受 `tabId`：

- **主 tab**：`tabId` 字段整个不填（不要 0，不要 null）
- **其它已挂 tab**：`tabId` 填对应数字

例：AI 在主 tab 的商品页想查同款在其它平台的价格：

```json
{ "tool": "openTab", "input": { "url": "https://www.jd.com/search?q=商品名" } }
```

→ 返回 `{ tabId: 143, ... }`；自动挂载。后续：

```json
{ "tool": "querySelectorAll", "input": { "selector": ".product-price", "tabId": 143 } }
```

## 关闭挂载

- `detachTab(tabId)` — 从会话移除，但不关闭该 tab
- `closeTab(tabId)` — **只能关**已挂载的 tab（防止误关别的窗口）；关了自动解除挂载
- `switchToTab(tabId)` — 把 Chrome 前台切到该 tab（已挂载或主 tab）

## 会话 vs Tab

- 切到另一个 tab → UI 看到该 tab 的独立会话（消息、待审 step、运行状态）
- 原 tab 的 LLM 调用在后台**继续**跑，UI 不可见
- 会话按 URL 持久化到 IndexedDB（每 URL ≤20 条）→ 关 tab 不丢
- 切回同 URL → 顶部历史 drawer 可一键恢复

## 同 tab 内 navigate

- 点超链接 / SPA 路由变更 → 会话保留 + 末尾追加一条 `[页面跳转] 新 URL: ...` 的 system note
- AI 后续 step 在新 URL 上执行
