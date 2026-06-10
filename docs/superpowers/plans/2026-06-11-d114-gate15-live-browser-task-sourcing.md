# D114 Gate-1.5 Live Browser Task Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Gate-1.5 Browser blocker from "no live task entrypoint" into a machine-readable, opt-in queue of 20 candidate live Browser tasks while keeping the binding decision deferred until real results exist.

**Architecture:** Add a pure Browser task sourcing helper that normalizes and deduplicates candidate tasks, tracks pending/success/failed counts, and emits a ledger that can later be consumed by the existing Gate-1.5 evaluator. Public docs cite the new queue as sourcing evidence only, not live result evidence.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing Gate-1.5 JSON/Markdown evidence files.

---

## File Structure

- Create `packages/coding-agent/src/browser/live-task-source.ts`: pure types and ledger builder for candidate live Browser tasks.
- Create `packages/coding-agent/test/unit/browser-live-task-source.test.ts`: TDD coverage for dedupe, pending handling, and real-result projection.
- Modify `packages/coding-agent/src/browser/gate15.ts`: export unchanged evaluator inputs plus a small converter from completed ledger rows to `BrowserTask`.
- Modify `docs/superpowers/gate-1.5-live-browser-tasks.json`: replace the 0-task dead-end ledger with 20 pending candidate tasks and explicit non-binding counters.
- Modify `docs/superpowers/gate-1.5-live-browser-tasks.md`: human-readable companion for the pending queue.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`, `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: update D114 current status without increasing v2.0 score.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: lock the D114 status and ledger semantics.

## Task 1: RED Unit Tests For Task Sourcing

- [ ] **Step 1: Write failing tests**

Add `packages/coding-agent/test/unit/browser-live-task-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  completedBrowserTasksForGate15,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';

const baseTasks: LiveBrowserTaskCandidate[] = [
  { id: 'search-product', source: 'gate-1.5-seed', url: 'https://example.test/search', goal: 'Search for a product', requiredCapabilities: ['browser.navigate', 'browser.type', 'browser.click'] },
  { id: 'checkout-review', source: 'gate-1.5-seed', url: 'https://example.test/cart', goal: 'Review a checkout cart', requiredCapabilities: ['browser.navigate', 'browser.click'] },
  { id: 'search-product', source: 'duplicate', url: 'https://duplicate.test/search', goal: 'Duplicate should be ignored', requiredCapabilities: ['browser.navigate'] },
];

describe('Gate-1.5 live Browser task sourcing', () => {
  it('deduplicates candidate tasks and keeps pending tasks non-binding', () => {
    const ledger = buildLiveBrowserTaskLedger({ generatedAt: '2026-06-11T00:00:00.000Z', tasks: baseTasks });

    expect(ledger.evidenceKind).toBe('live-browser-task-sourcing-ledger');
    expect(ledger.requiredTasks).toBe(20);
    expect(ledger.candidateTasks).toBe(2);
    expect(ledger.pendingTasks).toBe(2);
    expect(ledger.completedTasks).toBe(0);
    expect(ledger.successes).toBe(0);
    expect(ledger.failures).toBe(0);
    expect(ledger.binding).toBe(false);
    expect(ledger.branchDecision).toBe('defer-live-evidence');
    expect(ledger.tasks.map((task) => task.id)).toEqual(['search-product', 'checkout-review']);
  });

  it('projects only completed rows into the existing Gate-1.5 evaluator input', () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: [
        { ...baseTasks[0]!, status: 'success' },
        { ...baseTasks[1]!, status: 'pending' },
        { id: 'login-flow', source: 'gate-1.5-seed', url: 'https://example.test/login', goal: 'Log in with a test account', status: 'failed', requiredCapabilities: ['browser.navigate', 'browser.type', 'browser.click'] },
      ],
    });

    expect(ledger.completedTasks).toBe(2);
    expect(ledger.pendingTasks).toBe(1);
    expect(ledger.successRate).toBe(0.5);
    expect(completedBrowserTasksForGate15(ledger)).toEqual([
      { id: 'search-product', status: 'success' },
      { id: 'login-flow', status: 'failed' },
    ]);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-source.test.ts --reporter=verbose
```

Expected: FAIL because `src/browser/live-task-source.ts` does not exist.

## Task 2: GREEN Pure Ledger Builder

- [ ] **Step 1: Implement minimal code**

Create `packages/coding-agent/src/browser/live-task-source.ts` with the exact exported types and functions used by the tests. Treat missing status as `pending`, trim fields, skip duplicate ids after the first valid entry, and compute `binding=false` unless completed tasks are at least `requiredTasks`.

- [ ] **Step 2: Verify GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-source.test.ts --reporter=verbose
```

Expected: PASS, 2 tests.

## Task 3: RED Status Hygiene For D114

- [ ] **Step 1: Update hygiene expectations**

Change `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` so the live task ledger test requires:

- `evidenceKind === 'live-browser-task-sourcing-ledger'`
- `candidateTasks === 20`
- `pendingTasks === 20`
- `completedTasks === 0`
- `binding === false`
- `branchDecision === 'defer-live-evidence'`
- public status line `Gate-1.5 live task sourcing: 20 candidates queued, 0/20 completed; binding=false; Browser enhancement unlocked=false.`
- current sprint line `D114 Gate-1.5 live Browser task sourcing`
- next implementation slice `D115 Gate-1.5 opt-in live Browser task runner`

- [ ] **Step 2: Verify RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because docs still describe D113 and a 0-candidate live ledger.

## Task 4: Update Evidence Docs

- [ ] **Step 1: Update ledger JSON and Markdown**

Write 20 pending candidate tasks across ecommerce/search/docs/forms/navigation flows. Keep all URLs as example or public documentation targets; do not claim any task has run.

- [ ] **Step 2: Update public status and scorecard**

Set current sprint to `D114 Gate-1.5 live Browser task sourcing`. Add a completed slice noting the queue is sourced but no live results exist. Keep v2.0 at 40% and aggregate at 65%.

- [ ] **Step 3: Verify hygiene GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 5: Full Verification And Commit

- [ ] **Step 1: Run full verification**

```powershell
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
```

- [ ] **Step 2: Stage only D114 files**

```powershell
git add packages/coding-agent/src/browser/live-task-source.ts packages/coding-agent/test/unit/browser-live-task-source.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1.5-live-browser-tasks.json docs/superpowers/gate-1.5-live-browser-tasks.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-11-d114-gate15-live-browser-task-sourcing.md
```

- [ ] **Step 3: Commit and push**

```powershell
git commit -m "feat(D-114): source gate15 live browser task queue"
git push
```

## Self-Review

- Spec coverage: D114 directly addresses the v2.0 Gate-1.5 blocker by adding a task source queue while preserving the no-live-evidence caveat.
- Placeholder scan: no placeholders remain; future work is named as D115.
- Type consistency: `LiveBrowserTaskCandidate`, `LiveBrowserTaskLedger`, and `completedBrowserTasksForGate15` are consistently referenced across tests and implementation.
