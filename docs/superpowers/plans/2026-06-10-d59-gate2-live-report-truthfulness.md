# D59 Gate-2 Live Report Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gate-2 live runner reports truthful when review fails and prevent `GATE2_REVIEW_CWD` from leaking across runs.

**Architecture:** Add small exported helpers in `gate2-runner-live.ts` so report classification and temporary review cwd state are testable without a live LLM. Keep Gate-2 hard thresholds unchanged and keep the default registry profile unchanged.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing Gate-2 runner scripts.

---

## Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*.md` and the untracked master execution plan.
- Do not weaken Gate-1 or Gate-2 thresholds.
- Do not add or default-enable Browser, Desktop, Channel, media, productivity, marketplace, or deploy tools.
- Use TDD: write failing tests before production code.
- Do not use `git add .`.

## Files

- Modify: `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`
- Modify: `packages/coding-agent/scripts/gate2-runner-live.ts`
- Create: `docs/superpowers/plans/2026-06-10-d59-gate2-live-report-truthfulness.md`

## Task 1: RED Report Classification Tests

- [x] Add tests proving:
  - normal stopped loop + `reviewStatus=approve` => `finalResult=pass`
  - normal stopped loop + `reviewStatus=request_changes` => `finalResult=fail`
  - normal stopped loop + missing/unavailable review => `finalResult=fail`
  - final `limit` step => `finalResult=limit`
  - live error => `finalResult=error`

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts
```

Observed RED before implementation: 3 new tests failed; `determineLiveFinalResult is not a function` and `withGate2ReviewCwd is not a function`.

## Task 2: RED Review CWD Restore Tests

- [x] Add tests proving `withGate2ReviewCwd()` restores the previous `GATE2_REVIEW_CWD` value after success and after thrown errors.
- [x] Run the same targeted test command.

Observed RED before implementation: `withGate2ReviewCwd is not a function`.

## Task 3: Implement Helpers And Wire Runner

- [x] In `packages/coding-agent/scripts/gate2-runner-live.ts`, export:

```ts
export function determineLiveFinalResult(input: {
  readonly liveError?: string;
  readonly steps?: ReadonlyArray<{ readonly kind: string }>;
  readonly reviewStatus?: ReviewStatus | 'unavailable';
}): 'pass' | 'fail' | 'limit' | 'error';
```

- [x] Ensure `pass` requires a non-limit tool loop result and `reviewStatus === 'approve'`.
- [x] Export `withGate2ReviewCwd<T>()`, set the env var during the callback, and restore or delete it in `finally`.
- [x] Wrap the `runToolLoopWithReview()` call with `withGate2ReviewCwd(workspacePath, ...)`.
- [x] Replace the old local `finalResultKind` calculation with `determineLiveFinalResult()`.

Observed GREEN after implementation:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts
```

Result: exit 0; 1 file passed; 45 tests passed.

## Task 4: Verification

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
```

If full `pnpm` test fails in sandbox with fetch/EACCES, rerun the exact command with escalation and record both outcomes.

Observed verification:

- `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts`: exit 0; 45 tests passed.
- `.\node_modules\.bin\tsc.cmd -b`: exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: exit 0.
- `git diff --check`: exit 0.
- `pnpm.cmd test -- --reporter=verbose`: sandbox exit 1 with `[ERROR] fetch failed`.
- First escalated `pnpm.cmd test -- --reporter=verbose`: exit 1 because live `packages/coding-agent/test/integration/runToolLoop-2turn.test.ts` hit `Tool loop exceeded max steps (10)`; 195 files passed, 1 failed, 1 skipped; 1176 tests passed, 1 failed, 4 skipped.
- Escalated narrow rerun `pnpm.cmd test -- packages/coding-agent/test/integration/runToolLoop-2turn.test.ts --reporter=verbose`: exit 0; command selected the suite through the repo's script path and completed with 196 files passed, 1 skipped; 1177 tests passed, 4 skipped. The previously failing live test passed with normal 3-step runs.
- Fresh escalated exact full-suite rerun `pnpm.cmd test -- --reporter=verbose`: exit 0; 196 files passed, 1 skipped; 1177 tests passed, 4 skipped.

## Task 5: Commit And Push

- [ ] Stage only D59 files:

```powershell
git add packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/scripts/gate2-runner-live.ts docs/superpowers/plans/2026-06-10-d59-gate2-live-report-truthfulness.md
```

- [ ] Commit:

```powershell
git commit -m "fix(D-59): make gate2 live reports truthful"
```

- [ ] Push `feature/d36-gate2-live`.
