# 页面事件录制

`consoleMessages` / `networkRequests` / `networkRequestDetail` / `handleDialog` 读的不是
"现在去抓一次"，而是一个**常驻录制器**。所以你能问到**提问之前**已经发生的事 —— 报错、请求、
弹窗都在缓冲里。

## 默认是惰性的

录制器装在你访问的**每一个**页面上，所以默认姿态是产品决策，不只是性能考量：

| 通道 | 默认 | 为什么 |
|---|---|---|
| console 缓冲 | 开 | 便宜；不开就永远拿不到"提问之前"那条报错 |
| network 元数据 | 开 | 只记 url / method / status / 耗时，不碰 body |
| 请求响应 body | **关** | 要 `res.clone().text()`，有内存代价 |
| 弹窗拦截 | **passthrough** | 不 arm 时 `alert`/`confirm`/`prompt` 原样调用原生实现 |

最后一条是关键:**没 arm 之前，页面行为和没装扩展完全一致**。缓冲只在内存，不进 IndexedDB，
不随「导出工具库」走，没有工具来读就不出页面。设置页有总开关。

缓冲是环形的（console 500 / network 300 / dialog 100），溢出丢最旧的并累加 `dropped` —— 每次
读取都返回它，所以你能区分「就这么多」和「只是看到了一个窗口」。

## 两种后端，要看 `backend` 字段

| | `main-world`（默认） | `cdp`（opt-in） |
|---|---|---|
| 机制 | 在页面自己的 realm 里打补丁 | `chrome.debugger` |
| 响应 body | 需先 arm，且只记 256KB 内的文本类 | 直接可取，含静态资源 |
| 注入前的日志 | 看不到 | 看得到 |
| CORS / CSP 报错 | 看不到 | 看得到 |
| 弹窗 | 预设策略（见下） | 真正挂起，反应式 |
| 代价 | 无 | 浏览器顶部常驻调试提示条；与 DevTools 互斥 |

CDP 档在扩展设置 → Coordinator 里开启，`debugger` 是 optional permission —— 不启用就不会
向用户索取。

**降级是必然要处理的**：DevTools 打开、或别的扩展抢先 attach，都会让 CDP 失败。这时自动回落到
main-world，并在返回值里带 `degradedReason`。看到它就知道**手上的数据是不完整的**，而不是
「页面真的没有网络请求」。

## 抓 body 的正确顺序

```
browser_recorderConfig({ bodies: true })   ← 先 arm
… 触发那个请求 …
browser_networkRequests({ urlPattern: "/api/" })
browser_networkRequestDetail({ id: <上一步的 id> })
```

没 arm 就调 `networkRequestDetail`，会返回已有的元数据加一条 `bodyUnavailable` 说明怎么开。

::: danger networkRequestDetail 是 dangerous 档
响应头里常有 `Authorization`、`Set-Cookie`、各种 token。这也是它单独占一个
`read:network-body` capability 的原因 —— `consoleMessages` 是 safe，`networkRequests` 摘要是
caution。
:::

## handleDialog 的语义差异

**默认档下它是预先策略，不是反应式。** `alert` / `confirm` / `prompt` 是同步的，打了补丁也没法
挂起等 agent 回话。所以要在触发弹窗**之前**声明怎么处理：

```
browser_handleDialog({ accept: true, promptText: "yes", scope: "all" })
… 点那个会弹窗的按钮 …
browser_handleDialog({ accept: true })   ← 也会返回已记录的弹窗
```

CDP 档下弹窗真正挂起，`handleDialog` 会立即应答当前挂起的那个，行为和 playwright 一致。

## 调试一个页面的推荐顺序

最省上下文的走法：

1. `browser_consoleMessages({ level: "error" })` — 便宜，而且早就缓冲好了
2. `browser_networkRequests({ status: 500 })` 或 `{ urlPattern: "/api/" }` — 只要摘要
3. 确认是哪一条之后，再 arm body 复现，只对那一条调 `networkRequestDetail`

用 `sinceId` 做增量轮询，别每次重读整个缓冲。
