# D42 Gate1 Qualification Rename Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gate-1 evidence harder to overclaim and make Code Intel tools safer and better tested without expanding the default tool surface.

**Architecture:** Add an explicit Gate-1 LOC qualification to the runner result and markdown so 50K minimum passes are distinct from 100K preferred maturity. Keep Code Intel conservative by refusing ambiguous `rename_symbol` writes unless the caller chooses a declaration by file/line/scope, and strengthen `call_graph` wrapper tests with deterministic edges. Update status docs to reflect fresh evidence instead of stale failures.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, `@deepwhale/code-intel`, `@deepwhale/coding-agent`, Superpowers TDD.

---

## Files

- Modify: `packages/code-intel/src/gate1.ts`
  - Add `Gate1LocQualification` and `locQualification` to `Gate1Result`.
  - Derive `below-minimum`, `minimum-50k`, or `preferred-100k` from `metrics.loc`, `metrics.minLoc`, and `metrics.preferredLoc`.
  - Render the qualification in Gate-1 markdown.
- Modify: `packages/code-intel/src/gate1-shape.ts`
  - Preserve the new qualification in the plan-shape adapter.
- Modify: `packages/code-intel/test/unit/gate1.test.ts`
  - Red tests for below-minimum, minimum, preferred qualification and markdown wording.
- Modify: `packages/code-intel/test/unit/gate1-shape.test.ts`
  - Red test for qualification propagation.
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`
  - Add optional `targetFile`, `targetLine`, and `targetScope`.
  - Refuse ambiguous renames when multiple declarations for `oldName` exist and no selector uniquely identifies one.
  - Restrict default rename to references in the selected declaration file until real semantic binding exists.
- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`
  - Red tests for ambiguous same-name declarations and selected-file rename.
- Modify: `packages/coding-agent/test/unit/call-graph.test.ts`
  - Replace weak `edgeCount >= 0` assertion with a deterministic fixture that must produce a known edge.
- Modify: `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md`
  - Correct stale `pnpm test` red wording and make the next prompt readable and current.
- Modify: `docs/superpowers/gate-1-vite-result.md`
  - State that Vite is a 50K minimum pass and not a 100K preferred pass.

## Task 1: Gate-1 Qualification

- [x] Add failing tests in `packages/code-intel/test/unit/gate1.test.ts`:
  - Below 50K reports `locQualification: 'below-minimum'`.
  - A fixture with `minLoc: 10`, `preferredLoc: 100` reports `minimum-50k`.
  - A fixture with `minLoc: 10`, `preferredLoc: 12` reports `preferred-100k`.
  - Markdown contains `LOC qualification: minimum-50k` for a minimum-only pass.
- [x] Run:
  - `pnpm vitest run packages/code-intel/test/unit/gate1.test.ts`
  - Expected before implementation: fail because `locQualification` is missing.
- [x] Implement the smallest `Gate1LocQualification` change in `packages/code-intel/src/gate1.ts`.
- [x] Run the same test again and confirm it passes.

## Task 2: Gate-1 Shape Propagation

- [x] Add a failing test in `packages/code-intel/test/unit/gate1-shape.test.ts` expecting `locQualification` in `toPlanShape()`.
- [x] Run:
  - `pnpm vitest run packages/code-intel/test/unit/gate1-shape.test.ts`
  - Expected before implementation: fail because the shaped result omits the field.
- [x] Implement propagation in `packages/code-intel/src/gate1-shape.ts`.
- [x] Run the same test again and confirm it passes.

## Task 3: Rename Symbol Ambiguity Guard

- [x] Add failing tests in `packages/coding-agent/test/unit/rename-symbol.test.ts`:
  - Two declarations named `target` in different files and no selector returns `success: false` with `ambiguous-symbol`.
  - Passing `targetFile: 'a.ts'` renames only `a.ts` and leaves `b.ts` unchanged.
- [x] Run:
  - `pnpm vitest run packages/coding-agent/test/unit/rename-symbol.test.ts`
  - Expected before implementation: fail because the tool currently renames both files.
- [x] Implement declaration selection in `packages/coding-agent/src/tools/rename-symbol.ts`.
- [x] Run the same test again and confirm it passes.

## Task 4: Call Graph Wrapper Evidence

- [x] Replace the weak `edgeCount >= 0` wrapper test with a temporary deterministic repo containing `callee()` and `caller()`.
- [x] Run:
  - `pnpm vitest run packages/coding-agent/test/unit/call-graph.test.ts`
  - Expected: pass after test rewrite if wrapper already handles deterministic edges.
- [x] If it fails, fix only the wrapper behavior needed for that deterministic edge.

## Task 5: Documentation Hygiene

- [x] Update `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md` so Gate-0 and v3.0 rows no longer say full `pnpm test` is red after D41 verification.
- [x] Update the prompt block in that file to readable Chinese text.
- [x] Update `docs/superpowers/gate-1-vite-result.md` to state Vite is `minimum-50k`, not preferred `100K`.

## Task 6: Verification, Commit, Push

- [x] Run targeted tests:
  - `pnpm vitest run packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/call-graph.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts`
- [x] Run full checks:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `git diff --check`
- [x] Inspect `git diff --stat` and `git status --short`.
- [ ] Stage only D42 files.
- [ ] Commit:
  - `git commit -m "feat(D-42): gate1 qualification and code-intel safety"`
- [ ] Push current branch.

Verification note: `pnpm.cmd typecheck` timed out in the local PowerShell shim during D42, so the equivalent `tsc -b` / `tsc -b --force` checks were run directly. Full `vitest.cmd run` initially failed in the sandbox with live integration `connect EACCES` network errors; the same command passed after approved escalation. `pnpm.cmd build` passed after approved escalation.

## Self-Review Notes

- This slice does not claim v1-v4 completion.
- This slice does not add Browser, Desktop, Channel, media, productivity, marketplace, or default registry tools.
- If a 100K+ local Gate-1 target is unavailable, keep the Vite 86K report marked as minimum-only evidence.
