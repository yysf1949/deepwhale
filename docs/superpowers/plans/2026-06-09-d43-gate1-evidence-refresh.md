# D43 Gate1 Evidence Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gate-1 evidence consistently expose LOC qualification in code, JSON, markdown, docs, and refreshed reports.

**Architecture:** D42 added `locQualification` to runtime Gate-1 results, but committed evidence files still contain stale JSON/Markdown generated before that field existed. D43 adds tests that protect persisted evidence shape and then refreshes current Gate-1 evidence without changing the Gate-1 pass/fail rules. This keeps the project honest: Vite 86K remains a 50K minimum pass, not a 100K preferred maturity pass.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, `@deepwhale/code-intel`, Gate-1 JSON/Markdown reports, Superpowers TDD.

---

## Files

- Modify: `packages/code-intel/src/index.ts`
  - Export `type Gate1LocQualification`.
- Modify: `packages/code-intel/test/unit/gate1.test.ts`
  - Add a serialization regression proving `JSON.stringify(runGate1())` includes `locQualification`.
  - Add markdown regression for `below-minimum` reports.
- Modify: `docs/superpowers/gate-1-vite-result.json`
  - Refresh/add `locQualification: "minimum-50k"`.
- Modify: `docs/superpowers/gate-1-vite-result.md`
  - Keep qualification line.
- Modify: `docs/superpowers/gate-1-current-workspace-result.json`
  - Refresh/add `locQualification: "below-minimum"` using current workspace evidence.
- Modify: `docs/superpowers/gate-1-current-workspace-result.md`
  - Refresh/add `LOC qualification: below-minimum`.
- Modify: `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md`
  - Update v1.5 progress to note D42/D43 evidence qualification.

## Task 1: Gate-1 Evidence Tests

- [x] Add a failing test in `packages/code-intel/test/unit/gate1.test.ts` that serializes a Gate-1 result with `JSON.stringify(result)` and expects `"locQualification":"minimum-50k"` to be present.
- [x] Add a failing test that below-minimum markdown includes `LOC qualification: below-minimum`.
- [x] Run:
  - `pnpm vitest run packages/code-intel/test/unit/gate1.test.ts`
  - Expected before implementation: the JSON test should already pass after D42; the markdown below-minimum test may pass. If both pass, keep them as regression tests and continue.

## Task 2: Public Type Export

- [x] Add `type Gate1LocQualification` to `packages/code-intel/src/index.ts` exports.
- [x] Run:
  - `tsc -b`
  - Expected: pass.

## Task 3: Refresh Evidence Files

- [x] Run current workspace Gate-1 command:
  - `node_modules/.bin/tsx.cmd packages/code-intel/scripts/gate1-current-workspace.mjs`
  - Expected: exit 1 because current workspace is below 50K LOC; reports should still be written.
- [x] Confirm:
  - `docs/superpowers/gate-1-current-workspace-result.json` contains `"locQualification": "below-minimum"`.
  - `docs/superpowers/gate-1-current-workspace-result.md` contains `LOC qualification: below-minimum`.
- [x] Manually update Vite evidence JSON if the local `.gate-targets/vite` checkout is unavailable or unchanged:
  - Add `"locQualification": "minimum-50k"` after `repoPath`.
  - Keep existing metrics and evidence unchanged unless rerunning the Vite gate produces fresh evidence.

## Task 4: Status Hygiene

- [x] Update D41 progress table so v1.5 notes Gate-1 qualification and current workspace below-minimum evidence.
- [x] Do not claim 100K preferred maturity until a 100K+ target is actually run.

## Task 5: Verification, Commit, Push

- [x] Run targeted checks:
  - `node_modules/.bin/vitest.cmd run packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts`
- [x] Run full checks:
  - `node_modules/.bin/tsc.cmd -b`
  - `node_modules/.bin/eslint.cmd . --max-warnings 0`
  - `node_modules/.bin/vitest.cmd run`
  - `pnpm.cmd build`
  - `git diff --check`
- [x] If full Vitest hits sandbox network `EACCES`, rerun the same command with approved escalation and record both facts.
- [ ] Stage only D43 files.
- [ ] Commit:
  - `git commit -m "docs(D-43): refresh gate1 qualification evidence"`
- [ ] Push current branch.

Execution note: the current workspace Gate-1 command exited `1` as expected because current workspace LOC is `47203 < 50000`; it still wrote refreshed JSON/MD evidence with `locQualification: "below-minimum"`.

Verification note: targeted Gate-1 tests passed (`2 files / 10 tests`). `tsc.cmd -b` and `eslint.cmd . --max-warnings 0` passed. Full `vitest.cmd run` first failed in the sandbox with live integration `connect EACCES`; the same full command was rerun with approved escalation. One escalated run exposed a live LLM convergence flake in `compaction-cross-protocol-2d5.test.ts`; a single-file rerun passed, and the final full rerun passed (`192 files / 1140 tests passed, 1 file / 4 tests skipped`). `pnpm.cmd build` passed, and `git diff --check` was clean.

## Self-Review Notes

- This does not change Gate-1 thresholds or pass/fail behavior.
- This does not unlock new tools or profiles.
- This keeps D40 Gate-2 evidence in scope but does not overclaim v1-v4 completion.
