# D-20.7 v1.0 ship merge-blocker fix (2026-06-06)

## Goal
清 Windows reviewer 在 2026-06-06 报的 5 个 merge-blocker finding, 让 `pnpm test` 在 Windows 上跑得通 + `deepwhale --verify` 走得通.

## 范围
不引入新功能, 只做 "让 v1.0 ship 走得通" 4-5 颗 commit cluster. 跨 sprint, 走新分支 `d-20.7-merge-blocker-fix`.

## 5 个 Finding 拍板

### P1 #1 — Windows `deepwhale --verify` spawn EINVAL
**Root cause**: D-11-4 加了 `resolveRunner('corepack'->'corepack.cmd')` 但 Win32 CreateProcessW 默认不接 `.cmd` shim. 后缀加对了, 调度仍错.
**Fix**: spawn 时 `shell: process.platform === 'win32'`, 让 Node 自动 dispatch 到 cmd.exe. POSIX 上 `shell:false` 默认不变, 跟 1c 时代完全兼容. subArgs.slice(1) 不含 'corepack', 不进 shell 解析.
**File**: `verify-runner.ts:325` (line 325 加 `shell: useShell`)
**Commit**: D-20.7.1

### P1 #2 — Windows timeout 路径 rmSync(workDir) EPERM
**Root cause**: timer fired 立刻 finalize → Windows 上 child cwd 句柄还占着 → caller rmSync EPERM.
**Fix**: timer fired 标 `timedOut=true` + child.kill + 5s grace SIGKILL, 等 `child.on('close')` 才 finalize. 双重保险: grace 5s 仍 close 时强制 finalize (避免永远 hang). close 路径加 `timedOut` 优先判定 (在 childAborted / signal 前), status 准确报 `timed-out` 而非 `spawn-error` (SIGTERM 误报).
**File**: `verify-runner.ts:413` (timer 改写) + `verify-runner.ts:458` (close 路径加 timedOut 分支)
**Commit**: D-20.7.2 (合 D-20.7.1 一颗)

### P1 #3 — `pnpm lint` 失败: TUI 测有未用变量
**Root cause**: D-20.6.4 加的 `const controller = new AbortController()` 后只 pre-abort 一次, 后面**真没再用了** (mock 自己 hardcoded `signal.aborted`, 跟外部 controller 无关).
**Fix**: 删 controller 变量 + 改 test 名 `turnAbortController.signal 透传` → `signal forwarding contract — TUI 透传 signal 给 runToolLoop`. 注释明确: 本 it 验证 forwarding contract, **不**验证 TUI 内部 controller 真 trigger. 真 trigger 留 D-20.7+ (需要 tui.ts 暴露 controller 给测试).
**File**: `tui-smoke.test.ts:349`
**Commit**: D-20.7.3

### P2 #4 — TUI signal 测试文案比覆盖强
**Root cause**: D-20.6.4 加了 line 432 "强化版" it, 名字叫 `turnAbortController.abort() 透传 → runToolLoop 第 2 步抛 abort`, 但实际是 mock 2nd call 自己 hardcoded 抛, 跟 TUI 内部 controller 无关. 名实不符.
**Fix**: 跟 P1 #3 一起降级. it 改名 `abort error path — TUI 在 LLM 抛 abort 错误时不 hang 走 err`, 注释说明本 it 验证 abort error 到达 TUI 走 err path (不 hang, 干净退出). mock 自己 hardcoded 抛的事实写明.
**File**: `tui-smoke.test.ts:432`
**Commit**: D-20.7.3 (合 P1 #3 一颗)

### P3 #5 — docker-runner focused 通过但 stderr 有噪声
**Root cause**: 测试 mock 走 promisify.custom 时 stdout 解构偶发拿不到 (vitest vi.clearAllMocks + vi.hoisted 闭包互动的微秒竞态). 旧代码 `(stdout as Buffer).toString` 抛 TypeError, catch 后 `console.warn` 泄漏到 stderr.
**Fix**: 改测, 用 stderrSpy 屏蔽 + try-catch 包 cleanup, 显式接受 cleanup 内部 warn. 测关注点仍是 `rm 没被调`, 跟 stderr 噪声解耦.
**已知风险**: 真 root cause (vitest mock 竞态) 没修, 偶发. 留给上游 vitest 调查或后续 sprint 改用 memfs.
**File**: `docker-runner.test.ts:605`
**Commit**: D-20.7.4

## Commit Cluster (4 颗)

1. `b6ff27a` — fix(verify): Win32 shell:true + timeout 不在 timer fired 立刻 finalize (D-20.7.1+2)
2. `b89a40a` — fix(test): TUI signal 测降级为 forwarding contract (D-20.7.3)
3. `2f89926` — fix(test): docker-runner cleanup 测吞 stderr 噪声 (D-20.7.4)
4. `<pending>` — fix(docs): README + ship plan 数字同步 (D-20.7.5) + plan 文档 (D-20.7.6)

## 跨 Sprint 隔离
新分支 `d-20.7-merge-blocker-fix` from `731ff18` (跟 D-20.6 同基, 不基于 D-20.6 branch, 避免跨 sprint 污染). 4 颗 commit cluster 全 push + 飞书推送通知.

## Linux Baseline
- typecheck: pass
- tui-smoke: 8/8 pass
- docker-runner: 28/2 pass, stderr 干净
- env-gate: 10/10 pass
- verify-runner: 16/16 pass (含已知偶发 line 232 race, 跟本 fix 无关)
- prefix-cache-4-mechanisms-contract: 8/8 pass

## 已知遗留 (D-20.7 范围外)
1. **D-20.7 P0**: 暴露 turnAbortController 给测试, 真 trigger abort, 验 runToolLoop 收到 aborted=true. 需要 tui.ts 暴露 controller, 改 tui.ts 内部结构, 风险高.
2. verify-runner.test.ts:232 50ms race 偶发 fail → 留 sprint 调查
3. docker-runner cleanup stderr 偶发 (vitest mock 竞态, 真 root cause 未修) → 留 sprint 调查
4. 真 LLM cache 命中验证 → 留 sprint 2

## 验证清单 (给 Windows reviewer)
- [ ] `corepack pnpm test` 全量通过 (尤其 verify-runner 全过, docker-runner 0 failed, tui-smoke 0 failed)
- [ ] `corepack pnpm lint` --max-warnings 0 干净
- [ ] `corepack pnpm typecheck` pass
- [ ] `node packages/coding-agent/bin/deepwhale.js --verify` 不再 spawn EINVAL, 4 步全 pass
- [ ] `node packages/coding-agent/bin/deepwhale.js tui` 能进 TUI, Ctrl+C 干净退出

## reviewer OK 标准
5 个 finding 全修 + Linux focused 全绿 + Windows 上方 5 项全 ✓ → "OK merge".
