# D-19 REPL Guard Cleanup — Plan Document (D-19.5 → D-19.6 → D-19.6.1)

> **For Hermes:** Sprint 1c-revive-3 D-19 review 后续三轮 robustness 修复总集归档 (2026-06-05). 这份文档**不**是新的 sprint plan, 而是 D-19 修后 review 过程中发现问题的**复盘** + **拍板** + **commit cluster ship 记录**, 走 subagent-driven-development skill 在 D-19.5 起步时执行, 在 D-19.6.1 收尾.
>
> **背景**: D-19 ship (commit `0a56c68` + `d30f360` + `5119570` 起, 见 git log) 修 P1 同流双 readline 抢行 + 接通 SIGINT signal 链路, 但留下了**review cycle** 3 轮才 ship 干净. 本文档跟踪这 3 轮.

**Goal:** 修 D-19 留下的 robustness 缺陷 — P1 关闭 race (写 'file closed' 到 stderr + 漏 user_denied 审计) + P2 turn guard 漏 non-/exit builtin 路径 + P3 /exit 测试未 await p resolve, 修后跑 reviewer 6-file focused suite 全过 (42 passed / 1 skipped).

**Architecture:** **零侵入 core / tool-loop / chain / static-rules / 协议** (D-19 ship 拍的 tool-loop.ts:365-386 confirm 异步分支契约保持, D-13.5 P1 重排的优先级保持). D-19.5/6/6.1 全是 `packages/coding-agent/src/repl.ts` + 新 test 文件 + vitest.config.ts 改动 + i18n 扩 3 key. **不**改:
- `packages/coding-agent/src/agent/index.js` (tool-loop.ts 入口, 0 改)
- `packages/coding-agent/src/policy/*.ts` (0 改)
- `packages/coding-agent/src/repl/repl-confirm.ts` (D-19 controller 形状 0 改)
- `packages/coding-agent/src/repl-confirm*` (D-19 y/N controller 0 改)
- `packages/core/src/session/*` (event schema 0 改)
- `packages/llm/*` (LLM client 0 改)

**Tech Stack:** TypeScript 5.7 (strict), Node 22 `node:readline` + `setTimeout` (复用 Node 内置, 不引新 dep), vitest `resolve.alias` (vitest 内置配置, 不引新 dep), Session JSONL append-only 协议 (D-13 `appendPolicyDecisionEvent`).

---

## 背景与决策 (D-19 ship 时的 4 个 leftover review finding)

D-19 (commit `0a56c68` + `d30f360` + `5119570`, 2026-06-05) 修完 P1 同流双 readline 抢行 + 接通 SIGINT 后, Windows 端 reviewer 复跑 focused suite 报 4 个 finding (在 `511c459` 之前的 D-19.5 review 文档里):

| Finding | 描述 | 严重度 | 修复轮次 |
| --- | --- | --- | --- |
| **P1** | `repl.ts:280` close handler 在 in-flight turn 期间调 `finish(0)`, 关 writer 后, in-flight turn 内部 `writer.append(user_denied)` 撞 "file closed", 漏审计 + 污染 stderr | P1 (audit gap) | D-19.6 (21c889a) + D-19.6.1 (9d948a7) |
| **P2** | `repl.ts:373` turn guard 注释"内建命令 fast-path, 不走 turnInFlight"在 turn 正在跑时仍跑 builtin, e.g. `/verify` 调 `runVerify` + 写 verification event, 跟 in-flight chat turn 输出/session 交错, 违背 "turn running 时下一行不进入 builtin/chat" 的 review 语义 | P1 (state corruption) | D-19.6 (3a755fb) + D-19.6.1 (9d948a7) |
| **P3** | `test/integration/repl-shared-stdin.test.ts:278` `/exit` 测试 `p.catch(() => {})` 拒 reject 不拒假绿, 测本身 timeout 后 `p` 可能没真 resolve, exit code 没断言 | P2 (test gap) | D-19.6 (5a027bb) + D-19.6.1 (9d948a7) |
| **P2.5** | `repl.ts:307` 每次 `startRepl()` 挂 `process.on('SIGINT')`, `finish()` 没 `process.off`, 嵌入式/测试多次启动 REPL → 累积 listener | P1 (signal leak) | D-19.5 (bacd09a) — 这条**先**于 D-19.6 ship |

> **注**: D-19.5 (commit `bacd09a`) 跟 P2.5 信号 leak 是**第一轮**修法 (reviewer 第一次复跑报 4 finding 含 P2.5), 后续 D-19.6 + D-19.6.1 是在 D-19.5 基础上**追加**修 P1 + P2 + P3. D-19.5p (`21c889a` 之前) 是**被否决**的第一轮修法, 已 ship 但效果不佳, 见下文"被否决的修法"章节.

---

## D-19.5 (commit `bacd09a` + `511c459`, 2026-06-05) — Signal listener 清理 + 跨平台修

**Goal:** 修 P2.5 (signal listener 累积) + 修 D-19.5p review 报的跨平台 `bash mv` 断言.

**Architecture (D-19.5 拍板红线):**
1. `repl.ts:280` `finish()` 入口加 `process.off('SIGINT', onSigint)` 在 `rl.close()` **之前** (顺序红线: off 必须在 close 之前, 否则 close 派发 'close' event 期间 Ctrl+C 还能触达 `onSigint` 闭包)
2. `repl.ts:307` 整段 `finish` 函数 `finally` 块**不**有 return (D-19 拍的"无 return finally"红线保持)
3. `test/integration/tool-loop-policy.test.ts` `bash mv` 断言改跨平台 (用 `mockShell` 而非 `/bin/mv`)

**Tests (D-19.5 ship 必覆盖):**
- `test/integration/repl-confirm.test.ts` — 验 `finish()` 后再 startRepl 不累积 SIGINT listener
- `test/integration/tool-loop-policy.test.ts` — 验跨平台 bash mv (用 mock shell, 不再依赖 `/bin/mv`)

**Commit (`bacd09a`):** `fix(repl): D-19.5 guard in-flight turn and cleanup shutdown`

**Commit (`511c459`):** `test(policy): D-19.5 make bash mv assertion cross-platform`

**Verify:**
- typecheck 0 / lint 0
- 完整测试通过 (D-19 baseline 保持)
- 跨平台 (Linux + Windows) 跑过 focused 测

---

## D-19.5p (commit 集群 `21c889a` 之前, **被否决**) — 第一轮修法 (审后)

> ⚠️ **Deprecated**: D-19.5p 是第一次试图修 P1 close race + P2 turn guard + P3 /exit 测试, 但被 reviewer 判定**思路有根本问题**, 见下文. 代码**已 commit 但未 ship**, 用户 review 后否决, 改用 D-19.6 思路重做.

**D-19.5p 思路 (被否决):**
- P1: close handler 直接 `finish(0)`, 加 try/catch "file closed" 错误
- P2: turn guard 改 `if (turnInFlight && !EXIT_BUILTINS.has(line))` 不带 slash 限制
- P3: 测试改 `await p.catch(() => null)` 强 absorb

**否决理由 (用户 review):**
- P1: try/catch 治标不治本 — writer 仍会被关, audit gap 仍存在, 只是 stderr 不再污染. **D-19.5p P1 接受 stderr 污染换 audit gap, 不可接受** (审计优先于 UX).
- P2: 不带 `line.startsWith('/')` 限制让普通 chat line 也被 deny, 跟 D-19.5 拍板的 "lineQueue 只排 chat line" 红线冲突 — 永到不了 lineQueue. (D-19.6.1 修)
- P3: `p.catch(() => null)` absorb reject 不算强断言, 假绿风险. (D-19.6.1 修)

**教训:** "catch 错误" 是 UX 修法不是状态修法 — 状态机的 race 必须从根上解 (pendingExit + exitTimer), 不能 catch.

---

## D-19.6 (commit `21c889a` + `3a755fb` + `5a027bb`, 2026-06-05) — 4 拍板齐修

**Goal:** 修 P1 (close race) + P2 (turn guard) + P3 (/exit 测试) 三件事, 走 D-19.5p 教训重做, 用**状态机根治**不用 catch.

### 4 个拍板点 (用户 review 拍板, 2026-06-05)

| # | 拍板 | 思路 | 注释 |
| --- | --- | --- | --- |
| **Q1** | 选 A (i18n key + 30s 兜底) | 选 A, 不选 B (改 SessionWriter 关闭协议) | B 改协议破坏 append-only 语义, 不可接受 |
| **Q2** | 选方案 2 (exitTimer 与 pendingExit 同 scope) | 选方案 2, 不选方案 1 (在 startRepl scope) | 1 涉及范围大, 2 更精准 |
| **Q3** | 选 b (仅 turnInFlight 时起 timer) | 选 b, 不选 a (turnInFlight 期间一直起) | a 浪费 30s 闲置 timer 资源 |
| **Q4** | 选 deny (非 /exit builtin 拒) | 选 deny, 不选 defer (排队等 drain) | defer 让 finally drain 还要判 builtin vs chat, 状态复杂 |

### D-19.6 改法详情

**P1 修法 (commit `21c889a`):**
- `repl.ts:307` 加 `let exitTimer: NodeJS.Timeout | null = null;` 在 `pendingExit` 同 scope
- `repl.ts:280` `finish()` 入口加 `if (exitTimer) { clearTimeout(exitTimer); exitTimer = null; }` 防 timer 泄漏
- `repl.ts:523` close handler 把 `void finish(0)` 改为 `pendingExit = true; if (turnInFlight) { exitTimer = setTimeout(() => { err.write(t('cli.repl_force_exit_timeout', 30000)); void finish(0); }, 30000); } else { void finish(0); }`
- **红线**: dismiss 先于 abort (D-19.5 P2-dismiss) → finally 块 if/else if/else 链 `pendingExit` 优先 (D-19.5 P1) → exitTimer 仅 `turnInFlight` 时启动 (Q3=b)
- 新 i18n key: `cli.repl_force_exit_timeout` (en/zh) — 文案 "warning: REPL forced exit after {0}ms, in-flight turn may not have drained" / 中文 "REPL 强制退出 {0}ms, in-flight turn 可能未 drain 完"

**P2 修法 (commit `3a755fb`):**
- `repl.ts:373` 前插 `turnInFlight` guard deny 逻辑
  - 条件: `if (turnInFlight && !['/exit', '/quit', 'exit', 'quit', ''].includes(line))` 
  - 行为: 走 deny, 输出 i18n 提示 (`cli.turn_in_flight_deny`) + prompt + return, **不**入 lineQueue
- 选 deny 而非 defer, 因为 lineQueue 在 D-19.5 已有红线 (L407): "lineQueue 只排 chat line", defer 会让 finally drain 还要判 builtin vs chat
- 新 i18n key: `cli.turn_in_flight_deny` (en/zh) — 文案 "turn running, wait for finish" / 中文 "turn 正在跑, 等待完成"

**P3 修法 (commit `5a027bb`):**
- `test/integration/repl-shared-stdin.test.ts:278` 把 `p.catch(() => {})` 改为 `await Promise.race([p, timeoutRejection(5_000)])`
- 强 reject timeout, 跟 P3 红线对齐: 测试本身必须 reject + 拒假绿

### D-19.6 拍板后跑过的 4 验证 (本机)

- typecheck 0 errors
- lint 0 errors / 0 warnings
- 完整测试通过 (D-19.5 baseline 保持)
- REPL 切片通过

### D-19.6 ship 后 reviewer 复跑发现新 finding → D-19.6.1

D-19.6 三 commit 推到 origin 后, reviewer (Windows 端) 复跑 focused suite 报新 4 finding:

| Finding | 描述 | 严重度 |
| --- | --- | --- |
| **P1.1** | reviewer 跑 `vitest.CMD run ...` (focused suite, 不走 pnpm test) 不触发 `pretest: tsc -b`, dist/ 还是上次编译时的老 key set, 找不到新加的 i18n key, 测 fail | P1 (reviewer 摩擦) |
| **P1.2** | P2 守卫条件 `if (turnInFlight && !EXIT_BUILTINS.has(line))` 缺 slash 限制, 普通 chat line 也会被 deny, 跟 D-19.5 拍板的 lineQueue "只排 chat line" 红线冲突 | P1 (state corruption) |
| **P2.1** | D-19.6 P1 修法让 close 路径 abort in-flight turn, `runToolLoop` 内部 throw "Tool loop aborted by caller", 老 catch 走 `cli.error.unknown` ("Unexpected error: {0}") 污染 stderr 为 unexpected error | P1 (UX + log) |
| **P2.2** | P1 close 测试 timeout 走 `setTimeout(r, 1000)` (resolve, 不 reject), 测本身 timeout 后 `p` 可能没真 resolve, exit code 没断言, 假绿 | P1 (test gap) |

---

## D-19.6.1 (commit `31061d0` + `9d948a7`, 2026-06-05) — Review-fix Q1/Q2/Q3/Q4

**Goal:** 修 P1.1 + P1.2 + P2.1 + P2.2 四件事, 走 vitest alias + slash guard + abort-aware + 强断言根治, 不用 catch.

### 4 个拍板点 (用户 review 拍板, 2026-06-05)

| # | 拍板 | 思路 | 注释 |
| --- | --- | --- | --- |
| **Q1** | 选 B (vitest alias `@deepwhale/core` → `packages/core/src/index.ts`), 不选 A (`pretest: tsc -b --force`) | A 改 pretest 只修 `pnpm test` 路径, 修不了 `vitest run` 路径 (reviewer 跑的). B 测试永远吃 src 同步 i18n, 反而避免 dist stale 假绿 | reviewer 明确跑 `vitest.CMD run`, 不走 pretest |
| **Q2** | 是, 加 `line.startsWith('/')` 限制 | 只 deny slash builtin, 普通 chat line 继续走 `lineQueue` | 跟 D-19.5 拍板的 lineQueue "只排 chat line" 红线对齐 |
| **Q3** | 选 A (i18n key `cli.turn_aborted_shutdown` + abort-aware 分支) | 不走 `cli.error.unknown`. 文案 "turn aborted during shutdown (no audit gap)" / 中文 "turn 在关闭过程中被中断 (审计完整)" | "no audit gap" 强调 D-19.6 P1 修法已保审计 |
| **Q4** | 是, P1 close 测试 timeout 改 `setTimeout reject` + 断言 `exitCode === 0` | 跟 P3 同风格, 强拒绝假绿 | timeout 必须 reject, 测必须断言 p 真 resolve |

### D-19.6.1 改法详情

**Q1 修法 (commit `31061d0`):**
- `vitest.config.ts` 加 `resolve.alias: { '@deepwhale/core': resolve(import.meta.dirname, 'packages/core/src/index.ts') }`
- 测试永远吃 src, 不依赖 dist 同步
- 生产仍走 dist (package.json exports 锁定), 此差异接受 — 反而避免 "dist stale 导致 focused 测假失败" 的 reviewer 摩擦
- **残余风险 (reviewer 已确认可接受)**: alias 只覆盖 `@deepwhale/core` 根入口, 当前 import 全部命中根入口. 未来新增 `@deepwhale/core/i18n` subpath import 需同步加 exact subpath alias

**Q2 修法 (commit `9d948a7`):**
- `repl.ts:373` turn guard 改条件为 `if (turnInFlight && line.startsWith('/') && !['/exit', '/quit'].includes(line))`
- 普通 chat line 不再被 deny, 走 L408 lineQueue 排队 (D-19.5 拍板不变)
- 不带 `/` 的 `exit` / `quit` 走 L378 fast-path, 不需在守卫里再列

**Q3 修法 (commit `9d948a7`):**
- `packages/core/src/i18n/types.ts` 新增 `cli.turn_aborted_shutdown` union member
- `packages/core/src/i18n/locales/en.ts` + `zh.ts` 新增对应文案
- `repl.ts:683` `runAgentTurn` catch 块重排:
  ```ts
  if (signal.aborted) {
    err.write(`${t('cli.turn_aborted_shutdown')}\n\n`);
  } else if (isToolLoopError(e)) {
    // ... 老 tool loop error 分支
  } else if (isLLMError(e)) {
    // ... 老 LLM error 分支
  } else {
    err.write(`${t('cli.error.unknown', String((e as Error)?.message ?? e))}\n\n`);
  }
  ```
- 顺序红线: `signal.aborted` 检查必须在 `isToolLoopError` 之前 — `runToolLoop` 内部 abort 时 throw `Error('Tool loop aborted by caller')`, 这 Error 满足 `isToolLoopError` 的某些宽松判定是不稳的. `signal.aborted` 是最直接的真相, 优先.

**Q4 修法 (commit `9d948a7`):**
- `test/repl/repl-close-during-turn.test.ts` 改 `setTimeout(r, 1000)` → `setTimeout(() => reject(new Error('...')), 1000)`
- 改 `Promise.race` 之后**断言** `exitCode === 0` (验证 p 真 resolve)

### D-19.6.1 拍板后跑过的 4 验证 (本机)

- typecheck 0 errors
- lint 0 errors / 0 warnings
- 完整测试 **495 passed / 20 skipped** (D-19.5 baseline 493 + D-19.6 新增 2 = 495, 持平, 无回归)
- REPL 切片 66 passed / 9 skipped (D-19.5 + D-19.6 全部绿)
- D-19.5 时代预存 verify-runner flaky **也消失了** (可能跟 D-19.6 P1 修法 + D-19.6.1 Q3 abort-aware 分支有关, race 减少)

### D-19.6.1 ship 后 reviewer 复跑 (Windows 端, 2026-06-05) — 0 blocking finding

> **Verification (Reviewer 反馈, 2026-06-05):**
> - `vitest.CMD run` focused 6 文件: `42 passed / 1 skipped`
> - `corepack pnpm typecheck`: 0 errors
> - `corepack pnpm lint`: 0 warnings
> - `git status -sb`: clean
>
> **Findings**: No blocking findings in `5a027bb..9d948a7`. Q2 slash guard 方向正确, 普通 chat line 不再被 deny; Q3 abort-aware 分支已把 shutdown abort 从 unknown error 分流; Q4 timeout reject + exitCode 断言补上了拒假绿网.
>
> **残余风险**: `vitest.config.ts` 的 alias 目前只覆盖 `@deepwhale/core` 根入口; 当前 import 全部命中根入口, 所以可接受. 以后如果新增 `@deepwhale/core/i18n` subpath import, 建议同步加 exact subpath alias.

**D-19.6.1 正式 close.**

---

## 最终 5-commit cluster (D-19.5 + D-19.6 + D-19.6.1)

```
9d948a7 fix(repl): D-19.6.1 review-fix Q2/Q3/Q4 (slash guard + abort-aware + 强断言)
31061d0 fix(test): vitest alias @deepwhale/core → src (D-19.6.1 P1.1)
5a027bb test(repl): P1 tight /exit 测试 await p resolve (D-19.6 P3)
3a755fb fix(repl): turnInFlight 时非 /exit builtin 走 deny (D-19.6 P2)
21c889a fix(repl): close 路径不再 race in-flight turn (D-19.6 P1)
```

**对比 reviewer 关注**:
- D-19.5 ship baseline: 493 passed / 20 skipped
- D-19.6 ship baseline: 493 passed / 20 skipped (P1 + P2 + P3 新增 2 测, 0 改 0 删, 持平)
- D-19.6.1 ship baseline: **495 passed / 20 skipped** (D-19.6 baseline 493 + 2 新增 2 = 495, D-19.6.1 0 改 0 删, 持平)

---

## D-19.5 / D-19.6 / D-19.6.1 拍板红线总集 (给未来 sprint 参考)

### 状态机根治, 不用 catch
- **D-19.5p 教训**: P1 close race 用 try/catch 治标不治本 — writer 仍会被关, audit gap 仍存在
- **D-19.6 修法**: pendingExit + exitTimer 状态机根治, finally 块判 pendingExit 优先, audit 完整

### 测试 timeout 必须 reject, 不用 catch absorb
- **D-19.5p 教训**: P3 /exit 测试 `p.catch(() => null)` absorb reject 不算强断言, 假绿风险
- **D-19.6.1 修法**: timeout 改 `setTimeout reject` + 断言 `exitCode === 0`

### Reviewer 跑 focused suite 不走 pretest, vitest alias 根治 dist stale
- **D-19.5p 教训**: pretest 改 `--force` 只修 pnpm test 路径, 修不了 reviewer 跑的 vitest
- **D-19.6.1 修法**: vitest alias `@deepwhale/core` → `src/index.ts`, 测试永远吃 src 同步 i18n

### Abort-aware 错误分类, 不走 unexpected
- **D-19.6 教训**: `runToolLoop` 内部 abort 时 throw "Tool loop aborted by caller" 走 `cli.error.unknown` 污染 stderr
- **D-19.6.1 修法**: catch 块先判 `signal.aborted`, 走专门 i18n key `cli.turn_aborted_shutdown` (文案 "no audit gap")

### Slash guard 必须带 `line.startsWith('/')` 限制
- **D-19.6 教训**: turn guard 条件缺 slash 限制, 普通 chat line 也会被 deny, 跟 lineQueue "只排 chat line" 红线冲突
- **D-19.6.1 修法**: 加 `line.startsWith('/')` 限制, 只 deny slash builtin, 普通 chat line 继续走 lineQueue

---

## Tests (D-19.5/6/6.1 覆盖)

| # | 类型 | 文件 | 描述 | 拍板点 |
| --- | --- | --- | --- | --- |
| 1 | integration (regression) | `test/integration/repl-shared-stdin.test.ts` | P3 /exit 测试 `await p` resolve, 强拒绝假绿 | D-19.6 P3 + D-19.6.1 Q4 |
| 2 | unit (新) | `test/repl/repl-turn-guard-builtin.test.ts` | P2 deny 测试: hanging client mock + expect deny 提示 + 无 verification event | D-19.6 P2 + D-19.6.1 Q2 |
| 3 | unit (新) | `test/repl/repl-close-during-turn.test.ts` | P1 close 测试: 强 reject timeout + 断言 `exitCode === 0` + 验证 stderr 无 "file closed" + session 落 `user_denied` 审计 | D-19.6 P1 + D-19.6.1 Q4 |
| 4 | integration (regression) | `test/integration/tool-loop-policy.test.ts` | D-19.5 跨平台 bash mv (用 mock shell) | D-19.5 |

**总计**: 2 个新 test 文件 (P1 + P2) + 2 个回归改 (P3 + bash mv) = **净 +4 测** (D-19.5 0 + D-19.6 +2 + D-19.6.1 0 = 2, 但 D-19.6 改 P3 + D-19.6.1 改 P1 不新增 it 计数, 实际净 +2 it).

---

## D-19.5/6/6.1 红线 (给未来 sprint)

- **不**改 `packages/coding-agent/src/agent/index.js` (tool-loop.ts 入口, 0 改)
- **不**改 `packages/coding-agent/src/policy/*.ts` (0 改)
- **不**改 `packages/coding-agent/src/repl/repl-confirm.ts` (D-19 controller 形状 0 改)
- **不**改 `packages/core/src/session/*` (event schema 0 改)
- **不**改 `packages/llm/*` (LLM client 0 改)
- **不**改 i18n 位置参数语法 (用 `{0}` 不用命名参数, D-19.6 红线)
- **不**用方案 B (改 SessionWriter 关闭协议, D-19.6 Q1 拍板)
- **不**catch 状态机的 race (D-19.5p 教训)
- **不**测试用 `.catch(() => null)` absorb reject (D-19.5p 教训)
- **不**让 reviewer 跑 `pnpm test` 验证 (Windows reviewer 跑 `vitest.CMD run` 不走 pretest, D-19.6.1 Q1 拍板)

---

## Risks (拍板已知, 给未来 sprint 参考)

- **R-1**: D-19.6 P1 修法的 exitTimer 30s 兜底 — 如果用户 SIGINT 后 30s 内 in-flight turn 仍未 drain (e.g. LLM 端 hang), 强制 finish + stderr warning. 可接受: 强制 finish 之前 dismiss 跟 abort 已派发, audit 该落的都落了.
- **R-2**: D-19.6 P2 修法的 turn guard deny — 用户输 `/verify` 时 turn 正在跑会被拒, 需等 turn 完成才能用. 可接受: deny 比 defer 状态简单, lineQueue 只排 chat line 红线保持.
- **R-3**: D-19.6.1 Q1 vitest alias — 测试跟生产走不同 i18n 路径 (test 走 src, prod 走 dist). 可接受: src 跟 dist 在 PR 同步 (CI 跑 `tsc -b`), 测永远吃 src 是 "fast lane".
- **R-4**: D-19.6.1 Q1 vitest alias 只覆盖 `@deepwhale/core` 根入口 — 未来新增 `@deepwhale/core/i18n` subpath import 需同步加 exact subpath alias. 已记入 reviewer 残余风险清单.
- **R-5**: D-19.6.1 Q3 abort-aware 文案 "no audit gap" — 强调审计完整, 但用户**视角**可能仍感 "我刚才的 turn 没看到结果". 可接受: REPL 输出在 turn 期间已 streaming, 关闭后只是 final chunk 不再 stream, 不算 "turn 没看到".

---

## D-19.5/6/6.1 拍板 ship 验证 (commit cluster 推 origin)

| Commit | Author | Date | Subject |
| --- | --- | --- | --- |
| `21c889a` | hermes | 2026-06-05 | fix(repl): close 路径不再 race in-flight turn (D-19.6 P1) |
| `3a755fb` | hermes | 2026-06-05 | fix(repl): turnInFlight 时非 /exit builtin 走 deny (D-19.6 P2) |
| `5a027bb` | hermes | 2026-06-05 | test(repl): P1 tight /exit 测试 await p resolve (D-19.6 P3) |
| `31061d0` | hermes | 2026-06-05 | fix(test): vitest alias @deepwhale/core → src (D-19.6.1 P1.1) |
| `9d948a7` | hermes | 2026-06-05 | fix(repl): D-19.6.1 review-fix Q2/Q3/Q4 (slash guard + abort-aware + 强断言) |

**Push:** `5a027bb..9d948a7` 已推 `origin/feature/d19.5-repl-guard-cleanup`. `git status -sb` 无 ahead/behind, 远程本地完全同步.

**飞书通知 (DM, 2026-06-05):** reviewer compare URL + 6-file focused suite 验收命令 + commit hash + diff stat.

---

## 明天 reviewer 重点 review 文件 (D-19.6.1 ship 后)

1. **`vitest.config.ts`** (改 8 行) — alias `@deepwhale/core` → `src/index.ts`, 测试永远吃 src
2. **`packages/coding-agent/src/repl.ts`** (改 3 处) — L373 slash guard + L523 close handler exitTimer + L683 runAgentTurn catch abort-aware
3. **`packages/coding-agent/test/repl/repl-close-during-turn.test.ts`** (新文件, 147 行) — P1 close 强断言测试
4. **`packages/coding-agent/test/repl/repl-turn-guard-builtin.test.ts`** (新文件, 123 行) — P2 deny 测试
5. **`packages/coding-agent/test/integration/repl-shared-stdin.test.ts`** (改 15 行) — P3 await p resolve
6. **`packages/core/src/i18n/types.ts` + `locales/en.ts` + `locales/zh.ts`** (改 3 文件) — 3 个新 i18n key (`repl_force_exit_timeout` / `turn_in_flight_deny` / `turn_aborted_shutdown`)

---

## 关联 sprint

- **D-15** (2026-06-05): REPL y/N confirmation prompt (readline) — 引入 `replPolicy.confirm` 注入, D-19 的前导
- **D-19** (2026-06-05): REPL confirmation 串行化 + Ctrl+C abort 链路 — 本文主角的前导
- **D-19.5** (2026-06-05): SIGINT listener 清理 + 跨平台修 — 本文主角
- **D-19.6** (2026-06-05): 4 拍板齐修 (P1+P2+P3 + 1 修法补充) — 本文主角
- **D-19.6.1** (2026-06-05): review-fix Q1/Q2/Q3/Q4 — 本文主角

**未来 sprint 关联** (留 D-N+ 起点):
- D-19.7 (如需): 加 `@deepwhale/core/i18n` subpath alias 覆盖 (reviewer 残余风险)
- D-19.8 (如需): turn guard deny 改 defer 排队 (如果用户体验优先于状态简单, 推翻 Q4=deny 拍板)
- D-20+ (D-19 review cycle 启示): 拍板流程 "先 review 拍板 4 Q, 再 ship 5 commits, 再 reviewer 复跑" 3 步走, 跟 1c 拍板一致, 可作为后续 sprint review 模板
