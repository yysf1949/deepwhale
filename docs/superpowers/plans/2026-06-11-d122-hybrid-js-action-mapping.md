# D122 Hybrid JS Action Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Gate-1.5 hybrid Browser evidence runner choose a JS action per task, then advance public status pointers to D122 without increasing the 9/20 evidence count or unlocking Browser defaults.

**Architecture:** Keep the existing opt-in hybrid runner boundary. Add an optional `jsActions` map to `recordHybridRealBrowserEvidence`; JS tasks default to `fill-search-input` for backward compatibility, while mapped JS tasks can request `click-element` or `extract-text`. Status hygiene remains evidence-driven: D122 is an infrastructure continuation, not a completed live-task-count increment.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON evidence files, pnpm workspace.

---

### Task 1: Add Failing JS Action Mapping Test

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`

- [ ] **Step 1: Add a failing test for per-task JS action mapping**

Add a test that maps two pending JS tasks to different actions:
- `task-10` -> `click-element`
- `task-11` -> `extract-text`

The injected `jsRunnerFn` must record the action it receives, and the test must assert the run results preserve those two distinct actions.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: FAIL because the current runner always calls `jsRunnerFn(realUrl, 'fill-search-input')`.

### Task 2: Implement Optional JS Action Mapping

**Files:**
- Modify: `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`

- [ ] **Step 1: Add an optional `jsActions` input map**

Extend `RecordHybridRealBrowserEvidenceInput` with:

```ts
jsActions?: Readonly<Record<string, HybridJsAction>>;
```

- [ ] **Step 2: Use the mapped action for JS tasks**

When `mode === 'js'`, choose:

```ts
const jsAction = input.jsActions?.[pendingTask.id] ?? 'fill-search-input';
const jsResult = await jsRunnerFn(realUrl, jsAction);
```

Keep the default behavior unchanged for callers that do not pass `jsActions`.

- [ ] **Step 3: Run focused tests to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: PASS.

### Task 3: Advance D122 Status Hygiene Without Evidence Overclaim

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
- current sprint `D122 Gate-1.5 hybrid JS action mapping`
- next slice `D123 Gate-1.5 hybrid evidence accumulation`
- live evidence count still `9/20`
- binding still `false`
- D121 and D122 completed-slice lines present

- [ ] **Step 2: Run status hygiene to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: FAIL until docs are updated.

- [ ] **Step 3: Update docs and evidence caveats**

Add D121 and D122 as completed continuation slices. Keep Gate-1.5 ledger counters unchanged at 9 completed / 11 pending / successRate 0.45. Update `nextAction` fields to D123 and state that D122 improves JS action specificity but does not add completed live results.

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
- `git commit -m "feat(D-122): map hybrid JS actions per task"`

- [ ] **Step 3: Push**

Run: `git push origin feature/d36-gate2-live`

Expected: remote branch advances with the D122 commit.

### Self-Review

- Spec coverage: D122 directly supports the remaining Gate-1.5 tasks by making JS action evidence more expressive while preserving opt-in/default-lock policy.
- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: this is one small implementation slice; it does not claim 20/20 live evidence or v1-v4 completion.
