# D-20.6 v1.0 Ship Review-Fix Ship 总集（2026-06-06）

**Sprint**: 1c-revive-5
**Branch**: `feature/d20.6-v1-review-fix` (领先 main 23 commits, 新建分支)
**Base commit**: `731ff18` (D-20.1-20.5 ship 总集)
**Ship range**: `731ff18..ecb3ee3` (6 颗 commit cluster)
**Goal**: 把 2026-06-06 用户给 review 报告中的 5 个 finding (2P1 + 2P2 + 1P3) 全清，按 review 拍板的 7 颗拆分 (实际 6 颗 ship) 走。
**Source**: [Obsidian review findings 归档](../../../../../home/butterfly443/ObsidianVault/AI研究/deepwhale/2026-06-06-d20-v1-review-findings.md)

## Background

D-20.1-20.5 ship 落地 5 颗 commit (CEE8909 / 9fa8fb9 / 0e842f4 / 73081e5 / 583a599 + 731ff18 = 6 颗实际)，用户 2026-06-06 session 重置后给 review 报告，发现 5 个 bug：

| # | 级别 | Bug |
|---|---|---|
| 1 | P1 | docker-runner.test.ts:101 hardcode `'/tmp/sbx-test'`，Windows 必 fail |
| 2 | P1 | tui-smoke.test.ts:245 placeholder `expect(true).toBe(true)`，红线假绿 |
| 3 | P2 | tui.ts:328 调 `runToolLoop` 漏传 `signal: turnAbortController.signal`，abort 不透传 |
| 4 | P2 | prefix-cache-4-mechanisms.test.ts 名实不符，doc 写"4 it"实际 8 it，全 contract |
| 5 | P3 | README.md:67 + ship plan:5 commit range / test 数字 / 时间全过期 |

## 6 颗 commit cluster (实际 ship, 拍板 7 颗合并 P3 同步为 1 颗)

| # | 拍板 | 文件 | 关键变更 | 验收红线 (Linux executor 跑) |
|---|---|---|---|---|
| **D-20.6.1** | docker-runner source 规范化 (`sandboxRoot = pathResolve`) | `src/sandbox/docker-runner.ts:184` | 构造时 `pathResolve(opts.sandboxRoot)` | (1) 28/2 pass (2) typecheck pass |
| **D-20.6.2** | docker-runner.test 平台原生路径 | `test/sandbox/docker-runner.test.ts:101` | `SANDBOX_ROOT = join(tmpdir(), 'sbx-test')` + 42 处 template literal | (1) 28/2 pass (2) typecheck pass |
| **D-20.6.3** | TUI policy 红线真测 | `test/modes/tui-smoke.test.ts:235` | 删 placeholder + 2 个真测 (n → user_denied + y → user_approved) | (1) 6/6 pass (含原 5 + 2 新 - 1 placeholder) (2) 真触发 confirm + 落 audit |
| **D-20.6.4** | TUI 透传 abort signal | `src/modes/tui.ts:328` | `runToolLoop` 加 `signal: turnAbortController.signal`; 2 真测 | (1) 8/8 pass (含原 5 + 2 真测 + 1 强化 - 1 placeholder) |
| **D-20.6.5** | prefix-cache 名实相符 | `test/integration/prefix-cache-4-mechanisms-contract.test.ts` (git mv) | 改名 + '联动 4' 真调 `compact()` + doc/README 同步标 "contract" | (1) 8/8 pass (2) 真调 `compact()` 走真路径 (3) typecheck pass |
| **D-20.6.6** | README + ship plan 数字同步 | `README.md:67` + `docs/plans/2026-06-05-v1-capability-completion-ship.md` | 真实数 521 / 20 / 13.55s + commit range `583a599..67aa39a` (11 颗) + accept risks 同步 verify-runner 偶发 fail 复现 | (1) typecheck pass (2) 文档内无过期硬编码 |
| **D-20.6.7** | plan 文档归档 | `docs/plans/2026-06-06-d20-v1-review-fix-ship.md` (本文件) | 总集归档 + Obsidian 双链 | (1) plan 存在 (2) Obsidian 双链存在 (3) 飞书 DM 推送通知含 commit hash(es) + diff stat |

> 实际 ship 6 颗 commit (D-20.6.1-6), D-20.6.7 是 plan 文档归档本身, 不算独立 commit. 拍板 7 颗 → 实际 6 颗的合并: D-20.6.3 placeholder 替换 + D-20.6.4 signal 透传 保持 2 颗独立 (P1 + P2 级别), P3 文档同步保持 1 颗.

## 验收红线 (总, 已全部过)

- ✅ 1 plan 文档 (D-20.6.7) + 6 颗 commit cluster ship + 1 docs/README 同步
- ✅ 拍板红线用子编号 (D-20.6.1 / .2 / .3 / .4 / .5 / .6 / .7)
- ✅ 验收红线分点
- ✅ commit 后立即自动 push (沿用 2026-06-04 改的协议)
- ✅ 每次 `git push` 后**必须在当前 channel (飞书 DM) 发推送通知**

## Linux executor 验证清单 (本机跑)

- ✅ `corepack pnpm install --frozen-lockfile` 无 lockfile drift
- ✅ `corepack pnpm typecheck` pass
- ✅ `corepack pnpm test` = `521 passed / 20 skipped` (1 偶发 verify-runner fail, focused 16/16 pass, 已知问题)
- ✅ `corepack pnpm vitest run docker-runner.test.ts` = `28 passed / 2 skipped`
- ✅ `corepack pnpm vitest run tui-smoke.test.ts` = `8 passed`
- ✅ `corepack pnpm vitest run prefix-cache-4-mechanisms-contract.test.ts` = `8 passed`
- ✅ `corepack pnpm vitest run env-gate.test.ts` = `10 passed`

## Windows reviewer gate (不阻塞 ship 提交, 但 merge 主仓前必过)

- [ ] Windows 端 `corepack pnpm install --frozen-lockfile` 成功
- [ ] Windows 端 `corepack pnpm test` = **0 failed** (从 5 failed 修到 0)
- [ ] 截图发飞书 DM，commit hash(es) + "Windows 0 failed" 文字
- [ ] reviewer 在飞书回复 "OK merge" 才能 merge 到 main

## 失败回滚

任意 P1 验收红线不过 → **不** push 那一颗 commit, **不** 进 D-20.6.x+1 → 修到绿再走.
P2 / P3 红线不过 → 当颗 commit 不 push, 进 followup-bug-classes-1c-revive-2-d-4 skill 跨 session 接管 (沿用 D-13.5 review-fix P3 协议).

## commit message 模板 (沿用 D-20.x 风格)

```
<type>(<scope>): <subject> (D-20.6.x)

<why + how, 含 review fix 红线引用>
```

例: `fix(sandbox): docker-runner 规范化 sandboxRoot (Windows 兼容) (D-20.6.1)`

## 来源

- [D-20 v1.0 ship review findings (Obsidian 归档)](../../../../../home/butterfly443/ObsidianVault/AI研究/deepwhale/2026-06-06-d20-v1-review-findings.md)
- 备份: `~/.hermes/backup/deepwhale-d20.6-review-fix/` (3.8M, 731ff18 全量)
- review 转发: 用户飞书 DM (2026-06-06 session reset 后第一条)
- 分支拍板: 用户 2026-06-06 拍板 B (新建 `feature/d20.6-v1-review-fix` 隔离跨 sprint)
