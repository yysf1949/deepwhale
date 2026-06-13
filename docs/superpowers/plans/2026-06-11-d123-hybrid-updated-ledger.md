# D123 Hybrid Updated Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `recordHybridRealBrowserEvidence` return a recomputed `updatedLedger` so hybrid Browser evidence accumulation can carry Gate-1.5 threshold state forward.

**Architecture:** Keep the opt-in hybrid runner boundary and existing HTTP/JS task mapping behavior. Replace the local partial ledger counter update with `buildLiveBrowserTaskLedger`, matching the result-recorder path so `binding`, `branchDecision`, `browserEnhancementUnlocked`, and ledger status are recalculated from the updated task rows. Public status docs advance to D123 while repository evidence remains 9/20.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON evidence files, pnpm workspace.

---

### Task 1: Add Failing Hybrid Updated Ledger Tests

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`

- [ ] **Step 1: Add a failing test for returned updatedLedger**

Add a test that starts with 18 successful tasks and maps `task-19` plus `task-20` as JS tasks. The injected JS runner returns success for both tasks. Assert:

```ts
expect(evidence.totalCompletedBefore).toBe(18);
expect(evidence.totalCompletedAfter).toBe(20);
expect(evidence.totalPendingAfter).toBe(0);
expect(evidence.binding).toBe(true);
expect(evidence.branchDecision).toBe('continue-browser-enhancement');
expect(evidence.updatedLedger.completedTasks).toBe(20);
expect(evidence.updatedLedger.pendingTasks).toBe(0);
expect(evidence.updatedLedger.successRate).toBe(1);
expect(evidence.updatedLedger.binding).toBe(true);
expect(evidence.updatedLedger.branchDecision).toBe('continue-browser-enhancement');
expect(evidence.updatedLedger.browserEnhancementUnlocked).toBe(true);
expect(evidence.updatedLedger.status).toBe('ready-for-binding-decision');
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: FAIL because `HybridRealBrowserEvidence` does not expose `updatedLedger`, and the current hybrid runner keeps `binding` and `branchDecision` from the old ledger.

### Task 2: Rebuild Hybrid Ledger Through The Existing Ledger Builder

**Files:**
- Modify: `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`

- [ ] **Step 1: Import the ledger builder**

Change the live-task-source import to include:

```ts
buildLiveBrowserTaskLedger,
```

- [ ] **Step 2: Add `updatedLedger` to the evidence output**

Extend `HybridRealBrowserEvidence`:

```ts
updatedLedger: LiveBrowserTaskLedger;
```

Skipped evidence returns the current ledger as `updatedLedger`.

- [ ] **Step 3: Rebuild the ledger after each accepted hybrid run**

Replace the hand-counting `updateLedgerTaskStatus` body with a call to:

```ts
return buildLiveBrowserTaskLedger({
  generatedAt,
  requiredTasks: ledger.requiredTasks,
  tasks: updatedTasks,
});
```

Pass `input.generatedAt` when updating after each run.

- [ ] **Step 4: Return the recomputed ledger**

In the successful evidence object, set:

```ts
binding: currentLedger.binding,
branchDecision: currentLedger.branchDecision,
updatedLedger: currentLedger,
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: PASS.

### Task 3: Advance D123 Status Hygiene Without Evidence Overclaim

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `docs/superpowers/release-version-hygiene.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.md`
- Modify: `docs/superpowers/gate-1.5-browser-viability.json`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Update status expectations first**

Adjust `status-doc-hygiene.test.ts` to expect:
- current sprint `D123 Gate-1.5 hybrid updated ledger accumulation`
- next slice `D124 Gate-1.5 hybrid live evidence batch`
- live evidence count still `9/20`
- binding still `false`
- D123 completed-slice line present

- [ ] **Step 2: Run status hygiene to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: FAIL until docs are updated.

- [ ] **Step 3: Update docs and evidence caveats**

Add D123 as a completed continuation slice. Keep Gate-1.5 ledger counters unchanged at 9 completed / 11 pending / successRate 0.45. Update `nextAction` fields to D124 and state that D123 makes hybrid evidence accumulation carry a recomputed `updatedLedger` without adding completed live results.

- [ ] **Step 4: Run status hygiene to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Full Verification, Commit, Push

**Files:**
- All modified files above plus this plan.

- [ ] **Step 1: Run focused verification**

Run:
- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`
- `pnpm.cmd typecheck`
- `pnpm.cmd lint`
- `pnpm.cmd build`
- `pnpm.cmd test`
- `git diff --check`

- [ ] **Step 2: Commit**

Run:
- `git add <modified files>`
- `git commit -m "fix(D-123): recompute hybrid evidence ledger"`

- [ ] **Step 3: Push**

Run: `git push origin feature/d36-gate2-live`

Expected: remote branch advances with the D123 commit.

### Self-Review

- Spec coverage: D123 directly supports Gate-1.5 evidence accumulation by returning the recomputed ledger needed for subsequent hybrid batches.
- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: this does not claim new live results, 20/20 completion, or v1-v4 completion.
