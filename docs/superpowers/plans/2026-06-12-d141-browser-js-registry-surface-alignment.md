# D141 Browser JS Registry Surface Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the committed D137 Browser JS default registry surface with lockfile, registry tests, and lint/type hygiene without changing Gate evidence semantics.

**Architecture:** Treat current `feature/d36-gate2-live` as the authoritative branch. D125 Gate-1.5 binding is already recorded at 20/20, D129/D130 v5/v6 seed work is already committed, and D137 intentionally registered `browser_js` in the coding/default tool surface. This slice is a stabilization follow-up: update expected counts and capability assertions, remove unused imports, clean corrupted test comments, and leave unrelated Gate-1 current-workspace evidence changes out of the commit unless a separate Gate plan requires them.

**Tech Stack:** TypeScript, Vitest, pnpm workspace, ESLint, pnpm lockfile v10.

---

## Current Audit

- v1.0: mostly implemented and previously release-gated, but the public ship ritual is still user-gated.
- v1.5: Code Intel foundation exists; preferred 100K Gate-1 target is available through the React target at 753,902 LOC.
- v2.0: Gate-1.5 live Browser evidence is now binding at 20/20; Browser enhancement is unlocked, but production Browser defaults still require explicit policy/status alignment.
- v2.5: planner/DAG/cache foundation has enough evidence to unlock v5 seed work, but long-horizon production execution remains future work.
- v3.0: reviewer and Gate-2 fixtures exist; production-grade long-horizon evidence is still incomplete.
- v4.0: Agent OS memory/taskgraph/channel foundations exist; real cross-platform crash and orchestration evidence remains incomplete.
- v5.0: observability, governance, distribution, and hardening seed/cross-bridge work exists through D129; this is not production-complete.
- v6.0: multi-agent, hosted/enterprise, and distributed coordination seeds exist through D130; enterprise/runtime integration remains future work.

## Missing Work After This Slice

- D126+: v2.0 Tier-1 Browser Agent foundation and default-enable policy need a fresh plan now that Gate-1.5 binding is true.
- Gate-2 production proof still needs a real long-horizon run beyond fixtures.
- v4 Agent OS needs cross-platform crash/reload and orchestration proof beyond deterministic unit-style evidence.
- v5 needs runtime integration of audit/policy/distribution/hardening surfaces.
- v6 needs enterprise, distributed, and multi-agent features wired into real execution paths.

## Task 1: Align Browser JS Registry Test Expectations

**Files:**
- Modify: `packages/coding-agent/test/integration/repl-slash-tools-vision-tts.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-capability-filter.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-d30-2.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-all.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-cross-file.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-engineering.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-find-references.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-media.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-policy.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-productivity.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-research.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profiles.test.ts`

- [ ] **Step 1: Confirm RED from stale expected counts**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/integration/repl-slash-tools-vision-tts.test.ts packages/coding-agent/test/unit/registry-capability-filter.test.ts packages/coding-agent/test/unit/registry-d30-2.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts packages/coding-agent/test/unit/registry-profile-cross-file.test.ts packages/coding-agent/test/unit/registry-profile-engineering.test.ts packages/coding-agent/test/unit/registry-profile-find-references.test.ts packages/coding-agent/test/unit/registry-profile-media.test.ts packages/coding-agent/test/unit/registry-profile-policy.test.ts packages/coding-agent/test/unit/registry-profile-productivity.test.ts packages/coding-agent/test/unit/registry-profile-research.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts --reporter=verbose
```

Expected before the alignment changes: at least one stale count or missing `browser_js` assertion fails.

- [ ] **Step 2: Update exact expectations**

Set default registry expectations to `21`, all-profile expectations to `43`, add `browser_js` wherever default tool names are explicitly enumerated, and set code-execute capability output to `['execute_code', 'browser_js']`.

- [ ] **Step 3: Clean corrupted test text**

Replace mojibake or replacement-character text in the modified test comments and `describe()` names with ASCII descriptions. After editing, run:

```powershell
rg -n "�|锟|ï¿½" packages/coding-agent/test/integration/repl-slash-tools-vision-tts.test.ts packages/coding-agent/test/unit/registry-d30-2.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts packages/coding-agent/test/unit/registry-profile-cross-file.test.ts packages/coding-agent/test/unit/registry-profile-find-references.test.ts
```

Expected: no matches.

- [ ] **Step 4: Verify focused registry tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/integration/repl-slash-tools-vision-tts.test.ts packages/coding-agent/test/unit/registry-capability-filter.test.ts packages/coding-agent/test/unit/registry-d30-2.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts packages/coding-agent/test/unit/registry-profile-cross-file.test.ts packages/coding-agent/test/unit/registry-profile-engineering.test.ts packages/coding-agent/test/unit/registry-profile-find-references.test.ts packages/coding-agent/test/unit/registry-profile-media.test.ts packages/coding-agent/test/unit/registry-profile-policy.test.ts packages/coding-agent/test/unit/registry-profile-productivity.test.ts packages/coding-agent/test/unit/registry-profile-research.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts --reporter=verbose
```

Expected: all listed files pass.

## Task 2: Align Dependency Lockfile And Lint Hygiene

**Files:**
- Modify: `pnpm-lock.yaml`
- Modify: `packages/coding-agent/src/repl/repl-agent-turn.ts`
- Modify: `packages/coding-agent/src/taskgraph/task-orchestrator.ts`

- [ ] **Step 1: Verify lockfile matches Browser JS dependency**

Run:

```powershell
pnpm.cmd install --frozen-lockfile --ignore-scripts
```

Expected: exits 0, proving `puppeteer-core@25.1.0` is in the lockfile for `packages/coding-agent/package.json`.

- [ ] **Step 2: Remove unused imports**

Remove unused `RunCommandWithReviewOptions` from `packages/coding-agent/src/repl/repl-agent-turn.ts` and unused `PlannedTask` from `packages/coding-agent/src/taskgraph/task-orchestrator.ts`.

- [ ] **Step 3: Verify type and lint hygiene**

Run:

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
```

Expected: both exit 0.

## Task 3: Subagent Review And Final Verification

**Files:**
- Review all files staged for this slice.
- Do not stage `docs/superpowers/gate-1-current-workspace-result.json`.
- Do not stage `docs/superpowers/gate-1-current-workspace-result.md`.

- [ ] **Step 1: Ask opencode to implement/review this exact slice**

Run the local-subagents wrapper with `-Backend opencode`, this plan, and the current diff. The subagent may modify only the files listed in Tasks 1 and 2 plus this plan file. Codex must inspect the resulting diff.

- [ ] **Step 2: Ask Hermes to test/review**

Run the local-subagents wrapper with `-Backend hermes`. Ask it to inspect the final diff and the focused verification commands. Hermes must not modify files.

- [ ] **Step 3: Codex final verification**

Run:

```powershell
pnpm.cmd install --frozen-lockfile --ignore-scripts
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit and push intended files only**

Stage:

```powershell
git add docs/superpowers/plans/2026-06-12-d141-browser-js-registry-surface-alignment.md packages/coding-agent/src/repl/repl-agent-turn.ts packages/coding-agent/src/taskgraph/task-orchestrator.ts packages/coding-agent/test/integration/repl-slash-tools-vision-tts.test.ts packages/coding-agent/test/unit/registry-capability-filter.test.ts packages/coding-agent/test/unit/registry-d30-2.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts packages/coding-agent/test/unit/registry-profile-cross-file.test.ts packages/coding-agent/test/unit/registry-profile-engineering.test.ts packages/coding-agent/test/unit/registry-profile-find-references.test.ts packages/coding-agent/test/unit/registry-profile-media.test.ts packages/coding-agent/test/unit/registry-profile-policy.test.ts packages/coding-agent/test/unit/registry-profile-productivity.test.ts packages/coding-agent/test/unit/registry-profile-research.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts pnpm-lock.yaml
git commit -m "fix(D-141): align Browser JS registry surface"
git push origin feature/d36-gate2-live
```

Expected: branch pushes successfully. The two Gate-1 current-workspace result files remain unstaged for a separate evidence decision.

## Self-Review

- Spec coverage: the plan audits current v1-v6 status, isolates this stabilization slice, preserves Gate evidence semantics, and defines opencode/Hermes/Codex verification order.
- Placeholder scan: no placeholders or deferred implementation instructions remain.
- Type consistency: expected registry counts align with D137's committed `browser_js` registration path.
