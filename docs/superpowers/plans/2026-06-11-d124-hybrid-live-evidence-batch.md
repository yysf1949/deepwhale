# D124 Hybrid Live Evidence Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the next Gate-1.5 hybrid live Browser evidence batch through `recordHybridRealBrowserEvidence` using D123 `updatedLedger` accumulation, advancing repository evidence from 9/20 to 13/20 while keeping Browser defaults locked.

**Architecture:** Keep the existing opt-in hybrid runner API. Add one regression test that chains two hybrid calls through `updatedLedger`, then refresh the machine-readable Gate-1.5 ledger and public status docs to record 4 additional D124 successes. Do not change default registry exposure, Browser binding, or branch decision because 13/20 remains below the 20-task live-evidence threshold.

**Tech Stack:** TypeScript, Vitest, Node built-in fetch evidence, injected JS runner evidence, Markdown/JSON status files, pnpm workspace.

---

### Task 1: RED Test For D124 Updated-Ledger Accumulation

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`

- [ ] **Step 1: Add a failing chaining test**

Add a test that starts with 9 successful tasks, runs one hybrid batch for `task-10` / `task-11`, then passes `firstEvidence.updatedLedger` into a second hybrid batch for `task-12` / `task-13`.

Expected assertions:

```ts
expect(firstEvidence.runs.map((run) => run.taskId)).toEqual(['task-10', 'task-11']);
expect(firstEvidence.totalCompletedBefore).toBe(9);
expect(firstEvidence.totalCompletedAfter).toBe(11);
expect(firstEvidence.updatedLedger.completedTasks).toBe(11);

expect(secondEvidence.runs.map((run) => run.taskId)).toEqual(['task-12', 'task-13']);
expect(secondEvidence.totalCompletedBefore).toBe(11);
expect(secondEvidence.totalCompletedAfter).toBe(13);
expect(secondEvidence.totalPendingAfter).toBe(7);
expect(secondEvidence.updatedLedger.completedTasks).toBe(13);
expect(secondEvidence.updatedLedger.pendingTasks).toBe(7);
expect(secondEvidence.updatedLedger.successRate).toBe(1);
expect(secondEvidence.binding).toBe(false);
expect(secondEvidence.branchDecision).toBe('defer-live-evidence');
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: FAIL before the expected D124 test content exists or before accumulation expectations are implemented.

### Task 2: GREEN Hybrid Accumulation

**Files:**
- Modify only if needed: `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`

- [ ] **Step 1: Run the focused test after adding the test**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: PASS if D123 `updatedLedger` behavior already supports chained D124 accumulation. If it fails, make the smallest change in `recordHybridRealBrowserEvidence` so the second call uses the first call's recomputed ledger state.

### Task 3: Record D124 Live Evidence And Refresh Status Hygiene

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.md`
- Modify: `docs/superpowers/gate-1.5-browser-viability.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `docs/superpowers/release-version-hygiene.json`

- [ ] **Step 1: Update status expectations first**

Update `status-doc-hygiene.test.ts` to expect:
- Current sprint: `D124 Gate-1.5 hybrid live evidence batch (updatedLedger accumulation)`
- Gate-1.5 live result recorder: `13/20 completed`
- Ledger counters: pending `7`, completed `13`, successes `13`, failures `0`, successRate `1`
- Success task IDs add `cart-update-quantity`, `checkout-address-validation`, `table-filter`, and `table-pagination`
- Next implementation slice: `D125 Gate-1.5 hybrid live evidence continuation`
- Scorecard first next action starts with `D125:`

- [ ] **Step 2: Run status hygiene to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: FAIL until docs and evidence JSON are updated.

- [ ] **Step 3: Refresh D124 machine-readable evidence**

Update `docs/superpowers/gate-1.5-live-browser-tasks.json`:
- `slice`: `D124`
- `pendingTasks`: `7`
- `completedTasks`: `13`
- `successes`: `13`
- `successRate`: `1`
- keep `binding: false`, `branchDecision: defer-live-evidence`, `browserEnhancementUnlocked: false`
- mark `cart-update-quantity`, `checkout-address-validation`, `table-filter`, and `table-pagination` as `success`
- tag them with `evidenceSubSprint: D-124`
- use `evidenceKind: real-fetch` for the two HTTP rows and `evidenceKind: real-js` for the two JS rows
- update `reason`, `constraints`, and `nextAction` to D125.

- [ ] **Step 4: Refresh public docs**

Mirror the D124 status in README, ROADMAP, ROADMAP_DECISIONS, Gate-1.5 Markdown, v1-v4 scorecard JSON/Markdown, release-version hygiene JSON, and Gate-1.5 viability JSON. Keep the honest caveat: 13/20 is partial evidence, not a binding Browser branch decision.

- [ ] **Step 5: Run status hygiene to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Full Verification, Commit, Push

**Files:**
- All modified files above plus this plan.

- [ ] **Step 1: Run focused verification**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
git diff --check
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1.5-browser-viability.json docs/superpowers/gate-1.5-live-browser-tasks.json docs/superpowers/gate-1.5-live-browser-tasks.md docs/superpowers/release-version-hygiene.json docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-11-d124-hybrid-live-evidence-batch.md packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts
git commit -m "feat(D-124): accumulate hybrid live Browser evidence"
```

- [ ] **Step 3: Push**

Run: `git push origin feature/d36-gate2-live`

Expected: remote branch advances with the D124 commit.

### Self-Review

- Spec coverage: D124 advances the Gate-1.5 live-evidence blocker from 9/20 to 13/20 and keeps the binding branch deferred.
- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: D124 does not claim 20/20, does not unlock Browser defaults, and does not claim v1-v4 completion.
