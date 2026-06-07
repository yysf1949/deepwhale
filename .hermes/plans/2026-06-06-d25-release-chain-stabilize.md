# D-25 release chain stabilize — Ink 真接 tool loop + 发布链可重现

**Sprint Owner**: 周礼攀 / Hermes agent
**Created**: 2026-06-06 (Sat)
**Worktree**: `/home/butterfly443/deepwhale` (on `main`, 4b0aba0)
**触发依据**: 用户实跑 6 条 finding (4×P1 + 2×P2), 我已逐一独立验证全部成立
**前置 commit**: `4b0aba0` (chore(lock): pnpm-lock 同步 — 跟 feat/d24 merge 后 tui-ink deps 一致)

## Findings 复盘 (逐条独立验证)

| # | 等级 | 一句话 | 复现证据 |
|---|------|--------|----------|
| F1 | P1 | root `pnpm build` 不串 `@deepwhale/tui-ink` build + 不 copy bundle → 装出 CLI 缺 `dist/tui-ink-bundle.js` | `package.json:13` `build` 只 `tsc -b --force && node packages/llm/scripts/copy-toml.mjs`; `bin/deepwhale.js:42` static import `../dist/tui-ink-bundle.js` |
| F2 | P1 | Ink TUI `useRunToolLoop.ts` 调错 `runToolLoop` 签名, 且 root typecheck 漏掉 tui-ink | `pnpm -F @deepwhale/tui-ink type-check` → `useRunToolLoop.ts(65,42): error TS2345: ChatMessage[] is not assignable to LLMClient`; `tsconfig.json` references 不含 `packages/tui-ink` |
| F3 | P1 | `deepwhale --verify` 在 npm 安装场景下 `import-check` 报 SyntaxError, `bin-check` 走 POSIX `test -f` Windows 不稳 | `verify-runner.ts:204-211` commandTemplate 含嵌套 `()` 在 cmd.exe 多重 escape 下崩; `verify-runner.ts:213-216` `test -f` 在 cmd.exe 不存在 |
| F4 | P1 | Windows tui-smoke history 测试 fail (HOME vs USERPROFILE) | `tui.ts:305` 用 `homedir()`; 测试只设 `process.env.HOME`, Windows 上 `homedir()` 走 USERPROFILE |
| F5 | P2 | `--verify` 把 Vitest ENOENT 业务错误误报 `spawn-error` | `verify-runner.ts:341-358` `looksLikeSpawnError` 匹配 `/No such file/i` 太宽 |
| F6 | P2 | Ink 跟 legacy TUI history 格式不兼容 + Ink 不过滤 slash 命令 + 无 0o600 | `tui.ts:300-340` 写 `{ts,line}` JSON object + 0o600 + 过滤; `tui-ink/src/history/index.ts:25-48` 写 raw line, 不过滤, 无 0o600 |

**附带 finding (用户没列, 我发现)**:
- **F7 (P0.5)**: Ink 调错 `runToolLoop` 签名 + smoke 测没覆盖, 说明"类型不进 root + 测没跑真路径"是双盲点. 必须**代码 + 集成测一起修**.

## 红线 (D-25.0 hotfix + D-25 sprint + F7 P0.5)

### 0. 通用约束

- 0 删已有测试; 0 重构无关代码; 0 改 public API
- 所有 commit 后立即 `git push` + 在当前 channel (飞书 DM) 发推送通知
- 每个 commit 必带可验证的 dist / 测试 / 命令输出证据
- 复盘 (D-25.0) + 计划归档 (D-25 sprint) → `.hermes/plans/d19/d25-*.md`

### 1. D-25.0 hotfix (1 commit cluster = 3 commit, 止血, 用户能跑)

**目标**: 用户立即可跑 (P1 F4) + 误报消除 (P2 F5) + Windows verify 稳 (P1 F3)。

#### 1.1 F4 — tui-ink 用 `homedir()` 暴露 + 接受 `DEEPWHALE_HOME` override

- 文件: `packages/tui-ink/src/history/index.ts:21` `tuiHistoryPath()`
- 新签名: `tuiHistoryPath(homeOverride?: string)` — 优先 `homeOverride`, 然后 `DEEPWHALE_HOME` env, 然后 `process.env.HOME || process.env.USERPROFILE || homedir()`
- 同步修改 `tuiHistoryLoad` / `tuiHistoryAppend` 接收 `homeOverride` 参数透传
- 加 test: `tui-ink` 包内 `test/history.test.ts` — mock env 验 3 路径优先级
- 兼容: legacy `tui.ts` 不动, 留 D-25.2 统一收口

**验收**: `pnpm -F @deepwhale/tui-ink type-check && pnpm -F @deepwhale/tui-ink test` 全过, 新测 1+ 个

#### 1.2 F5 — `looksLikeSpawnError` 收窄, 排除业务 ENOENT

- 文件: `packages/coding-agent/src/verify/verify-runner.ts:341-358`
- 修法: 把 `/No such file/i` 改成 `/No such file or directory/i` (POSIX `/bin/sh -c` 精确匹配) + `/is not recognized/i` (cmd.exe) + `/command not found/i` (POSIX bash) + `/cannot find the (path|file)/i` (cmd.exe) + `/is not a (recognized|valid) command/i` (PowerShell); 删掉短匹配 `/No such file/i` 这个误伤源
- 加 regression test: `verify-runner.test.ts` — Vitest 模拟 child exit 1 + stderr 含 `ENOENT: no such file or directory, open '/x'` → 期待 `looksLikeSpawnError(...)=false`
- 同步: 确认 P2 报告里那条历史 D-20.7.7 7 关键词的 shape 不变量不变 (memory 已有记录)

**验收**: `pnpm -F @deepwhale/coding-agent test -- verify-runner` 全过 + 1 个新 regression 测

#### 1.3 F3 — Windows installed `import-check` / `bin-check` 改 shell-safe

- 文件: `packages/coding-agent/src/verify/verify-runner.ts:197-226` `INSTALLED_CHECKS_TEMPLATE`
- `import-check` 改成单文件 Node 脚本: 写 `import-check.mjs` 到 `<packageRoot>/.verify-cache/import-check.mjs` (每次检查重写, 含 `@deepwhale/coding-agent` 包名), `args: ['node', '<cachePath>']`, `shell:false`
- `bin-check` 改成: `args: ['node', '-e', "require('fs').existsSync('<absPath>') && process.exit(0) || process.exit(1)"]` (单行 JS, shell 无关)
- 同步 `commandTemplate` 字符串拼接 (用 `commandTemplate` 跟 `args` 双轨制, 跟现状保持)
- 加 test: `verify-runner.test.ts` — 跑 `pickChecksForContext` 拿 installed 4 check, 验 `args[0] === 'node'`, `args[1]` 不是 `--check`/`-e`/POSIX 标志

**验收**: Linux 上 `pnpm -F @deepwhale/coding-agent test -- verify-runner` 全过; 用户在 Windows `node node_modules/@deepwhale/coding-agent/bin/deepwhale.js --verify` 4 check 全过 (这条用户实跑验收)

### 2. D-25 sprint (2 commit cluster = 5 commit, 根治)

**目标**: root build 串 tui-ink (F1) + Ink 真接 tool loop (F2 + F7) + 跨 TUI history 兼容 (F6) + release/v1.0 stale (附带清理)

#### 2.1 F1 — root build 串 tui-ink

- 文件: `package.json:13`
- 新 `build`: `tsc -b --force && pnpm -F @deepwhale/tui-ink build && pnpm -F @deepwhale/coding-agent build && node packages/llm/scripts/copy-toml.mjs`
- 加 `tsconfig.json:3` references 加 `{ "path": "./packages/tui-ink" }`
- 加 `tsconfig.json` build 顺序保证 (root tsc -b 自身跑 typecheck 时也覆盖 tui-ink)
- 注意: `pnpm -F @deepwhale/coding-agent build` 已经包含 `copy-tui-ink-bundle.mjs` postbuild, 这就解决了 dist/tui-ink-bundle.js 缺失

**验收**: 全新 `rm -rf packages/*/dist && pnpm install --frozen-lockfile && pnpm build` → `packages/coding-agent/dist/tui-ink-bundle.js` 存在 + `node packages/coding-agent/bin/deepwhale.js --version` 跑通

#### 2.2 F2 + F7 P0.5 — Ink 跑通真 tool loop + 集成测

- 文件: `packages/tui-ink/src/hooks/useRunToolLoop.ts:65` 调用改成 `runToolLoop(client, turnMessages, options)`
- client 来自: hook 接受 `client: LLMClient` 参数 (从 React context 注入), 跟 `useStdout` 容器初始化时建 client 走 `createDefaultClient` factory 模式
- registry 同理: `useRunToolLoop` 接受 `registry: ToolRegistry`
- 加 integration test: `packages/tui-ink/test/integration/tool-loop.test.ts` — 用 mock `LLMClient` + 真实 `ToolRegistry`, 跑 `runToolLoop(client, messages, options)`, 验证返回 `ToolLoopResult` shape 正确, `result.steps` 数组非空
- 补 smoke 测: `packages/tui-ink/test/smoke/run-tool-loop-signature.test.ts` — 静态 import 验证 `runToolLoop` 是 3 参, 防止下次又被改

**验收**: `pnpm -F @deepwhale/tui-ink type-check` 全过 + 1 个新集成测 + 1 个新静态签名 smoke 测

#### 2.3 F6 — legacy ↔ Ink history 格式统一

- 拍板: 统一用 JSONL `{ts,line}` 格式 + 0o600 + 过滤 `/^\s*\//` (slash commands), 跟 legacy 1:1
- 文件:
  - `packages/coding-agent/src/modes/tui.ts:300-340` 抽公共 `tuiHistoryPath` / `tuiHistoryLoad` / `tuiHistoryAppend` / `tuiHistoryTruncate` 到 `packages/coding-agent/src/util/tui-history.ts`
  - `packages/tui-ink/src/history/index.ts` 全部从 `@deepwhale/coding-agent/dist/util/tui-history.js` import (走 workspace 依赖, 跟 Hermes private 决策表一致)
  - legacy `tui.ts` 调用替换为 import 新 util, 0 改业务
- 升级迁移: 旧 raw line JSONL 一次性 detect, 解析失败时回退 raw line (best-effort, 不删数据)
- 加 test: `packages/coding-agent/test/util/tui-history.test.ts` — 验 3 格式 (legacy JSONL / Ink raw / 新格式) 互读不丢数据

**验收**: `pnpm -F @deepwhale/coding-agent test -- tui-history` 全过 + 3 格式互读不破坏

#### 2.4 附带清理 — release/v1.0 stale

- `git push origin release/v1.0:release/v1.0` (fast-forward 到 4b0aba0, 保持 tracking 不变)
- 加 `CHANGELOG.md` 一行: `v1.0.9 ships on main + release/v1.0; release/v1.0 仅作为 release branch 的 mirror, 用户装用 npm tag latest`
- 远端验证: `git ls-remote origin release/v1.0` 必须返 `4b0aba0`

**验收**: 4b0aba0 远端可拉到 (`git fetch origin release/v1.0` HEAD 跟 main 一致)

### 3. 拍板红线 / 验收红线

**D-25.0 hotfix (3 commit)**:
- A1: tui-ink `tuiHistoryPath` 支持 override + DEEPWHALE_HOME env, 新加 1+ test
- A2: `looksLikeSpawnError` 收窄, 删 `/No such file/i` 短匹配, 新加 1 regression test
- A3: `import-check` / `bin-check` 改 shell:false 单 JS, 新加 1 test 验 args 形态

**D-25 sprint (5 commit)**:
- B1: root `package.json` build 串 `pnpm -F @deepwhale/tui-ink build` + coding-agent build, tsconfig.json references 加 tui-ink
- B2: `useRunToolLoop.ts` 修 3 参签名, client/registry 从 context 注入
- B3: tui-ink 集成测 + 静态签名 smoke 测
- B4: 抽 `tuiHistoryPath/Load/Append/Truncate` 到 coding-agent util, tui-ink 复用 + 升级迁移逻辑
- B5: release/v1.0 fast-forward + 远端 ls-remote 验证

**F7 P0.5 必带**: B3 的静态签名 smoke 测 = 整个 D-25 防止"类型不进 root + 测没跑真路径"再发的保险。

### 4. 拍板拆分理由 (D-25.0 vs D-25)

- D-25.0 hotfix 全部都是**单点 + 影响小** (改 keyword / 加 override / 改 args 形态), 不需要改 public API, 不需要 Ink 接 client
- D-25 sprint 是**架构性修复** (root build 链 / Ink 真实 tool loop / 跨 TUI 兼容), 必须等 D-25.0 先让用户能跑, 再做大改
- 拍板时间窗: D-25.0 目标 4 小时内 ship (3 commit); D-25 sprint 目标 8 小时内 ship (5 commit)

### 5. 风险 & rollback

- D-25.0 风险: 低; rollback 用 `git revert <commit>`
- D-25 sprint 风险: 中; B1 root build 链如果出错会卡全仓 `pnpm build`; B2 改 hook 签名可能影响 ink 容器其他 hook; B4 改 history util 可能影响 legacy 用户的 history 文件
- rollback 策略: D-25 sprint 一个 cluster 不成, 整个 revert + 切 `feature/d25-...` 分支重做, 不污染 main

### 6. 沟通 / 推送协议

- 每次 `git push` 后**立即**在当前 channel (飞书 DM) 发推送通知: commit hash(es) + 简明 diff stat + "请 review"
- 所有大 commit 拆成单文件小 commit, diff stat 控制在 +200/-100 内 (除 B4 history util 抽公共)
- sprint 完: 复盘归档到 `.hermes/plans/d19/d25-retro.md` + 推送通知
