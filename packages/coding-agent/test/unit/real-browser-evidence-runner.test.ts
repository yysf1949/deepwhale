import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import {
  recordRealBrowserEvidence,
  type RealBrowserFetchFn,
} from '../../src/browser/real-browser-evidence-runner.js';

function makeTwentyTasks(): LiveBrowserTaskCandidate[] {
  return Array.from({ length: 20 }, (_, index): LiveBrowserTaskCandidate => ({
    id: `task-${index + 1}`,
    source: 'test',
    url: `https://example.test/${index + 1}`,
    goal: `Run task ${index + 1}`,
    requiredCapabilities: ['browser.navigate'],
  }));
}

function okFetch(bodyLen = 559, title = 'Example Domain'): RealBrowserFetchFn {
  return async (url) => ({
    status: 200,
    contentType: 'text/html',
    bodyLen,
    title,
    finalUrl: url,
    ms: 50,
    error: null,
  });
}

function errFetch(message: string): RealBrowserFetchFn {
  return async () => ({
    status: 0,
    contentType: null,
    bodyLen: 0,
    title: null,
    finalUrl: '',
    ms: 0,
    error: message,
  });
}

describe('Gate-1.5 real HTTP Browser evidence adapter', () => {
  it('records 2 real fetches end-to-end and locks binding at false', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordRealBrowserEvidence({
      generatedAt: '2026-06-11T03:00:00.000Z',
      ledger,
      optIn: true,
      realUrls: {
        'task-1': 'https://example.com/',
        'task-2': 'https://example.org/',
      },
      fetchFn: okFetch(),
      batchSize: 2,
    });

    expect(evidence.evidenceKind).toBe('real-browser-fetch');
    expect(evidence.attemptedRuns).toBe(2);
    expect(evidence.runs.map((run) => run.taskId)).toEqual(['task-1', 'task-2']);
    expect(evidence.runs.every((run) => run.status === 'success')).toBe(true);
    expect(evidence.runs[0]?.result.status).toBe(200);
    expect(evidence.runs[0]?.result.title).toBe('Example Domain');
    expect(evidence.totalCompletedBefore).toBe(0);
    expect(evidence.totalCompletedAfter).toBe(2);
    expect(evidence.totalPendingAfter).toBe(18);
    expect(evidence.binding).toBe(false);
    expect(evidence.branchDecision).toBe('defer-live-evidence');
  });

  it('skips the batch when optIn is false and surfaces opt-in-required', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordRealBrowserEvidence({
      generatedAt: '2026-06-11T03:00:00.000Z',
      ledger,
      optIn: false,
      realUrls: { 'task-1': 'https://example.com/' },
      fetchFn: okFetch(),
      batchSize: 2,
    });

    expect(evidence.evidenceKind).toBe('real-browser-fetch-skipped');
    expect(evidence.skipReason).toBe('opt-in-required');
    expect(evidence.attemptedRuns).toBe(0);
    expect(evidence.totalCompletedAfter).toBe(0);
    expect(evidence.totalPendingAfter).toBe(20);
  });

  it('skips the batch when no real-URL mapping is provided', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordRealBrowserEvidence({
      generatedAt: '2026-06-11T03:00:00.000Z',
      ledger,
      optIn: true,
      realUrls: {},
      fetchFn: okFetch(),
      batchSize: 2,
    });

    expect(evidence.evidenceKind).toBe('real-browser-fetch-skipped');
    expect(evidence.skipReason).toBe('no-real-url-mapping');
    expect(evidence.attemptedRuns).toBe(0);
  });

  it('records a failed run when the fetch function returns an error', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordRealBrowserEvidence({
      generatedAt: '2026-06-11T03:00:00.000Z',
      ledger,
      optIn: true,
      realUrls: { 'task-1': 'https://unreachable.test.invalid/' },
      fetchFn: errFetch('ENOTFOUND'),
      batchSize: 1,
    });

    expect(evidence.evidenceKind).toBe('real-browser-fetch');
    expect(evidence.attemptedRuns).toBe(1);
    expect(evidence.runs[0]?.status).toBe('failed');
    expect(evidence.runs[0]?.result.error).toBe('ENOTFOUND');
    expect(evidence.totalCompletedAfter).toBe(1);
    expect(evidence.totalPendingAfter).toBe(19);
  });
});
