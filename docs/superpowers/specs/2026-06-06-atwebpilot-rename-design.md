# 项目改名 atwebpilot — 设计文档

> 状态：设计已评审通过，待 writing-plans。
> 对应 plan：`../plans/2026-06-06-atwebpilot-rename.md`（待生成）。

## 1. 目标与范围

把项目从 **AtWebPilot/atwebpilot** 全面改名为 **AtWebPilot/atwebpilot**。

为下一份 plan（npm publish `@attson/atwebpilot-mcp` + 对外 install 文档）铺路。先 rename，再分发。

### 范围决策（brainstorming 结论）

| 维度 | 决策 |
|---|---|
| 用户可见品牌（manifest name / README 顶 / UI 标题） | `AtWebPilot` → `AtWebPilot`（驼峰） |
| 内部命名（package name / scope / import 路径 / 仓库名 / 文档机械文案） | `atwebpilot` → `atwebpilot`（小写） |
| npm 包名（**下一份 plan 用**） | `@attson/atwebpilot-mcp`（个人 scope） |
| GitHub 仓库名 | `attson/atwebpilot` → `attson/atwebpilot` |
| Chrome 扩展 `"key"` 字段 | **保留** —— 扩展 ID 不变，重装后用户已有的 manifest 标识与权限不重置 |
| `DB_NAME`（IndexedDB） | `atwebpilot` → `atwebpilot`，**不做数据迁移**（dev 阶段、唯一用户，旧 `atwebpilot` 库被新代码忽略） |
| 历史 `docs/superpowers/{specs,plans}` 内容 | **一并 sed 替换**（不再保留 "AtWebPilot" 历史快照）；只有写入时间和 commit message 仍指向当时的旧名 |
| 历史 commit message | 不动（git rewrite 重且无价值） |
| 版本 | 改完发 v0.0.18 |

### 非目标（YAGNI）

- **数据迁移**：不在启动时把老 `atwebpilot` IndexedDB 复制到 `atwebpilot` 库；之前的会话历史/saved tools/runs 在 UI 上「不见」（数据仍在浏览器里，只是新代码不读）。dev 阶段唯一用户已接受此副作用。
- **npm publish / install 文档**：归属下一份 plan，本 plan 不涉及任何 bundler、`prepublishOnly`、发包 CI。
- **历史 commit message 重写**：不动 git history。
- **历史 spec/plan 文件名也含 atwebpilot 的**：无此情况（现有文件名都用日期 + 主题，不含品牌词）。

## 2. 执行策略：sed 批量 + 手工收尾

### 2.1 sed 顺序（严格）

在干净的工作树上跑下面三条**按顺序**，**反序会污染**（先做最具体的 `@atwebpilot/`，再做大小写区分的 `AtWebPilot`，最后小写 `atwebpilot`）：

```bash
# 步骤 1：包 scope —— 最具体，定向命中
grep -rIl '@atwebpilot/' --exclude-dir={node_modules,dist,.git} . \
  | xargs sed -i '' 's|@atwebpilot/|@atwebpilot/|g'

# 步骤 2：品牌驼峰 —— 在小写替换之前做，否则 'AtWebPilot' 会被 'atwebpilot' 部分污染成 'Webatwebpilot'
grep -rIl 'AtWebPilot' --exclude-dir={node_modules,dist,.git} . \
  | xargs sed -i '' 's|AtWebPilot|AtWebPilot|g'

# 步骤 3：所有小写 atwebpilot —— 捡 1/2 之外的剩余文本：
#   · GitHub URL https://github.com/attson/atwebpilot
#   · CI workflow 里的 atwebpilot-<version>.zip 文件名
#   · 各种文档/注释里裸的 "atwebpilot"
# 已被步骤 1/2 替换的部分对本步 NO-OP（@atwebpilot/ 和 AtWebPilot 里都不再含裸 atwebpilot 子串）。
grep -rIl 'atwebpilot' --exclude-dir={node_modules,dist,.git} . \
  | xargs sed -i '' 's|atwebpilot|atwebpilot|g'
```

> **macOS sed**：`-i ''` 是必须的（环境 darwin 24.6）。Linux 用 `-i` 不带空字符串。
>
> `grep -I`：跳过二进制文件（防止误改 `manifest.json` 中虽是文本但内部含 base64 的 `"key"` 字段——不过它不含 `atwebpilot` 子串，仍是双保险）。

### 2.2 手工收尾（sed 完成后）

| 改什么 | 怎么改 |
|---|---|
| `packages/extension/src/background/storage/db.ts` 中 `const DB_NAME = "atwebpilot";` | 改成 `const DB_NAME = "atwebpilot";`。sed 不会动它（值是 `"atwebpilot"`） |
| `pnpm-lock.yaml` 中残留的 `@atwebpilot/*` 工作量 link | `rm pnpm-lock.yaml && pnpm install` 重新生成 |
| 根 `package.json` 顶层 `"name": "atwebpilot-monorepo"` | sed 会把 `atwebpilot` 替换 → `atwebpilot-monorepo`，**核对一遍** |
| `packages/extension/manifest.json` 顶层 `"name": "AtWebPilot — AI 网页助手"` | sed 会替换 → `"AtWebPilot — AI 网页助手"`，**核对** |
| `packages/extension/manifest.json` 顶层 `"key"`（base64） | 不应被任何步骤命中（base64 串里没有 `atwebpilot` 字面值）。**断言不变**。 |
| README/AGENTS 顶部 `# AtWebPilot — AI 网页助手` | sed 已覆盖 → `# AtWebPilot — AI 网页助手`，核对 |
| README/AGENTS 里的 `https://github.com/attson/atwebpilot` | sed 已覆盖 → `attson/atwebpilot`，核对 |

### 2.3 验收（每条必须真跑通）

```
pnpm install                              # 重生 lockfile
pnpm -r typecheck                         # 4 包 typecheck 全绿
pnpm -r test                              # 519 测试零回归
pnpm -F @atwebpilot/extension build       # 扩展 dist 仍正常产出

# 漏网扫描——必须空输出
grep -rIn '@atwebpilot/\|AtWebPilot\|atwebpilot' \
  --exclude-dir={node_modules,dist,.git} .
```

任何一条不过，**停下来排查**，不允许临时绕开（如 `--no-verify`、weaken 测试）。

### 2.4 手测（扩展加载）

1. `pnpm -F @atwebpilot/extension build` → `chrome://extensions` reload 扩展
2. 扩展图标右键 → 看到 Chrome 显示 **AtWebPilot — AI 网页助手**
3. 打开 sidepanel → 在任意网页输入「总结此页」→ 应该照常工作
4. DevTools → Application → IndexedDB → 看到新建的 `atwebpilot` 库；旧 `atwebpilot` 库仍存在但不被读

## 3. 仓库 + remote 操作（PR 合 main 之后做）

PR 还在审/合的过程中不要动 GitHub 仓库名（防止合并工具找不到仓库）。**合 main 之后**：

1. GitHub Web → Settings → Rename → `attson/atwebpilot`
2. 本地：`git remote set-url origin git@github.com:attson/atwebpilot.git`
3. GitHub 自动把旧的 `attson/atwebpilot` 链接永久 redirect（PR/issue/release URL 都仍可访问）

`docs/` 里的 GitHub URL 已被 sed 覆盖，无需额外动。

## 4. 发版

改完合 main 后：

1. 根 `package.json` 版本 0.0.17 → 0.0.18
2. `chore: release v0.0.18` commit + push main
3. tag `v0.0.18` + push → 触发 `.github/workflows/build-extension.yml` 跑
4. 期望产物：`atwebpilot-0.0.18.zip`（CI 里 build 脚本里 zip 文件名带产物前缀，sed 之后自然带 `atwebpilot-` 前缀；**第一次 release 跑要确认这个文件名生效**）

## 5. 风险与回滚

| 风险 | 概率 | 应对 |
|---|---|---|
| sed 误改了某个不该改的 atwebpilot 串（如某个 npm 依赖名恰好含 atwebpilot） | 低 | `pnpm install` 重生 lockfile 时会报 unresolved；漏网扫描（§2.3）也会暴露。先在干净分支 dry-run。 |
| 现有 dev 扩展数据用户重新加载后看不见会话历史 | 已接受 | 文档里写明；老数据仍在浏览器里，未来如需可加 migration |
| GitHub 仓库 rename 后某个 hardcoded URL 漏改 | 低 | GitHub redirect 兜底，但不能依赖；漏网扫描+CI build 验证。 |
| Chrome 扩展 `"key"` 被某条 sed 命中（不应该） | 极低 | 显式断言不变（§2.2），并在 verify 步骤里 `git diff manifest.json` 看一眼 key 行 |
| 测试中有 hardcoded `atwebpilot` 字符串期望（snapshot/fixture） | 中 | `pnpm -r test` 会立刻挂；sed 会把测试期望也一并改掉，但若期望是「某 API 返回 atwebpilot 字串」就有连锁 bug 风险。**逐 fail 排查**。 |

回滚：所有改动单 PR、squash-merge。如果出现严重问题在 v0.0.18 release 之前：`git revert <merge-commit>` 回到 v0.0.17。

## 6. 后续

合 main + tag v0.0.18 + release 之后，**resume distribution brainstorm**（npm publish `@attson/atwebpilot-mcp` + 对外 install 文档），新 spec 与新 plan。
