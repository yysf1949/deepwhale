# D132 V2 Tier-2 Automation Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Automation item within v2.0 Tier-2 release evidence while keeping v2.0 blocked on Remote TUI.

**Architecture:** Add an injected `AutomationRuntime` that reuses `CronDaemon` for ticks, executes enabled `CronStore` jobs through a caller-provided runner, and persists success/failure run records through `CronStore`. Feed the runtime source, store source, and tests into the existing v2.0 precheck without changing default registry exposure.

**Tech Stack:** TypeScript, Node fs/path utilities, Vitest, Markdown/JSON evidence files, pnpm monorepo verification.

---

## File Structure

- Create `packages/coding-agent/src/util/automation-runtime.ts`: injected runner runtime and run-record mapper.
- Create `packages/coding-agent/test/unit/automation-runtime.test.ts`: RED/GREEN runtime proof.
- Modify `packages/coding-agent/src/util/cron-store.ts`: add persisted `CronRunRecord` support in `cron/runs.json`.
- Modify `packages/coding-agent/test/unit/cron-store.test.ts`: add run-record persistence tests.
- Modify `packages/coding-agent/src/util/index.ts`: export AutomationRuntime types and CronRunRecord.
- Modify `packages/coding-agent/src/util/cron-daemon.ts`: update comments from stub wording to timer boundary wording only.
- Modify `packages/coding-agent/test/unit/cron-daemon.test.ts`: update stale stub wording in comments only.
- Modify `packages/coding-agent/src/release/v2-tier1-precheck.ts`: advance to D132, add Automation evidence refs, remove Automation from blocked checks, update caveat/summary/next actions.
- Modify `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`: expect D132 with Automation pass and Remote TUI as the only blocker.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require D132 public status and D133 next-work pointers.
- Modify `docs/superpowers/v2-tier1-precheck.json`: D132 machine-readable evidence.
- Modify `docs/superpowers/v2-tier1-precheck.md`: D132 human-readable evidence.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json`: progress and blocker update.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.md`: scorecard mirror.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: current status blocks and next work.
- Create `docs/superpowers/specs/2026-06-13-d132-v2-tier2-automation-closure-design.md`: design record.
- Create `docs/superpowers/plans/2026-06-13-d132-v2-tier2-automation-closure.md`: this plan.

### Task 1: RED Tests For Run Records And Automation Runtime

- [ ] **Step 1: Write failing store tests**

Append these tests to `packages/coding-agent/test/unit/cron-store.test.ts`:

```ts
  it('records and lists cron run records', async () => {
    const store = new CronStore(dir);
    await store.recordRun({
      runId: 'run-1',
      jobId: 'j1',
      schedule: '* * * * *',
      prompt: 'summarize repo',
      status: 'success',
      startedAt: '2026-06-13T00:00:00.000Z',
      finishedAt: '2026-06-13T00:00:01.000Z',
      output: 'done',
    });

    expect(await store.listRuns()).toEqual([
      {
        runId: 'run-1',
        jobId: 'j1',
        schedule: '* * * * *',
        prompt: 'summarize repo',
        status: 'success',
        startedAt: '2026-06-13T00:00:00.000Z',
        finishedAt: '2026-06-13T00:00:01.000Z',
        output: 'done',
      },
    ]);
  });
```

- [ ] **Step 2: Create failing runtime tests**

Create `packages/coding-agent/test/unit/automation-runtime.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationRuntime } from '../../src/util/automation-runtime.js';
import { CronStore } from '../../src/util/cron-store.js';

function clockFrom(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[index++] ?? values[values.length - 1] ?? '2026-06-13T00:00:00.000Z');
}

describe('AutomationRuntime (D132)', () => {
  let dir: string;
  let store: CronStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-automation-runtime-'));
    store = new CronStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('executes enabled cron jobs through an injected runner and records success', async () => {
    await store.add({ id: 'j1', schedule: '* * * * *', prompt: 'summarize repo', enabled: true });
    await store.add({ id: 'j2', schedule: '* * * * *', prompt: 'disabled', enabled: false });
    const runner = vi.fn(async (job) => ({ output: `ran:${job.prompt}` }));
    const runtime = new AutomationRuntime({
      store,
      runner,
      clock: clockFrom(['2026-06-13T00:00:00.000Z', '2026-06-13T00:00:01.000Z']),
    });

    await runtime.fireOnce();

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0].id).toBe('j1');
    expect(await store.listRuns()).toEqual([
      {
        runId: 'j1:2026-06-13T00:00:00.000Z',
        jobId: 'j1',
        schedule: '* * * * *',
        prompt: 'summarize repo',
        status: 'success',
        startedAt: '2026-06-13T00:00:00.000Z',
        finishedAt: '2026-06-13T00:00:01.000Z',
        output: 'ran:summarize repo',
      },
    ]);
  });

  it('records failed jobs and continues to later enabled jobs', async () => {
    await store.add({ id: 'bad', schedule: '* * * * *', prompt: 'fail', enabled: true });
    await store.add({ id: 'good', schedule: '* * * * *', prompt: 'recover', enabled: true });
    const runner = vi.fn(async (job) => {
      if (job.id === 'bad') throw new Error('runner exploded');
      return { output: `ran:${job.prompt}` };
    });
    const runtime = new AutomationRuntime({
      store,
      runner,
      clock: clockFrom([
        '2026-06-13T00:00:00.000Z',
        '2026-06-13T00:00:01.000Z',
        '2026-06-13T00:00:02.000Z',
        '2026-06-13T00:00:03.000Z',
      ]),
    });

    await runtime.fireOnce();

    expect(runner).toHaveBeenCalledTimes(2);
    expect((await store.listRuns()).map((run) => `${run.jobId}:${run.status}:${run.error ?? run.output}`)).toEqual([
      'bad:failed:runner exploded',
      'good:success:ran:recover',
    ]);
  });
});
```

- [ ] **Step 3: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/cron-store.test.ts packages/coding-agent/test/unit/automation-runtime.test.ts --reporter=verbose
```

Expected: fail because `recordRun`, `listRuns`, and `automation-runtime.js` do not exist.

### Task 2: Implement Automation Runtime

- [ ] **Step 1: Extend CronStore**

Add `CronRunRecord`, `listRuns`, `recordRun`, and `saveRuns` to `packages/coding-agent/src/util/cron-store.ts`. Store records in `cron/runs.json` as an array, mirroring the existing jobs file behavior.

- [ ] **Step 2: Add AutomationRuntime**

Create `packages/coding-agent/src/util/automation-runtime.ts` with:

```ts
import { CronDaemon } from './cron-daemon.js';
import type { CronJob, CronRunRecord, CronStore } from './cron-store.js';

export interface AutomationRunnerResult {
  output?: string;
}

export type AutomationRunner = (job: CronJob) => Promise<AutomationRunnerResult | void>;

export interface AutomationRuntimeOptions {
  store: CronStore;
  runner: AutomationRunner;
  clock?: () => Date;
  createRunId?: (job: CronJob, startedAt: string) => string;
}

export class AutomationRuntime {
  private readonly daemon: CronDaemon;
}
```

Implement `start`, `stop`, `fireOnce`, `drainInFlight`, and a private `runJob` method. `runJob`
records `status: 'success'` when the runner resolves and `status: 'failed'` with a normalized error
message when the runner rejects.

- [ ] **Step 3: Export new types**

Update `packages/coding-agent/src/util/index.ts` to export `AutomationRuntime`, `AutomationRunner`,
`AutomationRunnerResult`, `AutomationRuntimeOptions`, and `CronRunRecord`.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/cron-store.test.ts packages/coding-agent/test/unit/automation-runtime.test.ts --reporter=verbose
```

Expected: all tests pass.

### Task 3: Update D132 Precheck

- [ ] **Step 1: Update failing precheck expectations**

Change `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts` so it expects:

```ts
expect(result.slice).toBe('D132');
expect(statusOf(result, 'tier2-automation')).toBe('pass');
expect(statusOf(result, 'tier2-remote-tui')).toBe('blocked');
expect(statusOf(result, 'tier2-compaction')).toBe('pass');
expect(statusOf(result, 'tier2-mcp-runtime')).toBe('pass');
expect(result.blockers).toEqual(['Tier-2 Remote TUI remains blocked']);
expect(result.nextActions[0]).toContain('D133');
```

Update the evidence snapshot test to expect the same row/status/blockers.

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: fail because implementation still reports D131 and `tier2-automation` blocked.

- [ ] **Step 3: Implement D132 precheck**

In `packages/coding-agent/src/release/v2-tier1-precheck.ts`:

- change result slice type and return value to `D132`;
- add evidence refs for `automation-runtime.ts`, `cron-store.ts`, `cron-daemon.ts`,
  `automation-runtime.test.ts`, `cron-store.test.ts`, and `cron-daemon.test.ts`;
- remove `tier2-automation` from `BLOCKED_CHECKS`;
- update the Automation caveat to injected runner plus persisted run-record proof only;
- update summary and next actions to D133.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: 4 tests pass.

### Task 4: Update Evidence Docs And Status Hygiene

- [ ] **Step 1: Update evidence docs**

Update `docs/superpowers/v2-tier1-precheck.json` to D132 with nine pass rows and one blocked row.
`blockers` must be exactly:

```json
[
  "Tier-2 Remote TUI remains blocked"
]
```

Update `docs/superpowers/v2-tier1-precheck.md` to mirror the JSON.

- [ ] **Step 2: Update scorecard and public docs**

Update `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`, `README.md`, `ROADMAP.md`, and
`docs/ROADMAP_DECISIONS.md` with:

```text
Current sprint: D132 v2.0 Tier-2 Automation closure
D132 v2.0 Tier-2 Automation closure: Automation now has an injected runner execution proof with persisted run records...
Next implementation slice: D133 close or explicitly defer the remaining v2.0 Tier-2 Remote TUI blocker without expanding default exposure.
```

Remote TUI must remain blocked, and v2.0 must remain not release-ready.

- [ ] **Step 3: Update status hygiene test**

Change `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` expectations from D131/D132 to
D132/D133 and add negative checks for stale `Current sprint: D131` and `Next implementation slice:
D132 close another`.

- [ ] **Step 4: Run docs-focused GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/automation-runtime.test.ts packages/coding-agent/test/unit/cron-store.test.ts packages/coding-agent/test/unit/cron-daemon.test.ts packages/coding-agent/test/unit/v2-tier1-precheck.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/coding-agent/test/unit/default-registry-invariant.test.ts --reporter=verbose
```

Expected: all focused tests pass.

### Task 5: Verification, Commit, Push

- [ ] **Step 1: Full verification**

Run:

```powershell
cmd /c "pnpm.cmd build && pnpm.cmd lint && pnpm.cmd typecheck && pnpm.cmd test"
git diff --check
```

Expected: exit 0 for both commands.

- [ ] **Step 2: Stage only D132 files**

Use explicit `git add` paths. Do not stage:

```text
docs/superpowers/gate-1-current-workspace-result.json
docs/superpowers/gate-1-current-workspace-result.md
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "feat(D-132): close Automation Tier-2 evidence"
git push -u origin feature/d36-gate2-live
```

Expected: branch pushes successfully.

## Plan Self-Review

- Spec coverage: runner execution, persisted run records, precheck, docs, verification, commit, and push are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: check ids use `tier2-automation`, `tier2-remote-tui`, `tier2-compaction`, and `tier2-mcp-runtime` consistently.
- Scope check: no Remote TUI, default exposure, LLM/API-key, cron parser, no-agent session resumption, or service installer work is included.
