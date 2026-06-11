# D121 Gate-1.5 Hybrid Evidence Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the D120 hybrid evidence runner so it can record non-contiguous mapped pending tasks, then align the public and machine-readable Gate-1.5 evidence chain to the D120 9/20 state without unlocking Browser defaults.

**Architecture:** Keep the Browser roadmap gate evidence-driven. The code change stays inside `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`; status changes update the ledger, scorecard, and current-status blocks that `status-doc-hygiene.test.ts` guards.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON evidence files, pnpm workspace.

---

### Task 1: Add Regression Test For Non-Contiguous Hybrid Task Maps

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`

- [ ] **Step 1: Add failing test**

Add a test where the first six ledger rows are already complete, D120 maps `task-7`, `task-8`, and `task-17`, and the runner must skip unmapped pending rows instead of aborting at `task-9`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: FAIL because the current runner stops with `no-task-mode-mapping` after processing `task-7` and `task-8`.

### Task 2: Fix Hybrid Runner Selection

**Files:**
- Modify: `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`

- [ ] **Step 1: Select only pending tasks that have an explicit mode mapping**

Change the loop to find the next pending task whose id exists in `taskModes`. Missing mappings are skipped, not fatal. Keep the existing skip behavior for an entirely empty `taskModes` map.

- [ ] **Step 2: Run focused tests**

Run: `pnpm vitest run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: PASS.

### Task 3: Align D120 Gate Evidence

**Files:**
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.md`
- Modify: `docs/superpowers/gate-1.5-browser-viability.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `docs/superpowers/release-version-hygiene.json`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Update status-doc-hygiene expectations first**

Change expected Gate-1.5 counts from `6/20` to `9/20`, current sprint from D119 to D120, and next slice from D120 to D121.

- [ ] **Step 2: Verify status test fails before docs are updated**

Run: `pnpm vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: FAIL because the docs still say D119 / 6/20.

- [ ] **Step 3: Update JSON and Markdown evidence**

Set completed/successes to `9`, pending to `11`, successRate to `0.45`, mark `product-sort`, `cart-add-item`, and `keyboard-search-shortcut` as D120 successes, and keep `binding=false`.

- [ ] **Step 4: Run status hygiene**

Run: `pnpm vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Verification, Commit, Push

**Files:**
- All modified files above.

- [ ] **Step 1: Run focused verification**

Run:
- `pnpm vitest run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

- [ ] **Step 2: Commit**

Run:
- `git add <modified files>`
- `git commit -m "fix(D-121): align Gate-1.5 hybrid evidence state"`

- [ ] **Step 3: Push**

Run: `git push origin feature/d36-gate2-live`

Expected: branch updated on `origin`.
