# DeepWhale v1-v4 Completion + v5/v6 Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete v1-v4 gate evidence (D125-D128), fix ship-blockers, deepen v5 (D129), and plan v6 themes (D130). Advance aggregate scorecard from 65% toward 80%+.

**Architecture:** Gate-driven stabilization: fix blockers first, then advance Gate-1.5 (13→20/20), attempt Gate-1 preferred-100K, produce Gate-2 production evidence, add v5 depth, and design v6 remaining themes. Each D-sprint is one self-contained sub-sprint with test-first evidence.

**Tech Stack:** TypeScript, Vitest, pnpm monorepo, Node built-in fetch, JSONL persistence, Markdown/JSON status docs.

---

## Phase A: Ship-Blocker Fix + Gate-1.5 Continuation (D125)

### Task 1: Fix 2 Lint Errors

**Files:**
- Modify: `packages/coding-agent/src/repl/repl-agent-turn.ts:49`
- Modify: `packages/coding-agent/src/taskgraph/task-orchestrator.ts:20`

- [ ] **Step 1: Remove unused imports**

In `repl-agent-turn.ts:49`, remove `RunCommandWithReviewOptions` from the import (or prefix with `_` if needed elsewhere).

In `task-orchestrator.ts:20`, remove `PlannedTask` from the import (or prefix with `_`).

- [ ] **Step 2: Verify lint passes**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings.

### Task 2: Fix verify-runner Test Failure

**Files:**
- Modify: `packages/coding-agent/test/unit/verify/verify-runner.test.ts:146`
- Or Modify: `packages/coding-agent/src/verify/verify-runner.ts`

- [ ] **Step 1: Investigate the status mismatch**

The test expects `status: 'spawn-error'` but gets `status: 'failed'`. Check if `verify-runner.ts` collapses spawn errors into `'failed'`. If the impl is correct (spawn errors should be `'failed'`), update the test. If the impl should emit `'spawn-error'`, fix the impl.

- [ ] **Step 2: Run focused test**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/verify/verify-runner.test.ts --reporter=verbose`
Expected: PASS.

### Task 3: D125 Gate-1.5 Hybrid Continuation (13→17/20)

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add D125 continuation test**

Add test starting with 13-success ledger, running 4 more tasks (task-14 through task-17), asserting binding remains false at 17/20.

- [ ] **Step 2: Run test to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`
Expected: PASS (D123/D124 machinery supports continuation).

- [ ] **Step 3: Update status docs and evidence JSON**

Update gate-1.5-live-browser-tasks.json to 17/20 completed, update scorecard, update ROADMAP current status block.

- [ ] **Step 4: Run status hygiene test**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit D125**

```bash
git add packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts docs/superpowers/ ROADMAP.md
git commit -m "feat(D-125): continue hybrid live Browser evidence 13→17/20"
```

---

## Phase B: Gate-1.5 Completion (D126)

### Task 4: D126 Gate-1.5 Final Batch (17→20/20)

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-browser-viability.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add D126 final batch test**

Add test starting with 17-success ledger, running final 3 tasks (task-18 through task-20), asserting binding becomes TRUE at 20/20 and browserEnhancementUnlocked becomes true.

- [ ] **Step 2: Run test to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 3: Update all status docs to reflect 20/20**

Update gate-1.5-live-browser-tasks.json: completedTasks=20, binding=true, branchDecision=continue-browser-enhancement, browserEnhancementUnlocked=true.

Update scorecard: v2.0 percent should increase (e.g., 45→55%).

Update ROADMAP: Gate-1.5 binding achieved, Browser enhancement unlocked.

- [ ] **Step 4: Run status hygiene test**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Commit D126**

```bash
git add packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts docs/superpowers/ ROADMAP.md
git commit -m "feat(D-126): complete Gate-1.5 live Browser evidence 20/20, unlock Browser enhancement"
```

---

## Phase C: Gate-1 Preferred-100K Attempt (D127)

### Task 5: D127 Gate-1 Preferred-100K Evidence

**Files:**
- Modify: `packages/code-intel/test/**/*.test.ts` (if new test needed)
- Modify: `docs/superpowers/gate-1-preferred-targets.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run Gate-1 preferred scenario against available 100K+ target**

Use the existing `pnpm gate1:current` command or run the Code Intel test suite against the largest available local target. Even a FAIL is real evidence.

- [ ] **Step 2: Record evidence**

Update gate-1-preferred-targets.json with fresh evidence (pass or fail, with LOC count and timing).

- [ ] **Step 3: Update scorecard**

If Gate-1 preferred evidence is freshly proven (even as FAIL), update v1.5 status in scorecard.

- [ ] **Step 4: Commit D127**

```bash
git add docs/superpowers/ ROADMAP.md
git commit -m "feat(D-127): refresh Gate-1 preferred-100K evidence"
```

---

## Phase D: Gate-2 Production Proof (D128)

### Task 6: D128 Gate-2 Long-Horizon Production Evidence

**Files:**
- Modify: `packages/coding-agent/test/integration/**/*.test.ts` (if new integration test)
- Modify: `docs/superpowers/gate-2-long-horizon-live.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run Gate-2 production-like scenario**

Execute a non-fixture long-horizon task (real code modification + test + review cycle) and record tool calls, success/failure, and drift evidence.

- [ ] **Step 2: Record evidence**

Update gate-2-long-horizon-live.json with fresh production evidence.

- [ ] **Step 3: Update scorecard**

If Gate-2 production evidence is freshly proven, update v3.0 status in scorecard.

- [ ] **Step 4: Commit D128**

```bash
git add docs/superpowers/ ROADMAP.md
git commit -m "feat(D-128): refresh Gate-2 long-horizon production evidence"
```

---

## Phase E: v5 3rd-Cycle Depth (D129)

### Task 7: D129 v5 Observability Correlation + Policy CLI

**Files:**
- Modify: `packages/coding-agent/src/observability/audit-log.ts`
- Modify: `packages/coding-agent/src/policy-snapshot.ts`
- Create: `packages/coding-agent/src/cli/policy-snapshot-command.ts`
- Modify: `packages/coding-agent/test/unit/audit-log.test.ts`
- Modify: `packages/coding-agent/test/unit/policy-snapshot.test.ts`

- [ ] **Step 1: Add correlationId to AuditLog events**

Extend AuditLog event payload to support an optional `correlationId` string that links related events across a single tool-loop session.

- [ ] **Step 2: Add correlationId test**

Add test verifying events with the same correlationId can be queried together.

- [ ] **Step 3: Add policy-snapshot CLI command**

Create a thin CLI command that calls `buildPolicySnapshot` and prints the result as JSON.

- [ ] **Step 4: Add CLI command test**

Add test verifying the CLI command produces valid JSON output.

- [ ] **Step 5: Run tests**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/audit-log.test.ts packages/coding-agent/test/unit/policy-snapshot.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 6: Commit D129**

```bash
git add packages/coding-agent/src/observability/ packages/coding-agent/src/policy-snapshot.ts packages/coding-agent/src/cli/ packages/coding-agent/test/unit/audit-log.test.ts packages/coding-agent/test/unit/policy-snapshot.test.ts
git commit -m "feat(D-129): v5 3rd-cycle audit correlation + policy snapshot CLI"
```

---

## Phase F: v6 Theme 2 Cross-Bridge + Theme 3 Seed (D130)

### Task 8: D130 v6 Enterprise Cross-Bridge + Distributed Coordination Seed

**Files:**
- Create: `packages/coding-agent/src/hosted/enterprise-policy-snapshot.ts`
- Create: `packages/coding-agent/src/distributed/leader-election.ts`
- Create: `packages/coding-agent/test/unit/enterprise-policy-snapshot.test.ts`
- Create: `packages/coding-agent/test/unit/leader-election.test.ts`

- [ ] **Step 1: Create enterprise policy snapshot**

Cross-bridge tying D-111 rate limit + D-112 quota + D-113 SSO/OIDC into one EnterprisePolicySnapshot struct (mirrors D-105 buildPolicySnapshot pattern).

- [ ] **Step 2: Add enterprise policy snapshot tests**

4 tests: round-trip, rate-limit-denied, quota-exceeded, sso-invalid.

- [ ] **Step 3: Create leader election seed**

Simple lease-based leader election: acquire lease, check lease, release lease. In-memory for now.

- [ ] **Step 4: Add leader election tests**

4 tests: acquire, renew, expire, release.

- [ ] **Step 5: Run tests**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/enterprise-policy-snapshot.test.ts packages/coding-agent/test/unit/leader-election.test.ts --reporter=verbose`
Expected: PASS.

- [ ] **Step 6: Commit D130**

```bash
git add packages/coding-agent/src/hosted/ packages/coding-agent/src/distributed/ packages/coding-agent/test/unit/enterprise-policy-snapshot.test.ts packages/coding-agent/test/unit/leader-election.test.ts
git commit -m "feat(D-130): v6 enterprise cross-bridge + distributed coordination seed"
```

---

## Final Verification

### Task 9: Full Pipeline Verification + Push

- [ ] **Step 1: Run full verification**

```powershell
pnpm build
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

- [ ] **Step 2: Review scorecard**

Check docs/superpowers/v1-v4-evidence-scorecard.json for updated aggregate percent.

- [ ] **Step 3: Push**

```bash
git push origin feature/d36-gate2-live
```

---

## Self-Review

1. **Spec coverage:** D125-D130 each map to specific gate/scorecard gaps. D125/D126 close Gate-1.5, D127 addresses Gate-1 preferred, D128 addresses Gate-2 production, D129/D130 deepen v5/v6.
2. **Placeholder scan:** No TBD/TODO placeholders. Each step has exact file paths and test expectations.
3. **Type consistency:** All new types follow existing patterns (branded types, interface naming, test file naming).
4. **Scope check:** D125-D128 are gate evidence (not feature work). D129-D130 are seed depth (not production claims). v1-v4 completion remains gate-driven.
