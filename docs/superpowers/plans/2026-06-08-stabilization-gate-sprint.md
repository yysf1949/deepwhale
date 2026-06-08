# Stabilization Gate Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze non-coding expansion, narrow the default tool surface, make Code Intelligence behavior honest enough for Gate-1 work, and restore local verification.

**Architecture:** Treat this as a stabilization sprint, not a feature sprint. Default runtime exposes only coding and Code Intelligence tools; productivity/media/research/deploy integrations remain available through explicit profiles. Code Intelligence fixes prioritize real references, root-relative call graph reads, and conservative rename behavior.

**Tech Stack:** TypeScript, Vitest, ESLint, existing `@deepwhale/code-intel`, `@deepwhale/edit-engine`, PowerShell local verification.

---

### Task 1: Restore Verification Baseline

**Files:**
- Modify: `packages/coding-agent/test/unit/verify/verify-runner.test.ts`
- Inspect/possibly modify: `packages/coding-agent/src/verify/verify-runner.ts`
- Modify lint-only imports and fixtures reported by `pnpm lint`

- [x] Reproduce `pnpm test` failures and confirm exact failing assertions.
- [x] Fix the verify-runner status expectation or implementation so test and contract match.
- [x] Investigate `runToolLoop-session-2c3` max-step failure and make the test deterministic or adjust the fixture contract.
- [x] Fix lint errors without widening eslint policy.
- [x] Run targeted tests, then `pnpm typecheck`, `pnpm lint`, and `pnpm test`.

### Task 2: Registry Profiles and Default Narrowing

**Files:**
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Modify: registry count tests under `packages/coding-agent/test/unit/`
- Modify consumers only if profile option threading is needed.

- [x] Add tests for profiles: `core`, `coding`, `code-intel`, `productivity`, `media`, `all`.
- [x] Verify tests fail because `createDefaultRegistry` has no profile option.
- [x] Implement profile-aware registration.
- [x] Make default profile expose coding + Code Intelligence essentials only.
- [x] Keep non-coding tools available only via explicit profile or `all`.
- [x] Update `/tools` expectations if needed.

### Task 3: Code Intelligence Reference Truthfulness

**Files:**
- Modify: `packages/code-intel/src/symbol-graph.ts`
- Modify: `packages/code-intel/test/unit/symbol-graph.test.ts`
- Modify: `packages/coding-agent/src/tools/find-references.ts`
- Modify: `packages/coding-agent/src/tools/smart-search.ts`

- [x] Add failing tests for import references and actual identifier usages.
- [x] Add failing test for `buildCallGraph` on a repo path that is not `process.cwd()`.
- [x] Implement root-aware file reading in the graph.
- [x] Implement conservative textual reference extraction with declaration/import/reference kinds.
- [x] Update tool descriptions to say heuristic where type analysis is absent.

### Task 4: Safer Rename Symbol

**Files:**
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`
- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`

- [x] Add failing tests proving strings/comments are not rewritten by default.
- [x] Add failing tests for dry-run reference-limited edits.
- [x] Implement rename from Code Intel references instead of all-file regex.
- [x] Keep an explicit opt-in for broad textual replacement only if necessary.
- [x] Update risk/description language to reflect heuristic limits.

### Task 5: Version, Docs, and State Hygiene

**Files:**
- Modify: `README.md`
- Modify: package metadata only where version story is inconsistent.
- Modify: registry count test filenames/content if stale.
- Remove local generated state only when confirmed untracked and accidental.

- [x] Update README status to match branch/package reality and stabilization posture.
- [x] Align root/workspace package metadata with the current 2.2.0 line and internal package dependency ranges.
- [x] Move pnpm `onlyBuiltDependencies` into `pnpm-workspace.yaml` so pnpm v10 reads it.
- [x] Include `packages/mcp-servers/*` in the pnpm workspace so `@deepwhale/mcp-gh-search` is part of recursive verification.
- [x] Remove or quarantine `undefined/.deepwhale/tui-history` after confirming it is generated state.
- [x] Clean stale registry-count wording so test names match current profile behavior.
- [x] Keep unrelated untracked plan files intact unless intentionally adopted.

### Task 6: Gate-1 Smoke

**Files:**
- Create or modify a plan/report under `docs/plans/` or `docs/superpowers/`.
- Create: `packages/code-intel/src/gate1.ts`
- Create: `packages/code-intel/scripts/gate1-current-workspace.mjs`
- Create: `packages/code-intel/test/unit/gate1.test.ts`

- [x] Restrict evidence to the current workspace only: `D:\App\openClaw\projects\deepwhale`.
- [x] Run Code Intel smoke against a concrete current-workspace task: registry profile entry point, consumer calls, likely modification point, and implementation plan.
- [x] Add a machine-verifiable Gate-1 runner (`runGate1`) with LOC, timebox, entry, call-chain, and modification-point checks.
- [x] Add `pnpm gate1:current` for the current workspace; it writes JSON/Markdown evidence and exits non-zero when the Gate is not passed.
- [x] Record pass/fail honestly: current workspace is below the formal Gate-1 50K+/100K target, so Gate-1 is **not passed**.

### Task 7: Final Verification

- [x] Run `pnpm typecheck`.
- [x] Run `pnpm lint`.
- [x] Run `pnpm test`.
- [x] Run `git status --short`.
- [x] Summarize remaining risks and exact verification evidence.
