# D41 V1-V4 Progress And Next 48h Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this stabilization slice. Use superpowers:verification-before-completion before any completion claim.

**Goal:** Stabilize the current D40 Gate-2 live evidence, make the v1-v4 progress state honest, and define the next 48-hour implementation goal without unlocking non-coding scope by accident.

**Architecture:** Treat the roadmap as gate-driven. D40 proves the live long-horizon runner can produce a strict Gate-2 pass on the invoice fixture; it does not make v1-v4 production-complete. The next sprint must keep the default capability surface frozen while closing release hygiene, Gate-0 verification, Gate-1 Code Intel realism, and documentation drift.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, ESLint, Superpowers, Gate-1/Gate-2 JSON+Markdown evidence, `@deepwhale/code-intel`, `@deepwhale/coding-agent`.

---

## Current Audit

- Branch: `feature/d36-gate2-live`.
- Head: `43a07bb feat(D-40): 5-file invoice fixture + drift detector hardening + LIVE PASSED (49 calls, all 6 conditions)`.
- Worktree before D41: tracked clean, with untracked `docs/plans/*` and `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md` preserved.
- D40 strict Gate-2 live evidence checks out:
  - `source=live-llm`
  - `passed_live=true`
  - `passed_mock=false`
  - `toolCalls=49`
  - `reviewStatus=approve`
  - `finalResult=pass`
  - `liveError` absent
  - `goalDriftDetected=false`
  - trace summary: 91 steps, 42 assistant, 49 tool, 0 error, 0 limit
  - review command: `node --test test/invoice.test.ts:0`
- D41 fixed evidence hygiene:
  - `writeReport()` now redacts materialized temp workspace paths in persisted JSON/MD reports.
  - `docs/superpowers/gate-2-long-horizon-live.{json,md}` use `<materialized-gate2-fixture-workspace>`.
  - `README.md` now says 49 tool calls and root fixture path `fixtures/gate2-live/fixture`.

## Progress Numbers

These are implementation-readiness estimates, not marketing release labels.

| Scope | Current | Evidence | Main gap |
| --- | ---: | --- | --- |
| Gate-0 stabilization | 80% | default registry frozen, focused Gate-2 tests pass | full `pnpm test` still has verify-runner D-11 failure |
| v1.0 coding core | 85% | CLI/TUI/tools/session/policy/sandbox exist | release docs/version story and verify-runner stability |
| v1.5 Code Intel foundation | 70% | import/reference graph, heuristic call graph, conservative rename tests | real 50K+/100K Gate-1 needs fresh proof and accuracy gaps remain |
| v2.0 Observe/Browser foundation | 45% | browser observation/planner/runtime MVP and Gate-1.5 harness exist | real 20-task browser decision gate not run |
| v2.5 Planning | 40% | TaskDag, planner boundary, plan cache exist | planner is still simple decomposition, weak integration |
| v3.0 Execute/Review | 45% | reviewer, compaction hook, Computer compat, Gate-2 runner exist | full `pnpm test` red and Gate-2 fixture is artificial |
| v4.0 Agent OS | 30% | researcher, taskgraph, persistent memory, channel opt-in stubs exist | multi-role orchestration, desktop, marketplace, real persistence maturity missing |
| v1-v4 aggregate | 55% | many modules and tests exist | much is MVP/heuristic; gates and docs are ahead of product maturity |

## Non-Negotiables

- Do not add media, productivity, channel, Browser, Desktop, or marketplace tools to the default registry.
- Do not claim v1-v4 complete until `pnpm typecheck`, `pnpm lint`, `pnpm test`, Gate-1, Gate-1.5, and Gate-2 evidence are all fresh and documented.
- Do not stage unrelated untracked `docs/plans/*` files unless the user explicitly adopts them.
- Keep Code Intel tool descriptions honest: use "heuristic" where type analysis is absent.
- Prefer fixing red tests and gate evidence before feature expansion.

## Next 48h Goal Prompt

```text
用 Superpowers 在 D:\App\openClaw\projects\deepwhale 继续执行 v1-v4 stabilization + gate sprint。不要看 D:\App\openClaw\projects\openclaw-github。当前分支 feature/d36-gate2-live，先只读审查 git status，保护所有未跟踪 docs/plans/*。目标是在 48 小时内把 v1-v4 从“有大量 MVP/证据”推进到“可诚实发布的 gate-ready 状态”，但严禁解锁新增非 coding 工具。

优先级：
1. 先修 Gate-0：跑并拉绿 pnpm typecheck、pnpm lint、pnpm test。已知 pnpm test 可能有 verify-runner D-11 pre-existing failure，必须系统调试、写失败测试、修根因，不能只改断言或跳过测试。
2. 审查并修正文档/状态卫生：README、ROADMAP.md、docs/ROADMAP_DECISIONS.md、package versions、registry count 测试名、Gate 报告，禁止 overclaim。D40 Gate-2 live passed=true 是真实证据，但只说明 live runner/fixture 通过，不代表 v1-v4 全部完成。
3. 复核 registry profiles：default 只能暴露 coding + code-intel essentials；core、coding、code-intel、productivity、media、all 必须清晰可测，Browser/Desktop/Channel/media/productivity 必须显式 opt-in。
4. 深化 Code Intel 真实性：优先补 Gate-1 50K+，最好 100K LOC 真实仓库证据，测“定位入口 → 调用链 → 修改点 → 方案”20 分钟内完成；补 import/reference graph 和 call graph/rename_symbol 的精度测试，工具描述保持 heuristic。
5. Gate-1 通过前不要推进 Browser/Computer/Desktop/Channels；Gate-1.5 只允许补真实 20-task evidence harness，不把 Browser 加到默认 profile。
6. Gate-2 只维护 D40 live evidence 和 runner 可靠性；不要把单一 invoice fixture 夸成生产级 long-horizon 完成。
7. 每个实现切片必须：写计划 -> TDD 红绿 -> targeted tests -> typecheck/lint/test -> git diff --check -> 窄范围 git add -> commit -> push。

请输出并维护一个状态表：v1.0、v1.5、v2.0、v2.5、v3.0、v4.0 分别完成百分比、证据、阻塞项、下一步文件清单。最后提交并推送当前分支，只 stage 本轮修改。
```

## Immediate Task List

- [x] Add a failing regression test for redacting materialized Gate-2 workspace paths from persisted reports.
- [x] Implement report persistence redaction in `packages/coding-agent/scripts/gate2-runner-core.ts`.
- [x] Update D40 Gate-2 JSON/MD evidence to use `<materialized-gate2-fixture-workspace>`.
- [x] Fix `README.md` D40 call count and fixture path drift.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint`.
- [x] Run `pnpm test`.
- [x] Confirm the earlier verify-runner D-11 failure is not reproduced on D41 fresh full test run.
