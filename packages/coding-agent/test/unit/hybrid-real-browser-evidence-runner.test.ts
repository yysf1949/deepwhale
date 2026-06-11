import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import {
  recordHybridRealBrowserEvidence,
  type HybridJsRunnerFn,
  type RealBrowserFetchFn,
} from '../../src/browser/hybrid-real-browser-evidence-runner.js';

function makeTwentyTasks(): LiveBrowserTaskCandidate[] {
  return Array.from({ length: 20 }, (_, index): LiveBrowserTaskCandidate => ({
    id: `task-${index + 1}`,
    source: 'test',
    url: `https://example.test/${index + 1}`,
    goal: `Run task ${index + 1}`,
    requiredCapabilities: ['browser.navigate'],
  }));
}

function okFetch(): RealBrowserFetchFn {
  return async (url) => ({
    status: 200,
    contentType: 'text/html',
    bodyLen: 559,
    title: 'Example Domain',
    finalUrl: url,
    ms: 50,
    error: null,
  });
}

function okJsRunner(): HybridJsRunnerFn {
  return async (url, action) => ({
    action,
    url,
    navigated: true,
    interactedElement: 'input[name="q"]',
    inputValue: 'deepwhale d-120 hybrid test',
    pageTitle: 'Bing search',
    ms: 800,
    error: null,
  });
}

describe('Gate-1.5 hybrid real Browser evidence runner (HTTP + JS)', () => {
  it('records 2 HTTP fetches and 1 JS form interaction end-to-end', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {
        'task-1': 'http',
        'task-2': 'http',
        'task-3': 'js',
      },
      realUrls: {
        'task-1': 'https://example.com/',
        'task-2': 'https://example.org/',
        'task-3': 'https://www.bing.com/',
      },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence');
    expect(evidence.attemptedRuns).toBe(3);
    expect(evidence.runs.map((r) => r.taskId)).toEqual(['task-1', 'task-2', 'task-3']);
    expect(evidence.runs.filter((r) => r.mode === 'http')).toHaveLength(2);
    expect(evidence.runs.filter((r) => r.mode === 'js')).toHaveLength(1);
    expect(evidence.runs[0]?.result.kind).toBe('fetch');
    expect(evidence.runs[2]?.result.kind).toBe('js');
    if (evidence.runs[2]?.result.kind === 'js') {
      expect(evidence.runs[2].result.jsResult.inputValue).toBe('deepwhale d-120 hybrid test');
    }
    expect(evidence.totalCompletedBefore).toBe(0);
    expect(evidence.totalCompletedAfter).toBe(3);
    expect(evidence.totalPendingAfter).toBe(17);
    expect(evidence.binding).toBe(false);
  });

  it('skips the entire batch when optIn is false and surfaces opt-in-required', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: false,
      taskModes: { 'task-1': 'http' },
      realUrls: { 'task-1': 'https://example.com/' },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence-skipped');
    expect(evidence.skipReason).toBe('opt-in-required');
    expect(evidence.attemptedRuns).toBe(0);
  });

  it('skips when a JS task is requested but no jsRunnerFn is injected', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: { 'task-1': 'js' },
      realUrls: { 'task-1': 'https://www.bing.com/' },
      fetchFn: okFetch(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence-skipped');
    expect(evidence.skipReason).toBe('js-runner-missing');
    expect(evidence.attemptedRuns).toBe(0);
  });

  it('skips when the requested task has no mode mapping', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks(),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {},
      realUrls: { 'task-1': 'https://example.com/' },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence-skipped');
    expect(evidence.skipReason).toBe('no-task-mode-mapping');
    expect(evidence.attemptedRuns).toBe(0);
  });
});
