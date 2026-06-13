# D115 Gate-1.5 Opt-In Live Browser Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested opt-in runner boundary for the D114 Gate-1.5 live Browser task queue without starting real browser automation by default.

**Architecture:** Keep Browser execution behind an explicit adapter and `optIn: true` flag. The runner consumes the D114 ledger, skips safely when opt-in is missing, runs only pending tasks when explicitly allowed, and returns an updated ledger through the existing Gate-1.5 accounting path.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing Gate-1.5 live task ledger.

---

## File Structure

- Create `packages/coding-agent/src/browser/live-task-runner.ts`: opt-in runner boundary and result accounting.
- Create `packages/coding-agent/test/unit/browser-live-task-runner.test.ts`: TDD coverage for opt-in guard, missing adapter guard, and successful adapter execution.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: advance current status to D115 and require the runner boundary evidence.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`, `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`, `docs/superpowers/gate-1.5-live-browser-tasks.{json,md}`: document D115 as runner-boundary evidence only; keep completed live task count at 0 until a real opt-in run exists.

## Task 1: RED Unit Tests For Opt-In Runner

- [ ] **Step 1: Write failing tests**

Create `packages/coding-agent/test/unit/browser-live-task-runner.test.ts` with three behaviors:

```ts
import { describe, expect, it } from 'vitest';
import { buildLiveBrowserTaskLedger, type LiveBrowserTaskCandidate } from '../../src/browser/live-task-source.js';
import { runLiveBrowserTasks } from '../../src/browser/live-task-runner.js';

const tasks: LiveBrowserTaskCandidate[] = [
  { id: 'docs-search', source: 'test', url: 'https://example.test/docs', goal: 'Search docs', requiredCapabilities: ['browser.navigate', 'browser.type'] },
  { id: 'cart-add', source: 'test', url: 'https://example.test/cart', goal: 'Add to cart', requiredCapabilities: ['browser.navigate', 'browser.click'] },
];

describe('Gate-1.5 opt-in live Browser task runner', () => {
  it('does not run pending tasks without explicit opt-in', async () => {
    const ledger = buildLiveBrowserTaskLedger({ generatedAt: '2026-06-11T00:00:00.000Z', tasks });
    let calls = 0;

    const result = await runLiveBrowserTasks({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: false,
      runner: async () => {
        calls += 1;
        return { status: 'success' };
      },
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('skipped-opt-in-required');
    expect(result.attemptedTasks).toBe(0);
    expect(result.updatedLedger.pendingTasks).toBe(2);
    expect(result.updatedLedger.completedTasks).toBe(0);
  });

  it('does not run pending tasks when no runner adapter is provided', async () => {
    const ledger = buildLiveBrowserTaskLedger({ generatedAt: '2026-06-11T00:00:00.000Z', tasks });

    const result = await runLiveBrowserTasks({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
    });

    expect(result.status).toBe('skipped-runner-missing');
    expect(result.attemptedTasks).toBe(0);
    expect(result.updatedLedger.completedTasks).toBe(0);
  });

  it('runs pending tasks through an explicit adapter and updates Gate-1.5 accounting', async () => {
    const ledger = buildLiveBrowserTaskLedger({ generatedAt: '2026-06-11T00:00:00.000Z', tasks });

    const result = await runLiveBrowserTasks({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
      runner: async (task) => ({ status: task.id === 'docs-search' ? 'success' : 'failed', summary: `ran ${task.id}` }),
    });

    expect(result.status).toBe('ran');
    expect(result.attemptedTasks).toBe(2);
    expect(result.results.map((row) => row.status)).toEqual(['success', 'failed']);
    expect(result.updatedLedger.completedTasks).toBe(2);
    expect(result.updatedLedger.successes).toBe(1);
    expect(result.updatedLedger.failures).toBe(1);
    expect(result.updatedLedger.binding).toBe(false);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-runner.test.ts --reporter=verbose
```

Expected: FAIL because `src/browser/live-task-runner.ts` does not exist.

## Task 2: GREEN Runner Boundary

- [ ] **Step 1: Implement minimal runner**

Create `packages/coding-agent/src/browser/live-task-runner.ts` with:

- `LiveBrowserTaskRunner` adapter type.
- `runLiveBrowserTasks(input)` async function.
- explicit `optIn` guard.
- missing-runner guard.
- max-task support defaulting to all pending tasks.
- updated ledger produced by `buildLiveBrowserTaskLedger`.

- [ ] **Step 2: Verify GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/browser-live-task-runner.test.ts --reporter=verbose
```

Expected: PASS, 3 tests.

## Task 3: RED Status Hygiene

- [ ] **Step 1: Update status-doc expectations**

Require:

- current sprint `D115 Gate-1.5 opt-in live Browser task runner`
- completed slice `D115 Gate-1.5 opt-in live Browser task runner`
- next implementation slice `D116 Gate-1.5 live Browser result recorder`
- scorecard next action starts with D116
- live task ledger keeps `completedTasks=0`, `binding=false`, and includes `runnerStatus: "opt-in-runner-available"`

- [ ] **Step 2: Verify RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because docs still point at D114/D115.

## Task 4: Docs And Evidence

- [ ] **Step 1: Update evidence files**

Add runner boundary metadata to `docs/superpowers/gate-1.5-live-browser-tasks.{json,md}` without changing completed result counts.

- [ ] **Step 2: Update status docs and scorecard**

Advance D115 in public docs. Keep v2.0 at 40% and aggregate at 65%.

- [ ] **Step 3: Verify status GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 5: Full Verification And Commit

- [ ] **Step 1: Run verification**

```powershell
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
```

- [ ] **Step 2: Stage D115 files only**

```powershell
git add packages/coding-agent/src/browser/live-task-runner.ts packages/coding-agent/test/unit/browser-live-task-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1.5-live-browser-tasks.json docs/superpowers/gate-1.5-live-browser-tasks.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-11-d115-gate15-opt-in-live-browser-runner.md
```

- [ ] **Step 3: Commit and push**

```powershell
git commit -m "feat(D-115): add opt-in gate15 browser runner"
git push
```

## Self-Review

- Spec coverage: D115 adds the runner boundary requested by D114's next action while preserving Browser opt-in and non-binding Gate-1.5 status.
- Placeholder scan: no placeholders remain; D116 is explicitly named as the result-recorder next slice.
- Type consistency: runner input/output types are introduced in one module and consumed by the test only.
