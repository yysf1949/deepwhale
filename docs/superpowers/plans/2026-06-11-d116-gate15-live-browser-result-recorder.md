# D116 Gate-1.5 Live Browser Result Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure result recorder that merges explicit opt-in Browser runner results into the Gate-1.5 live task ledger without launching Browser automation or unlocking defaults.

**Architecture:** Keep live Browser execution and result accounting separate. D115 owns the opt-in runner boundary; D116 adds `recordLiveBrowserTaskResults` as the canonical pure ledger merge path, then refactors the runner to use it. Public status docs continue to report 0/20 completed live results until a real opt-in run is recorded in the repository evidence file.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing Gate-1.5 live Browser ledger.

---

## File Structure

- Create `packages/coding-agent/src/browser/live-task-result-recorder.ts`: pure result recording boundary.
- Create `packages/coding-agent/test/unit/browser-live-task-result-recorder.test.ts`: TDD coverage for result merge, unknown/duplicate handling, and threshold binding delegation.
- Modify `packages/coding-agent/src/browser/live-task-runner.ts`: replace local `updateLedger` helper with the recorder.
- Modify `packages/coding-agent/test/unit/browser-live-task-runner.test.ts`: assert runner output exposes recorder accounting for accepted/ignored rows when appropriate.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: advance public status to D116 and next slice to D117.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`, `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`, `docs/superpowers/gate-1.5-live-browser-tasks.{json,md}`: document D116 as result-recorder evidence only; keep completed live task count at 0 in repository evidence.

## Task 1: RED Result Recorder Tests

**Files:**
- Create: `packages/coding-agent/test/unit/browser-live-task-result-recorder.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import { recordLiveBrowserTaskResults } from '../../src/browser/live-task-result-recorder.js';

const tasks: LiveBrowserTaskCandidate[] = [
  { id: 'docs-search', source: 'test', url: 'https://example.test/docs', goal: 'Search docs', requiredCapabilities: ['browser.navigate'] },
  { id: 'cart-add', source: 'test', url: 'https://example.test/cart', goal: 'Add to cart', requiredCapabilities: ['browser.click'] },
  { id: 'profile-edit', source: 'test', url: 'https://example.test/profile', goal: 'Edit profile', requiredCapabilities: ['browser.type'] },
];

describe('Gate-1.5 live Browser result recorder', () => {
  it('records matching results while ignoring unknown and duplicate rows', () => {
    const ledger = buildLiveBrowserTaskLedger({ generatedAt: '2026-06-11T00:00:00.000Z', tasks });

    const output = recordLiveBrowserTaskResults({
      generatedAt: '2026-06-11T02:00:00.000Z',
      ledger,
      results: [
        { id: 'docs-search', status: 'success' },
        { id: 'unknown-task', status: 'failed' },
        { id: 'docs-search', status: 'failed' },
        { id: 'cart-add', status: 'failed' },
      ],
    });

    expect(output.status).toBe('recorded');
    expect(output.acceptedResults).toBe(2);
    expect(output.ignoredResults).toEqual([
      { id: 'unknown-task', reason: 'unknown-task' },
      { id: 'docs-search', reason: 'duplicate-result' },
    ]);
    expect(output.updatedLedger.completedTasks).toBe(2);
    expect(output.updatedLedger.pendingTasks).toBe(1);
    expect(output.updatedLedger.successes).toBe(1);
    expect(output.updatedLedger.failures).toBe(1);
    expect(output.updatedLedger.binding).toBe(false);
    expect(output.updatedLedger.branchDecision).toBe('defer-live-evidence');
    expect(output.updatedLedger.tasks.map((task) => [task.id, task.status])).toEqual([
      ['docs-search', 'success'],
      ['cart-add', 'failed'],
      ['profile-edit', 'pending'],
    ]);
  });

  it('delegates the binding decision only after the required completed result threshold exists', () => {
    const twentyTasks = Array.from({ length: 20 }, (_, index): LiveBrowserTaskCandidate => ({
      id: `task-${index + 1}`,
      source: 'test',
      url: `https://example.test/${index + 1}`,
      goal: `Run task ${index + 1}`,
      requiredCapabilities: ['browser.navigate'],
    }));
    const ledger = buildLiveBrowserTaskLedger({ generatedAt: '2026-06-11T00:00:00.000Z', tasks: twentyTasks });

    const output = recordLiveBrowserTaskResults({
      generatedAt: '2026-06-11T02:00:00.000Z',
      ledger,
      results: twentyTasks.map((task) => ({ id: task.id, status: 'success' as const })),
    });

    expect(output.acceptedResults).toBe(20);
    expect(output.updatedLedger.completedTasks).toBe(20);
    expect(output.updatedLedger.pendingTasks).toBe(0);
    expect(output.updatedLedger.successRate).toBe(1);
    expect(output.updatedLedger.binding).toBe(true);
    expect(output.updatedLedger.branchDecision).toBe('continue-browser-enhancement');
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-result-recorder.test.ts --reporter=verbose
```

Expected: FAIL because `src/browser/live-task-result-recorder.ts` does not exist.

## Task 2: GREEN Pure Recorder

**Files:**
- Create: `packages/coding-agent/src/browser/live-task-result-recorder.ts`

- [ ] **Step 1: Implement minimal recorder**

Create `recordLiveBrowserTaskResults(input)` with:

- accepted result rows for known task ids only.
- duplicate result rows ignored after the first accepted row per id.
- unknown ids reported in `ignoredResults`.
- updated ledger produced by `buildLiveBrowserTaskLedger`.

- [ ] **Step 2: Verify GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-result-recorder.test.ts --reporter=verbose
```

Expected: PASS, 2 tests.

## Task 3: Runner Refactor

**Files:**
- Modify: `packages/coding-agent/src/browser/live-task-runner.ts`
- Modify: `packages/coding-agent/test/unit/browser-live-task-runner.test.ts`

- [ ] **Step 1: Update runner tests**

Assert `runLiveBrowserTasks` exposes recorder accounting:

```ts
expect(result.acceptedResults).toBe(2);
expect(result.ignoredResults).toEqual([]);
```

- [ ] **Step 2: Refactor runner**

Import and call `recordLiveBrowserTaskResults` instead of the private `updateLedger` helper. Keep skipped paths unchanged.

- [ ] **Step 3: Verify runner GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-runner.test.ts --reporter=verbose
```

Expected: PASS, 3 tests.

## Task 4: Status Evidence

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update status expectations**

Require:

- current sprint `D116 Gate-1.5 live Browser result recorder`
- completed slice `D116 Gate-1.5 live Browser result recorder`
- next implementation slice `D117 Gate-1.5 opt-in live Browser evidence run`
- ledger metadata `resultRecorderStatus: "available"`
- completed live result counts remain `0/20`
- aggregate remains 65 and v2.0 remains 40

- [ ] **Step 2: Verify status RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because docs still point at D115/D116.

- [ ] **Step 3: Update docs and evidence**

Advance the public status blocks and machine-readable evidence to D116. Keep Browser enhancement locked and live completed count at 0 until a real opt-in run writes results into repository evidence.

- [ ] **Step 4: Verify status GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 5: Full Verification And Commit

**Files:**
- Stage D116 files only.

- [ ] **Step 1: Run full verification**

```powershell
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
```

- [ ] **Step 2: Commit and push**

```powershell
git add packages/coding-agent/src/browser/live-task-result-recorder.ts packages/coding-agent/src/browser/live-task-runner.ts packages/coding-agent/test/unit/browser-live-task-result-recorder.test.ts packages/coding-agent/test/unit/browser-live-task-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1.5-live-browser-tasks.json docs/superpowers/gate-1.5-live-browser-tasks.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-11-d116-gate15-live-browser-result-recorder.md
git commit -m "feat(D-116): record gate15 browser results"
git push
```

## Self-Review

- Spec coverage: D116 records explicit results, ignores unsafe unknown/duplicate rows, and preserves Gate-1.5 deferral until the required completed-result threshold is met.
- Placeholder scan: no placeholders remain.
- Type consistency: result rows share the same `success` / `failed` status vocabulary as D114/D115 and output uses concrete accepted/ignored accounting.
