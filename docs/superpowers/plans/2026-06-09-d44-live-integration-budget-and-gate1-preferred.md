# D44 Live Integration Budget And Gate1 Preferred Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce live integration flakiness without weakening assertions, then prepare the next Gate-1 preferred 100K evidence slice.

**Architecture:** The D43 verification exposed a non-deterministic live LLM convergence failure in `compaction-cross-protocol-2d5.test.ts`: one full-suite run hit `ToolLoopLimitError(maxSteps=5)`, while the single-file rerun and final full-suite rerun passed. This is not a D43 regression, but the test budget is too tight for live LLM behavior now that the default registry exposes coding plus Code Intel essentials. D44 keeps the test's semantic assertions intact and raises only the loop budget to match existing live mode-layer tests that already use `maxSteps: 10`.

**Tech Stack:** TypeScript, Vitest, live DeepSeek integration tests, `@deepwhale/coding-agent` tool loop, Gate-1 evidence docs, Superpowers TDD/debugging workflow.

---

## Files

- Modify: `packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts`
  - Raise the live compaction test loop budget from `maxSteps: 5` to `maxSteps: 10`.
  - Add an inline comment explaining that the budget counts LLM iterations, while assertions still require real tool execution, a stop turn, session persistence, and cost invariants.
- Modify: `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md`
  - Note D44's live-test budget hygiene as a Gate-0 reliability improvement.
  - Keep v1-v4 aggregate honest; do not raise percentages unless evidence changes materially.
- Create/modify later in a separate D45 slice:
  - 100K+ Gate-1 scenario evidence files after a qualifying target is available.

## Task 1: Confirm The Flake Boundary

- [x] Read the failing full-suite output from D43 verification:
  - Sandbox full Vitest failed with `connect EACCES` for live integration tests.
  - Escalated full Vitest then had one non-network failure: `compaction-cross-protocol-2d5.test.ts` hit `ToolLoopLimitError(maxSteps=5)`.
  - Single-file rerun passed.
  - Final full-suite rerun passed.
- [x] Inspect `packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts`.
- [x] Inspect `packages/coding-agent/src/agent/tool-loop.ts`.
- [x] Form root-cause hypothesis:
  - `maxSteps` counts LLM iterations, not total step rows.
  - Live LLM sometimes makes extra tool calls before stopping.
  - The test's real contract is not "exactly 5 iterations"; it is "run the compaction path, persist session events, execute at least one real tool successfully, observe at least one stop turn, and preserve usage/cost invariants."

## Task 2: Adjust Test Budget Without Weakening Assertions

- [x] Change this call:

```ts
const result = await runToolLoopWithCompaction(
  client,
  baseMessages,
  { registry, maxSteps: 5 },
  compactionConfig,
  summaryFn,
);
```

to:

```ts
const result = await runToolLoopWithCompaction(
  client,
  baseMessages,
  {
    registry,
    // Live LLMs may make a few extra tool calls before converging. Keep the
    // behavioral assertions below strict; this budget only prevents false
    // negatives from iteration-count variance.
    maxSteps: 10,
  },
  compactionConfig,
  summaryFn,
);
```

- [x] Do not change assertions that prove:
  - session file exists and reloads,
  - at least four user events persist,
  - compaction event arrays are valid,
  - at least one real tool call succeeds,
  - at least one assistant turn stops,
  - DeepSeek cached-token cost fields remain present when `cached_tokens > 0`.

## Task 3: Verification

- [x] Run targeted live integration:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts
```

Expected: exit `0`; likely `1 passed, 1 skipped` when only DeepSeek credentials are available.

- [x] Run broader verification:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts packages/coding-agent/test/integration/runToolLoop-2turn.test.ts packages/coding-agent/test/integration/error-recovery-2d2.test.ts
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
```

Expected: all exit `0`.

- [x] If live integration tests are blocked by sandbox `EACCES`, rerun the same command with approved escalation and record both facts.

Execution notes:

- The first targeted live integration run in the sandbox failed with `LLMNetworkError: Network error: fetch failed` caused by `connect EACCES ...:443`.
- The same targeted command rerun with approved escalation passed: 1 test passed, 1 skipped.
- Broader live integration group rerun with approved escalation passed: 3 files passed, 5 tests passed, 1 skipped.
- `.\node_modules\.bin\tsc.cmd -b` exited 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0` exited 0.
- `git diff --check` exited 0.
- `pnpm test` was blocked by PowerShell execution policy for `pnpm.ps1`; `pnpm.cmd test` in the sandbox then failed with network `fetch failed`. The same `pnpm.cmd test` rerun with approved escalation passed: 192 test files passed, 1 skipped; 1140 tests passed, 4 skipped.

## Task 4: Gate-1 Preferred Preparation

- [x] Do not claim preferred Gate-1 maturity in this D44 slice.
- [x] Add a short note to the D41 status plan that the next implementation slice remains D45 Gate-1 preferred 100K evidence.
- [ ] D45 should choose a real 100K+ LOC target, run Gate-1 with JSON/MD evidence, and update status only after the command exits with authoritative evidence.

## Task 5: Commit And Push

- [ ] Inspect:

```powershell
git status --short --branch
git diff --stat
```

- [ ] Stage only D44 files:

```powershell
git add packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md docs/superpowers/plans/2026-06-09-d44-live-integration-budget-and-gate1-preferred.md
```

- [ ] Commit:

```powershell
git commit -m "test(D-44): stabilize live compaction loop budget"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- This slice does not change production behavior.
- This slice does not add or expose Browser, Desktop, Channel, media, productivity, or marketplace tools.
- This slice does not weaken live integration assertions; it only changes the iteration budget to tolerate model convergence variance.
- This slice does not claim 100K Gate-1 preferred maturity.
