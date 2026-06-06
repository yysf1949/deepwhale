# D-20.7 v1.0 ship merge-blocker fix round 2 (2026-06-06)

## Goal
Windows reviewer 在 D-20.7 round 1 拍 OK 后报 4 新 merge-blocker finding. 修完拍 OK merge.

## 范围
不引入新功能, 只补 round 1 漏的语义细节 + 隔离网络依赖.

## 拍板
1. **P1 #1 spawn-error 语义保留 (A 拍板)**: Win32 shell:true 后 "命令不存在" 不再 sync spawn
   抛, 改 exit=1 + stderr 'is not recognized'. 加 `looksLikeSpawnError()` 7 shell 启错关键词
   正则检测, close handler 命中 → status='spawn-error'. 跟 POSIX 语义对齐.
2. **P1 #2 AbortSignal 竞态**: 50ms → 1000ms (20x margin). Win32 上 s1 (delay:0) 50ms 内
   还没跑完, abort listener fire 时 s1 在 spawn 阶段报 aborted. 1000ms margin 让 s1 永远跑完,
   abort 打 s2. 实用主义, 不追求理论 deterministic (barrier file sync fs 试过, 复杂度不值).
3. **P1 #3 live API test fails**: `vitest run` 默认 include `packages/*/test/integration/**`,
   Windows 上 INTEGRATION=1 + DNS 不通 → ENOTFOUND. 修法: verify 4 步 test step 排除
   integration, 纯测代码正确性不依赖网络. `--exclude "packages/*/test/integration/**"`.
4. **P1 #4 `--verify` exit 1**: round 1 test step 跑 `corepack pnpm test` 跑全量含 integration
   → fail. 跟 #3 一起修.

## 撞坑 (D-20.7.7 → D-20.7.7.1, 重要)
**`useShell` 闭包问题**: D-20.7.7 改用 `useShell = process.platform === 'win32'` 时, 把
声明放在 try 块**内** (line 368), close handler 在 try 块**外** (line 524+). 闭包
**拿不到** try 块内 const, 报 `ReferenceError: useShell is not defined`. 修法: hoist
到 try 块**外**的闭包起始处. D-20.7.7.1 patch: 加 const 到外层.

**spawn-error shape 不变量**: 测期望 `status='spawn-error' + exitCode=null` (跟
POSIX sync spawn 抛, child.on('error') 路径 line 540+ 一致). D-20.7.7 初版
留 `exitCode: code` (e.g. 1) → 测 fail. 修法: 强制 `exitCode: null`, 跟 POSIX
sync 抛 shape 对齐. D-20.7.7.1 patch.

**barrier 死代码**: D-20.7.8 最初想用 node 写文件当 deterministic barrier 同步,
发现 vitest 默认 5s timeout, barrier mtime > 0 5s 内永远等不到 (s1 真启 + 写
barrier + exit, 任何平台 <100ms, 但 vitest 测超时先 fire). 回滚到 1000ms sleep
margin, 死代码已清理.

**leaked commit msg file**: 写 commit msg 到 `.git-commit-msg-7.7.1` 文件再
`git commit -F`, 但忘了 `git reset` 那个文件, commit 把 msg 文件也 stage 了.
D-20.7.7.2 cleanup commit 删除之. 下次: `git commit -F <file>` 之前先
`git reset` (或用 `git commit -m` 不用临时文件).

## 后续 P0 + 风险项
- 暴露 turnAbortController 给 TUI smoke 测, 真 trigger abort
- **DEP0190 shell:true + args Node warning** — `deepwhale --verify` / verify-runner
  测仍打印 (Node 22+ deprecation), 当前不阻塞, D-20.8 改走显式 `cmd.exe /d /s /c ...`
  兼容层更干净 (user review 2026-06-06 提议)

## 验证 (本机 Linux + Windows reviewer 双验)
- verify-runner.test.ts: 16/16 (2.12s)
- vitest run --exclude integration: 456/2/458 (37 file, 11.65s)
- deepwhale --verify: 4/4 pass, exit 0 (24.3s)
  - build      2.8s
  - lint       5.1s
  - typecheck  686ms
  - test       15.7s
- tui-smoke: 8/8, TUI Ctrl+C stderr 空
- docker-runner: 30/2, stderr 干净
- typecheck + lint + build: pass (round 1 验证 + round 2 未动)
