<!-- ⚠ 自动生成 —— 修改源在 packages/shared/src/llm/builtin-tool-defs.ts；跑 `pnpm gen` 重生 -->


# 操作工具

页面写入类：会改 DOM 或点击。默认 caution，跟随权限模式；trust 白名单里的 tool 自动过。

## `click`  🟡 caution

[ACT] 点击选择器命中的元素。required=false 时找不到不报错。会经过审阅（caution）。
用 takeSnapshot 拿到 UID 后建议改用 clickByUid，更稳。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `required` | boolean |  | 否 |
| `doubleClick` | boolean |  | 否 |
| `button` | string |  | 否 |
| `modifiers` | array |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `fillInput`  🟡 caution

[ACT] 往 input/textarea/contenteditable 填值；触发 input/change 事件兼容 React/Vue。
**批量填表请用 fillForm**（更高效）。

示例：
- 填邮箱：{ selector: 'input[name=email]', value: 'a@b.c' }
- 不清空直接追加：{ selector: '.editor', value: 'tail', clear: false }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `value` | string |  | 是 |
| `clear` | boolean |  | 否 |
| `slowly` | boolean | 逐字符触发 keydown/keypress/input/keyup，对付受控组件 | 否 |
| `submit` | boolean | 填完按一次 Enter | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `setCheckbox`  🟡 caution

[ACT] 设置 checkbox 勾选状态；派发 change 事件。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `checked` | boolean |  | 是 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `selectOption`  🟡 caution

[ACT] &lt;select&gt; 元素按 value 或 label 选项。同时给两者时优先 value。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `selector` | string |  | 是 |
| `value` | string |  | 否 |
| `label` | string |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `clickByUid`  🟡 caution

[ACT·UID] 用 takeSnapshot 返回的 uid 点击元素。比 selector 版稳定。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `uid` | string |  | 是 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `fillByUid`  🟡 caution

[ACT·UID] 用 takeSnapshot 返回的 uid 填值（input/textarea/contenteditable）。

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `uid` | string |  | 是 |
| `value` | string |  | 是 |
| `clear` | boolean |  | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `fillForm`  🟡 caution

[BATCH·ACT] 一次性填多个字段。每项写 selector + value 或 uid + value。返回 {filled: N, failed: [{at, error}]}。
比循环调 fillInput 快得多，也省 round-trip。

示例：
{ fields: [
  { selector: 'input[name=name]', value: '张三' },
  { selector: 'input[name=phone]', value: '13800000000' },
  { uid: 'el_5', value: 'mushroom' }
] }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `fields` | array |  | 是 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---

## `pressKey`  🟡 caution

[ACT] 模拟键盘事件（keydown + 可打印字符 keypress + keyup）。
常用：Enter 提交无 form 的搜索框 / Escape 关 modal / Tab 切焦点。key 用 KeyboardEvent.key 值。
本工具**不**改 input 值——填值仍走 fillInput / fillByUid。
示例：
- 提交搜索：{ selector: 'input[name=q]', key: 'Enter' }
- 关 modal：{ key: 'Escape' }

**参数：**

| 字段 | 类型 | 说明 | 必填 |
|---|---|---|---|
| `key` | string | 如 'Enter' / 'Escape' / 'Tab' / 'ArrowDown' / 'a' | 是 |
| `selector` | string | 可选；不传则派发到 document.activeElement 或 document.body | 否 |
| `tabId` | integer | 目标 tab。要操作主会话 tab 时整个字段不要带（不要 0 / null）；要操作其它 tab 时它必须先在 attachedTabs（用 attachTab 申请） | 否 |

---
