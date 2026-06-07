# D-19 Plan: REPL Confirmation 串行化 + Ctrl+C 接通

> Sprint 1c-revive-3-D-19 — 修 D-15 review 留的 3 个债 (P1 blocker + P2-test 覆盖 + P2-Ctrl+C 假承诺)。

## 1. Scope

**In scope** (2 commit):
- **P1 修法**: 拆掉 `repl-confirm.ts` 里独立 `createInterface` 的子 readline。改为**单 readline 路径**: confirm 期间主 `rl` 临时把 line 收集到 `inFlightConfirm` 的 promise buffer 里, 解析完才放行。工具交互期间 `y/n` 不会再被主 `line` 误食成新 chat turn。
- **P2-test 修法**: 在 `test/integration/` 加一个 `repl-shared-stdin.test.ts`, 用**一个** `PassThrough` 同时喂 `startRepl` + confirm, 验证 `y` 不进 workingMessages, 验证 `n` 后下一个 line 才进 chat。
- **P2-Ctrl+C 修法**: `startRepl` 在主 rl 上挂 `SIGINT` listener → 复用 `ac.signal` (line-level AbortController, repl.ts:350 已有), 然后 `tool-loop.ts:367` 的 `policy.confirm` 接受第二个参数 `{signal}` 并透传到 `repl-confirm.ts` 已有的 abort 处理。SIGINT 不杀进程, 只 dismiss 当前 confirm (跟 README:339 承诺一致)。
- **README 同步**: 行 339 改 "Ctrl+C / EOF" 段, 写清楚 Ctrl+C 实际行为是 dismiss 当前 confirm (不是杀 REPL), 没 in-flight confirm 时 Ctrl+C 走原行为。

**Out of scope** (D-19 不动):
- 不改 `staticToolPolicy` 接口, 不动 `tool-loop.ts:367` 之外的分支, 不改 session writer schema, 不动 D-15 已 ship 的 policy 决策顺序。
- 不做 D-16 (user policy config) / D-17 (RPC confirmedTools) / D-18 (TUI)。
- 不重写 confirm 协议 (D-13.5 已定 4 分支顺序)。

## 2. Threat / Bug Model

| 现象 | 现状 (D-15) | D-19 修后 |
|---|---|---|
| 用户在 confirm 期间输 `y` 触发第二次 chat turn | ❌ 子 readline + 主 rl 同 input 抢行, 实测重现 | ✅ 主 rl 确认期间把 line 路由给 confirm resolver, 不入 workingMessages |
| `startRepl` 端到端回归测缺失 | ❌ 现有测用独立 PassThrough 喂 confirm, 测不到主 rl 抢行 | ✅ 共享 PassThrough 测覆盖 `y/n/empty` 三态 |
| README:339 写 Ctrl+C dismiss, 代码不接 | ❌ tool-loop 不传 signal, repl.ts 没 SIGINT 监听 | ✅ repl.ts SIGINT → ac.abort() → confirm resolve null, 文档行为真实 |
| Ctrl+C 把整 REPL 干掉 | 不会 (rl 没绑 SIGINT), 但 README 承诺了"会 dismiss" | Ctrl+C 仍不杀 REPL, 但确实 dismiss 当前 confirm (落 `user_denied` reason=`user dismissed`) |

## 3. Architecture

```
startRepl (repl.ts)
  ├─ 主 rl.line 路由:
  │    if (inFlightConfirm) → 喂给 confirm buffer (不入 chat)
  │    else → 走原 chat 分支
  └─ SIGINT listener → ac.abort() → tool-loop 把 ac.signal 透传 confirm
                              ↓
                        repl-confirm.ts (已支持 abort → null)
```

**`repl-confirm.ts` API 扩 1 个参数**: `confirm(prompt, opts?: {signal?: AbortSignal})`, 现有 `createReplConfirm` 单测接口保持不变 (signal 是可选)。

**`tool-loop.ts:367` 调用点改 1 行**:
```ts
// before
const ok = await policy.confirm(`Allow ${tc.name}? (${sanitizeReason(decision.reason)})`);
// after
const ok = await policy.confirm(
  `Allow ${tc.name}? (${sanitizeReason(decision.reason)})`,
  { signal: ctx.signal },  // 新增: 透传 turn-level abort
);
```
(前提: `runAgentTurn` 已把 `ac.signal` 传下来, 这次只在 `ctx` 加 `signal` 字段。)

## 4. Tasks

**Commit 1: `fix(repl): D-19 serialize confirmation input`**
1. `repl-confirm.ts`: 删掉内部 `createInterface`, 改成"接受单行"的纯函数 `resolveConfirmLine(rawLine: string): boolean | null`。`createReplConfirm` 返回的函数签名扩 `{signal?}` 可选, 内部维护一个 `pendingResolve` 状态机。
2. `repl.ts`: 主 `rl.on('line', ...)` 头部加 `inFlightConfirm` 守卫; 确认期间把 line 喂 `pendingResolve(...)`, 确认完还原成 `prompt()`。新增 SIGINT listener: `rl.on('SIGINT', () => ac.abort())` (ac 是 line-level AbortController, repl.ts:350 那个, 已在 chat 分支用)。
3. `tool-loop.ts`: 第 367 行 `policy.confirm` 调多传 `{signal: ctx.signal}`; `ctx` 已有 `signal: AbortSignal` 字段 (从 `runAgentTurn(..., ac.signal, ...)` 注入, 见 repl.ts:367 + 工具 chain)。
4. `runAgentTurn` / `runToolLoop` 调用链核对: `ac.signal` 必须从 `repl.ts:350` 一路到 `tool-loop.ts:367` (否则 confirm 拿不到 signal)。先 `grep -n "signal" tool-loop.ts` + `chain.ts` 确认缺口, 再补 `ctx.signal = ac.signal` 之类的注入点。
5. 跑 `repl-confirm.test.ts` (11 it) + `tool-loop-policy.test.ts` (D-13 兼容测) 必须全绿。

**Commit 2: `test(docs): D-19 cover shared REPL stdin and Ctrl+C contract`**
1. 新建 `test/integration/repl-shared-stdin.test.ts`:
   - 测 1 (y 不入 chat): 一个 PassThrough → `startRepl` + 注入 confirm。顺序 write: `请删文件\n` (chat) → mock client 返回 tool call → confirm prompt 显示 → write `y\n` → 工具执行 → 拿一个 next line `请删文件\n` (用户没动键盘? 跳过; 直接发 `/exit\n`)。断言 workingMessages 里**没有** `y` 单独一条 user message, 且 tool call 落 `user_approved`。
   - 测 2 (n 拒绝): 同上, 写 `n\n` → 工具不执行 + `user_denied` + chat 不继续。
   - 测 3 (Ctrl+C dismiss): 同上, 在 confirm 显示时模拟 SIGINT (调 ac.abort 内部不好直接搞, 改用 `repl.confirm` 的 signal 接口直接测 → 不行, 这条放到 `tool-loop-policy.test.ts` 加 1 个 mock signal 测试更顺)。**简化**: 测 3 改为 `tool-loop-policy.test.ts` 加 1 it: `confirm` 接受带 `signal: already-aborted` 的 opts, 立刻 resolve `null` (走 fail-closed deny)。
2. README.md:339 改段: 把"Ctrl+C 拒绝"换成"Ctrl+C dismiss 当前 confirm (落 `user_denied` reason=`user dismissed`), 不杀 REPL; 无 in-flight confirm 时 Ctrl+C 由 Node 默认行为接管 (EOF)"; 注释引用 `repl-confirm.ts` + `tool-loop.ts:367` 的 signal 注入。
3. 跑 `repl-confirm.test.ts` + `repl-tool-loop-confirm.test.ts` (3 it) + `tool-loop-policy.test.ts` (D-13) + `repl-shared-stdin.test.ts` (新 2 it) 全绿。

## 5. Verification (sprint exit gate)

按用户 commit + push 协议跑 4 验证 + 1 文档自查:

1. `pnpm -C packages/coding-agent test -- repl-confirm tool-loop-policy repl-tool-loop-confirm` — focused 测, 期望全绿, **记录实测数字** (test 数, before / after)。
2. `pnpm -C packages/coding-agent test` — 整 package, 期望基线持平或涨 (不能掉)。
3. `pnpm -C packages/coding-agent typecheck` + `pnpm -C packages/coding-agent lint` — 必须 0 error。
4. `pnpm -C packages/coding-agent build` — 必须成功。
5. **文档自查 4 扫**: (1) 占位符残留 (2) 优先级 vs 文字矛盾 (3) 上游张冠李戴 (4) ★ 估算 vs 实测数字 (从 D-15 复盘学到的, 这次 README 改完先 grep 一遍)。

## 6. Risks

- **R-1** (高): SIGINT 在 `terminal: false` 下可能不触发 (pipe 模式 Node 默认不发 SIGINT)。修法: SIGINT 监听挂在 `process` 而不是 rl 上, `rl.input.unref()` 不要 unref signal 路径。fallback: 用户真要 abort, 还有 EOF (`input.end()`)。
- **R-2** (中): `inFlightConfirm` 守卫跟 `prompt()` 的顺序: 解析完确认后必须调 `prompt()` 恢复下一轮等待, 否则 REPL 看起来"挂死"。测试里要 assert `out` 收到第二个 prompt 字符。
- **R-3** (低): `tool-loop.ts:367` 改 1 行后, 其它 `policy.confirm` 调用点 (RPC, TUI) 没传 signal 也能跑 (signal 可选, undefined 走老路径), 不破坏 D-15 兼容。
- **R-4** (低): `chain.ts` 已有 `ac.signal` 透传, 我得在开干前 `grep -n "signal" chain.ts` 确认 `ctx.signal` 字段在 `ToolLoopContext` 上, 没有就先加。

## 7. Commit Plan

- **Commit 1**: `fix(repl): D-19 serialize confirmation input`
  - P1 主修 (repl-confirm.ts + repl.ts) + Ctrl+C 链路接通 (tool-loop.ts:367 signal 透传)
  - **A** 拆子 readline; **B** repl.ts inFlightConfirm 守卫 + SIGINT 监听; **C** tool-loop.ts:367 加 signal; **D** 跑 focused 测全绿
- **Commit 2**: `test(docs): D-19 cover shared REPL stdin and Ctrl+C contract`
  - P2-test + 文档同步
  - **A** repl-shared-stdin.test.ts 新增 2 it (y/n); **B** tool-loop-policy.test.ts 加 1 it (aborted signal); **C** README:339 改 Ctrl+C 段; **D** 4 验证 + 文档自查
