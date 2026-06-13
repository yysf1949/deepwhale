import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import { recordOptInLiveBrowserEvidence } from '../../src/browser/live-task-evidence-runner.js';
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

describe('Gate-1.5 opt-in live Browser evidence runner', () => {
  it('records the first opt-in run end-to-end and locks binding at false', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordOptInLiveBrowserEvidence({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
      runner: STUB_SUCCESS_RUNNER,
      maxTasks: 1,
    });

    expect(evidence.evidenceKind).toBe('opt-in-first-run');
    expect(evidence.completedBefore).toBe(0);
    expect(evidence.completedAfter).toBe(1);
    expect(evidence.pendingAfter).toBe(19);
    expect(evidence.taskId).toBe('task-1');
    expect(evidence.recordedRunStatus).toBe('ran');
    expect(evidence.binding).toBe(false);
    expect(evidence.branchDecision).toBe('defer-live-evidence');
  });

  it('skips when optIn is false and surfaces skipped-opt-in-required', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordOptInLiveBrowserEvidence({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: false,
      runner: STUB_SUCCESS_RUNNER,
    });

    expect(evidence.evidenceKind).toBe('opt-in-skipped');
    expect(evidence.completedBefore).toBe(0);
    expect(evidence.completedAfter).toBe(0);
    expect(evidence.pendingAfter).toBe(20);
    expect(evidence.taskId).toBeNull();
    expect(evidence.recordedRunStatus).toBe('skipped-opt-in-required');
    expect(evidence.binding).toBe(false);
  });

  it('skips when optIn is true but no runner is injected', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordOptInLiveBrowserEvidence({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
    });

    expect(evidence.evidenceKind).toBe('opt-in-skipped');
    expect(evidence.completedAfter).toBe(0);
    expect(evidence.recordedRunStatus).toBe('skipped-runner-missing');
  });

  it('records multiple completed tasks when maxTasks exceeds 1 and reports partial-results evidence kind', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordOptInLiveBrowserEvidence({
      generatedAt: '2026-06-11T01:00:00.000Z',
      ledger,
      optIn: true,
      runner: STUB_SUCCESS_RUNNER,
      maxTasks: 3,
    });

    expect(evidence.evidenceKind).toBe('opt-in-first-run');
    expect(evidence.completedAfter).toBe(3);
    expect(evidence.pendingAfter).toBe(17);
    expect(evidence.taskId).toBe('task-1');
    expect(evidence.binding).toBe(false);
    expect(evidence.branchDecision).toBe('defer-live-evidence');
  });
});
