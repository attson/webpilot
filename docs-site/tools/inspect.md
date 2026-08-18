<!-- ⚠ 自动生成 —— 修改源在 packages/shared/src/llm/builtin-tool-defs.ts；跑 `pnpm gen` 重生 -->


# 探查工具

页面读取类：不修改页面、不发请求（除非 `snapshotDOM` 抓大树时性能）。默认 safe，全自动执行。

## `snapshotDOM`  🟢 safe

[FIRST·LEGACY] 返回页面 DOM 简化树（tag/id/classes/直接文本/children）。
如果你只是要找交互元素并随后操作，**优先用 takeSnapshot**（UID 稳定，clickByUid 健壮）；
snapshotDOM 更适合「我要分析整个页面结构」这种探查类需求。

示例：
- 看整页：{ }（默认 maxDepth=3）
- 看某区域：{ root: '.main-content', maxDepth: 5 }
- 看到底：{ maxDepth: 8 }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `maxDepth` | integer |  | 否 |
| `root` | string | 可选的 CSS 选择器；找不到时退回到 &lt;html&gt; | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `querySelector`  🟢 safe

[FAST] 返回首个匹配元素的浅层摘要 (tag/id/classes/text/attrs)。仅探查用。
要后续点击或填值，配合 selector 直接传给 click / fillInput，或用 takeSnapshot 拿 UID。

示例：
- 找按钮：{ selector: 'button[type=submit]' }
- 找输入：{ selector: 'input[name=email]' }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `root` | string |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `querySelectorAll`  🟢 safe

[FAST] 返回所有匹配元素的浅层摘要数组。

示例：
- 所有评论：{ selector: '.comment-item', limit: 50 }
- 所有链接：{ selector: 'a[href]', limit: 20 }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `root` | string |  | 否 |
| `limit` | integer |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `extractText`  🟢 safe

[FAST·TARGETED] 提取选择器命中元素的文本。single=true 返回字符串，否则返回数组。
只用于明确的小范围 selector；普通网页理解/字段提取不要用 extractText({selector:'body'})，先用 createPageIndex + extractPageFields/searchPageIndex。

示例：
- 提取标题：{ selector: 'h1', single: true }
- 提取所有段落：{ selector: 'article p' }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `root` | string |  | 否 |
| `single` | boolean |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `extractImages`  🟢 safe

[FAST] 在 root 范围内提取所有 &lt;img&gt; 的 src/data-src/srcset；includeBg=true 时也提取背景图。返回 [{url, via}].

示例：
- 全页图：{ }（默认 root=document）
- 商品主图：{ root: '.product-gallery' }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `root` | string |  | 否 |
| `includeBg` | boolean |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `scroll`  🟢 safe

[FLOW] 滚动页面。to 可为 'bottom' / 'top' / number。max 是滚动次数；untilSelector 出现时提前停。

示例：
- 触发懒加载：{ to: 'bottom', max: 5 }
- 滚到锚点：{ to: 'top' } 后用 element.scrollIntoView 也可
- 等待新元素：{ to: 'bottom', max: 10, untilSelector: '.item:nth-child(20)' }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `to` | any | 'bottom' \| 'top' \| number | 是 |
| `max` | integer |  | 否 |
| `intervalMs` | integer |  | 否 |
| `untilSelector` | string |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `waitFor`  🟢 safe

[FLOW] 等待固定 ms，或等待选择器出现（带 timeoutMs 兜底）。

示例：
- 等 500ms：{ ms: 500 }
- 等元素出现：{ selector: '.lazy-loaded', timeoutMs: 8000 }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `ms` | integer |  | 否 |
| `selector` | string |  | 否 |
| `timeoutMs` | integer |  | 否 |
| `text` | string | 等待页面出现该文本 | 否 |
| `textGone` | string | 等待该文本消失 | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `hover`  🟢 safe

[ACT] 把鼠标悬停在元素上（触发 mouseenter / mouseover / mousemove）。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `focus`  🟢 safe

[ACT] 把焦点给某元素（触发 focus / focusin）。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `getValue`  🟢 safe

[FAST] 读 input/select/textarea/contenteditable 的当前值。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `extractFormState`  🟢 safe

[FAST·USE BEFORE FILL] 把 &lt;form&gt; 内所有可填字段读成 {name: value} 对象（radio 取选中值；checkbox 多选取数组）。
填表前先调一次，能省下大量盲填。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `form` | string | 可选：&lt;form&gt; 的 CSS selector；省略=第一个 form | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `takeSnapshot`  🟢 safe

[FIRST·UID] 抓取页面 accessibility snapshot：返回 [{uid, role, name, tag, text, bounds}]。
UID 在本次 snapshot 内稳定，后续 clickByUid / fillByUid 引用；比 selector 健壮，不怕 class 改名。
每次大动作前刷新一次。snapshot 默认只返回交互元素（button / link / input / textarea / select / [role] / [data-testid]）。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `includeAll` | boolean | true=全部 element；false=只 interactive（默认） | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `navigate`  🟢 safe

[ACT] 页面导航：后退 / 前进 / 重载 / 跳转。**优先**用本工具而不是 runJS('location.href = ...')。
示例：
- 后退一页：{ action: 'back' }
- 跳到新 URL：{ action: 'goto', url: 'https://example.com/page' }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `action` | string |  | 是 |
| `url` | string | 仅 action=goto 时使用；只允许 http/https/file/ftp | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `getPageInfo`  🟢 safe

[FAST·READ] 读当前页基本信息：URL / title / hostname / 语言 / OpenGraph meta。
多页对话中「我在哪个页面」的首选；比 snapshotDOM 便宜得多。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---
