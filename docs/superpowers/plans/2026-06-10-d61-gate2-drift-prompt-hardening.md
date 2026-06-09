# D61 Gate-2 Drift Prompt Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Gate-2 live evidence against nested outside-workspace path drift and remove prompt instructions that conflict with fixture goals.

**Architecture:** Keep Gate-2 hard pass thresholds unchanged. Add focused tests around `detectGoalDrift()` and `buildTaskMessages()`, then make outside-workspace path scanning recursive and adjust the system prompt so the agent may run tests required by the task while the reviewer still performs final automatic verification.

**Tech Stack:** TypeScript, Vitest, existing Gate-2 runner scripts.

---

## Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*.md` and the untracked master execution plan.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or deploy tools.
- Do not weaken Gate-1 or Gate-2 thresholds.
- Keep live Gate reports separate from mock reports.
- Use TDD: write failing tests before production code.
- Do not use `git add .`.

## Files

- Modify: `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`
- Modify: `packages/coding-agent/scripts/gate2-runner-live.ts`
- Create: `docs/superpowers/plans/2026-06-10-d61-gate2-drift-prompt-hardening.md`

## Task 1: RED Drift Test

- [x] Add a failing test proving nested tool args with an external absolute path trigger drift even when top-level args look in-scope.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts
```

Expected before implementation: the nested outside-workspace drift test fails because `argsReferenceOutsideWorkspace()` only scans top-level object string values and arrays of direct strings.

Observed RED before implementation: targeted Gate-2 runner suite failed with `expected false to be true` for the nested outside-workspace drift test.

## Task 2: RED Prompt Test

- [x] Export `buildTaskMessages()` for unit testing.
- [x] Add a failing test proving the Gate-2 system prompt:
  - contains the review gate command;
  - tells the agent final verification is automatic;
  - does not say “you do not need to run it yourself”;
  - does not say “Do not re-run the test after it passes”.
- [x] Run the same targeted test command.

Expected before implementation: import fails until `buildTaskMessages()` is exported, then the prompt assertion fails on the old contradictory wording.

Observed RED before implementation: targeted suite failed with `buildTaskMessages is not a function or its return value is not iterable`, proving the helper was not exported yet.

## Task 3: Implement Gate-2 Hardening

- [x] Make `argsReferenceOutsideWorkspace()` recurse into nested arrays and nested object values.
- [x] Keep URL handling unchanged: `https://...` must not count as a POSIX absolute path.
- [x] Update `buildTaskMessages()` wording so task-directed test runs are allowed, while final review gate remains automatic when the agent stops.
- [x] Do not change `TOOL_CALLS_MIN`, `TOOL_CALLS_MAX`, `evaluatePassedLive()`, `registryProfile`, or the fixture evidence files.

## Task 4: Verification

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
```

If full `pnpm.cmd test` fails in sandbox with fetch/EACCES/network, rerun the exact command with escalation and record both outcomes.

Observed:

- `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts`: exit 0; 47 tests passed.
- `.\node_modules\.bin\tsc.cmd -b`: exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: exit 0.
- `git diff --check`: exit 0.
- `pnpm.cmd test -- --reporter=verbose`: sandbox exit 1 with `[ERROR] fetch failed`.
- Escalated exact rerun `pnpm.cmd test -- --reporter=verbose`: exit 0; 196 test files passed, 1 skipped; 1181 tests passed, 4 skipped.

## Task 5: Commit And Push

- [ ] Stage only D61 files:

```powershell
git add packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/scripts/gate2-runner-live.ts docs/superpowers/plans/2026-06-10-d61-gate2-drift-prompt-hardening.md
```

- [ ] Commit:

```powershell
git commit -m "fix(D-61): harden gate2 drift prompt"
```

- [ ] Push `feature/d36-gate2-live`.
