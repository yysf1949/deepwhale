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
