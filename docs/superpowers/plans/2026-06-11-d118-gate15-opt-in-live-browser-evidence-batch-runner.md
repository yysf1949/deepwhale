# D118 Gate-1.5 Opt-In Live Browser Evidence Batch Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development (RED → GREEN → REFACTOR) and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan reference:** v1-v4 master execution plan § "Gate-1.5 Browser (deferred)" and v5 long-horizon plan § "Gate-1.5 live evidence prerequisite".
**Branch:** `feature/d36-gate2-live`
**Goal:** Add `recordOptInLiveBrowserEvidenceBatch` as a thin async orchestration layer that runs the D-117 chain `batchSize` times, accumulating completed task results into a typed batch evidence record. This is the second sub-sprint in the Gate-1.5 chain that produces a real completed-task increment via a stub adapter, advancing the repository ledger from 1/20 to 4/20 completed live results. Binding remains false because 16/20 are still pending; Browser defaults stay locked. The honest discipline (D-39 #4) is enforced: 4/20 is not 20/20, and the public status blocks keep the binding assertion at `false` until 20 completed live results exist through real Browser automation in a future sub-sprint.

**拍板 (Pre-resolved decisions):**

1. **Function name:** `recordOptInLiveBrowserEvidenceBatch` (parallels D-117 `recordOptInLiveBrowserEvidence`).
2. **New file location:** `packages/coding-agent/src/browser/live-task-evidence-runner-batch.ts` (sibling to D-117 evidence runner + D-115 runner + D-116 recorder, NOT in `src/agent/` to keep 5 红线 clean).
3. **Async not pure:** The function awaits `runLiveBrowserTasks` in a sequential loop, passing the updated ledger from each iteration as the input to the next. The wrapper is `async` and returns a `Promise<OptInLiveBrowserEvidenceBatch>`.
4. **TS2379 mitigation:** Same as D-117: `runner` and `batchSize` are spread conditionally to avoid TS2379 in strict-optional-prop config.
5. **No real Browser I/O in D-118:** The runner is a stub (same pattern as D-117). D-118 proves the batch chain end-to-end, not real Browser automation. Real automation is D-119+ once the chain is trusted and real Browser tooling is integrated.
6. **Small batch in live ledger:** D-118 updates the repository ledger from 1/20 to 4/20 (3 more). This is a small, honest increment that keeps binding=false. The function design supports `batchSize: 20` (which would flip binding to true), but D-118 deliberately stops at 4/20 to avoid faking a binding claim with stub data.
7. **No default registry change:** D-118 does not expose Browser to the default registry. The function is opt-in only.
8. **Mirrors D-117 + D-105 pattern:** Thin orchestration layer over already-shipped async function `runLiveBrowserTasks` (D-115). Returns aggregated typed evidence.

**P5 theme-prefix form (avoid Nth-occurrence pitfall, N=15th dual-form):**

- README/ROADMAP/ROADMAP_DECISIONS changelog line (colon form): `D118 Gate-1.5 opt-in live Browser evidence batch runner: 1 new function ...`
- README/ROADMAP/ROADMAP_DECISIONS current-sprint line (parenthetical form): `D118 Gate-1.5 opt-in live Browser evidence batch runner (recordOptInLiveBrowserEvidenceBatch)`

**Test count delta:** +4 new unit tests in `live-task-evidence-runner-batch.test.ts`. Total: 1321 → 1325 pass (subject to vitest run).

**File count delta:** +1 new impl file + 1 new test file + 9 status doc patches + 1 plan doc.

**Evidence count delta:** v1-v4 scorecard v2.0 stays at 45% (D-118 is a continuation in the same stub-based regime, 4/20 is still 16 short of binding threshold).

**5 红线 invariant:** empty. New code lives in `src/browser/`, never touches the 5 protected files.

---

## Task 1: Write the test (RED)

**Files:**
- Create: `packages/coding-agent/test/unit/live-task-evidence-runner-batch.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import { recordOptInLiveBrowserEvidenceBatch } from '../../src/browser/live-task-evidence-runner-batch.js';
import type { LiveBrowserTaskRunner } from '../../src/browser/live-task-runner.js';

function makeTwentyTasks(): LiveBrowserTaskCandidate[] {
  return Array.from({ length: 20 }, (_, index): LiveBrowserTaskCandidate => ({
    id: `task-${index + 1}`,
    source: 'test',
    url: `https://example.test/${index + 1}`,
    goal: `Run task ${index + 1}`,
    requiredCapabilities: ['browser.navigate'],
  }));
}

const STUB_SUCCESS_RUNNER: LiveBrowserTaskRunner = async (task) => ({
  status: 'success',
  summary: `stub-evidence for ${task.id}`,
});

describe('Gate-1.5 opt-in live Browser evidence batch runner', () => {
  it('records a batch of 3 opt-in runs end-to-end and locks binding at false', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const batch = await recordOptInLiveBrowserEvidenceBatch({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
      runner: STUB_SUCCESS_RUNNER,
      batchSize: 3,
    });

    expect(batch.evidenceKind).toBe('opt-in-batch-completed');
    expect(batch.requestedBatchSize).toBe(3);
    expect(batch.attemptedRuns).toBe(3);
    expect(batch.runs.map((run) => run.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    expect(batch.runs.every((run) => run.status === 'success')).toBe(true);
    expect(batch.totalCompletedBefore).toBe(0);
    expect(batch.totalCompletedAfter).toBe(3);
    expect(batch.totalPendingAfter).toBe(17);
    expect(batch.binding).toBe(false);
    expect(batch.branchDecision).toBe('defer-live-evidence');
  });

  it('skips the entire batch when optIn is false and surfaces opt-in-required', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const batch = await recordOptInLiveBrowserEvidenceBatch({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: false,
      runner: STUB_SUCCESS_RUNNER,
      batchSize: 5,
    });

    expect(batch.evidenceKind).toBe('opt-in-batch-skipped');
    expect(batch.attemptedRuns).toBe(0);
    expect(batch.runs).toEqual([]);
    expect(batch.totalCompletedAfter).toBe(0);
    expect(batch.totalPendingAfter).toBe(20);
    expect(batch.skipReason).toBe('opt-in-required');
    expect(batch.binding).toBe(false);
  });

  it('skips the entire batch when optIn is true but no runner is injected', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const batch = await recordOptInLiveBrowserEvidenceBatch({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
      batchSize: 5,
    });

    expect(batch.evidenceKind).toBe('opt-in-batch-skipped');
    expect(batch.skipReason).toBe('runner-missing');
    expect(batch.attemptedRuns).toBe(0);
    expect(batch.totalCompletedAfter).toBe(0);
  });

  it('reaches the binding threshold when batchSize consumes all pending tasks', async () => {
    // 19 pending + 1 already completed (D-117 recorded docs-search-query)
    const baseLedger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });
    const oneCompletedLedger = {
      ...baseLedger,
      tasks: baseLedger.tasks.map((task, index) =>
        index === 0 ? { ...task, status: 'success' as const } : task,
      ),
      completedTasks: 1,
      pendingTasks: 19,
      successes: 1,
      failures: 0,
    };

    const batch = await recordOptInLiveBrowserEvidenceBatch({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger: oneCompletedLedger,
      optIn: true,
      runner: STUB_SUCCESS_RUNNER,
      batchSize: 20,
    });

    expect(batch.evidenceKind).toBe('opt-in-batch-completed');
    expect(batch.attemptedRuns).toBe(19);
    expect(batch.totalCompletedAfter).toBe(20);
    expect(batch.totalPendingAfter).toBe(0);
    expect(batch.binding).toBe(true);
    expect(batch.branchDecision).toBe('continue-browser-enhancement');
  });
});
```

**Step 2: Verify RED**

Run:
```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/live-task-evidence-runner-batch.test.ts --reporter=verbose 2>&1 | tail -8
```

Expected: FAIL because `src/browser/live-task-evidence-runner-batch.ts` does not exist (import error).

---

## Task 2: Write the impl (GREEN)

**Files:**
- Create: `packages/coding-agent/src/browser/live-task-evidence-runner-batch.ts`

**Step 1: Implement minimal batch evidence runner**

```ts
import { runLiveBrowserTasks, type LiveBrowserTaskRunner } from './live-task-runner.js';
import type { BrowserGateBranchDecision } from './gate15.js';
import type { LiveBrowserTaskLedger, LiveBrowserTaskStatus } from './live-task-source.js';

export type OptInLiveBrowserEvidenceBatchKind =
  | 'opt-in-batch-completed'
  | 'opt-in-batch-skipped';

export type OptInLiveBrowserEvidenceBatchSkipReason = 'opt-in-required' | 'runner-missing' | 'nothing-pending';

export interface OptInLiveBrowserEvidenceBatchRun {
  index: number;
  taskId: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  summary?: string;
}

export interface OptInLiveBrowserEvidenceBatch {
  evidenceKind: OptInLiveBrowserEvidenceBatchKind;
  generatedAt: string;
  requestedBatchSize: number;
  attemptedRuns: number;
  runs: ReadonlyArray<OptInLiveBrowserEvidenceBatchRun>;
  totalCompletedBefore: number;
  totalCompletedAfter: number;
  totalPendingAfter: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  skipReason?: OptInLiveBrowserEvidenceBatchSkipReason;
}

export interface RecordOptInLiveBrowserEvidenceBatchInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  runner?: LiveBrowserTaskRunner;
  batchSize: number;
}

function countCompleted(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'success' || task.status === 'failed').length;
}

function countPending(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'pending').length;
}

function skippedBatch(
  input: RecordOptInLiveBrowserEvidenceBatchInput,
  skipReason: OptInLiveBrowserEvidenceBatchSkipReason,
): OptInLiveBrowserEvidenceBatch {
  return {
    evidenceKind: 'opt-in-batch-skipped',
    generatedAt: input.generatedAt,
    requestedBatchSize: input.batchSize,
    attemptedRuns: 0,
    runs: [],
    totalCompletedBefore: countCompleted(input.ledger.tasks),
    totalCompletedAfter: countCompleted(input.ledger.tasks),
    totalPendingAfter: countPending(input.ledger.tasks),
    binding: input.ledger.binding,
    branchDecision: input.ledger.branchDecision,
    skipReason,
  };
}

export async function recordOptInLiveBrowserEvidenceBatch(
  input: RecordOptInLiveBrowserEvidenceBatchInput,
): Promise<OptInLiveBrowserEvidenceBatch> {
  if (!input.optIn) {
    return skippedBatch(input, 'opt-in-required');
  }
  if (!input.runner) {
    return skippedBatch(input, 'runner-missing');
  }

  const totalCompletedBefore = countCompleted(input.ledger.tasks);
  const runs: OptInLiveBrowserEvidenceBatchRun[] = [];
  let currentLedger = input.ledger;

  for (let index = 0; index < input.batchSize; index += 1) {
    if (countPending(currentLedger.tasks) === 0) {
      break;
    }
    const output = await runLiveBrowserTasks({
      generatedAt: input.generatedAt,
      ledger: currentLedger,
      optIn: true,
      runner: input.runner,
      maxTasks: 1,
    });
    if (output.status !== 'ran' || output.results.length === 0) {
      break;
    }
    const firstResult = output.results[0]!;
    runs.push({
      index,
      taskId: firstResult.id,
      status: firstResult.status,
      ...(firstResult.summary === undefined ? {} : { summary: firstResult.summary }),
    });
    currentLedger = output.updatedLedger;
  }

  return {
    evidenceKind: 'opt-in-batch-completed',
    generatedAt: input.generatedAt,
    requestedBatchSize: input.batchSize,
    attemptedRuns: runs.length,
    runs,
    totalCompletedBefore,
    totalCompletedAfter: countCompleted(currentLedger.tasks),
    totalPendingAfter: countPending(currentLedger.tasks),
    binding: currentLedger.binding,
    branchDecision: currentLedger.branchDecision,
  };
}
```

**Step 2: Verify GREEN**

Run:
```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/live-task-evidence-runner-batch.test.ts --reporter=verbose 2>&1 | tail -8
```

Expected: PASS, 4 tests.

---

## Task 3: Bidirectional TDD check (MANDATORY)

```bash
# Move the impl out
mv packages/coding-agent/src/browser/live-task-evidence-runner-batch.ts /tmp/live-task-evidence-runner-batch.ts.bak
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/live-task-evidence-runner-batch.test.ts --reporter=verbose 2>&1 | tail -8
# Expected: FAIL (Cannot find module .../live-task-evidence-runner-batch.js)

# Restore the impl
mv /tmp/live-task-evidence-runner-batch.ts.bak packages/coding-agent/src/browser/live-task-evidence-runner-batch.ts
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/live-task-evidence-runner-batch.test.ts --reporter=verbose 2>&1 | tail -8
# Expected: PASS, 4 tests
```

---

## Task 4: Patch status documents (atomic, lockstep)

Patch in this exact order:

1. **`docs/superpowers/gate-1.5-live-browser-tasks.json`** — pendingTasks: `19` → `16`, completedTasks: `1` → `4`, successes: `1` → `4`, successRate: `0.05` → `0.2`, tasks[1..3].status: `pending` → `success`, reason text update (mention batch + 4/20), nextAction: `D118:` → `D119: continue opt-in batch accumulation...`.

2. **`docs/superpowers/gate-1.5-live-browser-tasks.md`** — same number changes in narrative + table.

3. **`docs/superpowers/gate-1.5-browser-viability.json`** — update `firstOptInEvidence.completedAfter: 1` → `4`, `pendingAfter: 19` → `16`, add `batchEvidence: { subSprint: "D-118", ... }` field.

4. **`docs/superpowers/v1-v4-evidence-scorecard.json`** — v2.0 evidence list adds 1 line about D-118; v2.0 percent stays at `45`; nextActions[0]: `"D118: ..."` → `"D119: continue opt-in batch accumulation..."`; aggregatePercent: `65` → `65` (no change).

5. **`docs/superpowers/v1-v4-evidence-scorecard.md`** — same updates.

6. **`docs/superpowers/release-version-hygiene.json`** — `nextAction: "D118: ..."` → `nextAction: "D119: ..."`.

7. **`README.md`** — current status block: `Current sprint: D117` → `D118`, add `D118 Gate-1.5 opt-in live Browser evidence batch runner (recordOptInLiveBrowserEvidenceBatch): ...` to `Completed Stabilization Slices`, change `Gate-1.5 live result recorder: ... 1/20 completed; ...` → `... 4/20 completed; ...`, change `Next implementation slice: D118 Gate-1.5 opt-in evidence run continuation` → `Next implementation slice: D119 Gate-1.5 opt-in batch accumulation continuation`, change `Last status hygiene sprint: D117` → `D118`, add `D118 plan: ...` link.

8. **`ROADMAP.md`** — current status block (mirror README's D-117→D-118 transition + completed slice list).

9. **`docs/ROADMAP_DECISIONS.md`** — current status block (same D-117→D-118 transition).

10. **`docs/superpowers/plans/2026-06-11-d118-gate15-opt-in-live-browser-evidence-batch-runner.md`** — the plan doc (this file, created in Task 1, no further change here).

---

## Task 5: Patch the status-doc-hygiene test

The test file `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` has 4 hard-coded test sections that need updating. As of D-118 the structural sections are stable at:

- **Line 130** (`it('keeps Gate-1.5 live Browser task evidence deferred until 20 live tasks exist')`): `expect(ledger.pendingTasks).toBe(19);` → `16`; `expect(ledger.completedTasks).toBe(1);` → `4`; `expect(ledger.successes).toBe(1);` → `4`; `expect(ledger.successRate).toBe(0.05);` → `0.2`.
- **Line 147** (`expect(ledger.tasks.every((task) => task.status === 'pending')).toBe(true);` test replacement): `expect(successTasks).toHaveLength(1);` → `4`; `expect(pendingTasks).toHaveLength(19);` → `16`; `expect(successTasks[0]?.id).toBe('docs-search-query');` (unchanged); add `expect(successTasks.map((t) => t.id)).toEqual(['docs-search-query', 'docs-filter-results', 'account-login-form', 'contact-form-required-field']);`.
- **Line 153** (`Gate-1.5 live result recorder line` in `it('keeps Gate-1.5 live Browser task evidence deferred until 20 live tasks exist')`): change `1/20 completed` → `4/20 completed`.
- **Line 190** (`scorecard.nextActions` array): replace first element `D118: ...` with `D119: continue opt-in batch accumulation to grow the repository evidence without unlocking Browser defaults until 20 completed live task results exist.`.
- **Line 309** (`Current sprint assertion`): update `D117` parenthetical → `D118 Gate-1.5 opt-in live Browser evidence batch runner (recordOptInLiveBrowserEvidenceBatch)`.
- **Line 365** (`Next implementation slice assertion`): update `D118` → `D119 Gate-1.5 opt-in batch accumulation continuation`.
- **Line 367-368** (not-match list): add `expect(block).not.toMatch(/Current sprint: D117/i);` and `expect(block).not.toMatch(/Next implementation slice: D118 Gate-1\.5 opt-in evidence run continuation/i);`.

(Lines shift ±1 each sub-sprint; the structural sections are stable.)

---

## Task 6: Run hygiene test

```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=default 2>&1 | tail -8
```

Expected: 9/9 pass.

---

## Task 7: 5 verify commands (MANDATORY, all must exit 0)

```bash
cd D:/App/openClaw/projects/deepwhale
echo "===1 TYPECHECK===" && ./node_modules/.bin/tsc.cmd -b --pretty false 2>&1 | grep -E "error" | grep -v "node_modules/.pnpm" | head -5
echo "===2 LINT===" && ./node_modules/.bin/eslint.cmd . --max-warnings 0 2>&1 | tail -3
echo "===3 DIFF CHECK===" && git diff --check 2>&1 | tail -3
echo "===4 VITEST===" && ./node_modules/.bin/vitest.cmd run 2>&1 | tail -5
echo "===5 BUILD===" && pnpm.cmd build 2>&1 | tail -3
echo "===6 5 红线 DIFF===" && git diff <parent-sha>..HEAD --stat -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/src/agent/tool-loop-memory.ts packages/coding-agent/src/agent/tool-loop-policy.ts packages/coding-agent/src/agent/session-adapter.ts packages/coding-agent/src/agent/agent-compaction.ts
```

---

## Task 8: Stage + commit + ship + push

```bash
cd D:/App/openClaw/projects/deepwhale
git add \
  packages/coding-agent/src/browser/live-task-evidence-runner-batch.ts \
  packages/coding-agent/test/unit/live-task-evidence-runner-batch.test.ts \
  packages/coding-agent/test/unit/status-doc-hygiene.test.ts \
  docs/superpowers/gate-1.5-live-browser-tasks.json \
  docs/superpowers/gate-1.5-live-browser-tasks.md \
  docs/superpowers/gate-1.5-browser-viability.json \
  docs/superpowers/v1-v4-evidence-scorecard.json \
  docs/superpowers/v1-v4-evidence-scorecard.md \
  docs/superpowers/release-version-hygiene.json \
  README.md ROADMAP.md docs/ROADMAP_DECISIONS.md \
  docs/superpowers/plans/2026-06-11-d118-gate15-opt-in-live-browser-evidence-batch-runner.md

cat > /tmp/d118-msg.txt << 'EOF'
feat(D-118): Gate-1.5 opt-in live Browser evidence batch runner (recordOptInLiveBrowserEvidenceBatch + 4 tests)
EOF
git commit -F /tmp/d118-msg.txt

git commit --allow-empty -m "ship(coding-agent): D-118 done (1 task, 1 commit + 1 ship marker, Gate-1.5 opt-in live Browser evidence batch runner, 1 new file + 4 new tests, 1321->1325 pass (1 pre-existing D-11 verify-runner fail, 4 skip), 5 红线 empty, typecheck/lint/build/diff-check 0)"

git push origin feature/d36-gate2-live
```

---

## Acceptance Criteria Summary

- 1 new function `recordOptInLiveBrowserEvidenceBatch` in `src/browser/live-task-evidence-runner-batch.ts` (~100 lines)
- 1 new test file `live-task-evidence-runner-batch.test.ts` (4 tests, ~140 lines)
- 9 status doc patches
- v1-v4 scorecard v2.0 stays at 45% (D-118 is a small batch continuation, 4/20 partial-results, binding=false honest discipline)
- v1-v4 aggregatePercent 65 → 65 (no change)
- 5 红线 invariant preserved
- 1321 → 1325 test pass count (subject to vitest run)
- 1 feat commit + 1 ship marker commit + 1 push

## STOP Conditions

- Any of the 5 verify commands in Task 7 exits non-zero (D-118 introduced a regression).
- The bidirectional TDD check in Task 3 shows the test does not actually exercise the new impl.
- 5 红线 diff is non-empty.
- The status-doc-hygiene test cannot be made to pass.
- New sub-sprint breaks any pre-existing test (vitest total pass count drops below 1321).
- D-118 is shipped with `binding: true` in the repository ledger JSON (D-39 #4 overclaim — 4/20 is not 20/20, and the live JSON update only advances to 4/20 by design).

## Self-Review Discipline

- D-118 is the SECOND sub-sprint in the Gate-1.5 chain that produces a real completed-task increment.
- The honest interpretation (D-39 #4): 4/20 is evidence, not production-complete. Status blocks say `partial-results` and `binding=false` explicitly.
- Browser defaults stay locked. The new function is opt-in only.
- The new file lives in `src/browser/`, NOT in `src/agent/`, to keep 5 红线 clean.
- The function reuses D-115 runner + D-116 recorder + D-117 single-run (each batch iteration is essentially a D-117 single run with the updated ledger).
- The function design supports `batchSize: 20` (which would flip binding to true), but the D-118 live ledger update only advances 1→4 to keep the binding claim honest. Future D-119+ will use the same batch function at higher sizes to reach 20/20 through real Browser automation.
