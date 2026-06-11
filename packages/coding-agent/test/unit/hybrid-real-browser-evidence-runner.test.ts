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

  it('records explicitly mapped non-contiguous pending tasks after prior evidence exists', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks().map((task, index) =>
        index < 6 ? { ...task, status: 'success' as const } : task,
      ),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T04:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {
        'task-7': 'http',
        'task-8': 'http',
        'task-17': 'js',
      },
      realUrls: {
        'task-7': 'https://example.com/',
        'task-8': 'https://www.iana.org/',
        'task-17': 'https://www.bing.com/',
      },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence');
    expect(evidence.attemptedRuns).toBe(3);
    expect(evidence.runs.map((run) => run.taskId)).toEqual(['task-7', 'task-8', 'task-17']);
    expect(evidence.totalCompletedBefore).toBe(6);
    expect(evidence.totalCompletedAfter).toBe(9);
    expect(evidence.totalPendingAfter).toBe(11);
    expect(evidence.binding).toBe(false);
    expect(evidence.branchDecision).toBe('defer-live-evidence');
  });

  it('passes task-specific JS actions to the injected JS runner', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks().map((task, index) =>
        index < 9 ? { ...task, status: 'success' as const } : task,
      ),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T05:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {
        'task-10': 'js',
        'task-11': 'js',
      },
      realUrls: {
        'task-10': 'https://example.com/dashboard',
        'task-11': 'https://example.com/admin/table',
      },
      jsActions: {
        'task-10': 'click-element',
        'task-11': 'extract-text',
      },
      fetchFn: okFetch(),
      jsRunnerFn: async (url, action) => ({
        action,
        url,
        navigated: true,
        interactedElement: action === 'click-element' ? 'button.close' : 'main',
        inputValue: null,
        pageTitle: action === 'click-element' ? 'Dashboard' : 'Table',
        ms: 120,
        error: null,
      }),
    });

    const jsActions = evidence.runs.map((run) =>
      run.result.kind === 'js' ? run.result.jsResult.action : null,
    );
    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence');
    expect(evidence.runs.map((run) => run.taskId)).toEqual(['task-10', 'task-11']);
    expect(jsActions).toEqual(['click-element', 'extract-text']);
    expect(evidence.totalCompletedBefore).toBe(9);
    expect(evidence.totalCompletedAfter).toBe(11);
    expect(evidence.totalPendingAfter).toBe(9);
    expect(evidence.binding).toBe(false);
  });

  it('returns a recomputed updated ledger when hybrid runs reach the binding threshold', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: makeTwentyTasks().map((task, index) =>
        index < 18 ? { ...task, status: 'success' as const } : task,
      ),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-11T06:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {
        'task-19': 'js',
        'task-20': 'js',
      },
      realUrls: {
        'task-19': 'https://example.com/dashboard',
        'task-20': 'https://example.com/admin/table',
      },
      jsActions: {
        'task-19': 'click-element',
        'task-20': 'extract-text',
      },
      fetchFn: okFetch(),
      jsRunnerFn: async (url, action) => ({
        action,
        url,
        navigated: true,
        interactedElement: action === 'click-element' ? 'button.close' : 'main',
        inputValue: null,
        pageTitle: action === 'click-element' ? 'Dashboard' : 'Table',
        ms: 120,
        error: null,
      }),
    });

    expect(evidence.evidenceKind).toBe('hybrid-browser-evidence');
    expect(evidence.runs.map((run) => run.taskId)).toEqual(['task-19', 'task-20']);
    expect(evidence.totalCompletedBefore).toBe(18);
    expect(evidence.totalCompletedAfter).toBe(20);
    expect(evidence.totalPendingAfter).toBe(0);
    expect(evidence.binding).toBe(true);
    expect(evidence.branchDecision).toBe('continue-browser-enhancement');
    expect(evidence.updatedLedger.completedTasks).toBe(20);
    expect(evidence.updatedLedger.pendingTasks).toBe(0);
    expect(evidence.updatedLedger.successRate).toBe(1);
    expect(evidence.updatedLedger.binding).toBe(true);
    expect(evidence.updatedLedger.branchDecision).toBe('continue-browser-enhancement');
    expect(evidence.updatedLedger.browserEnhancementUnlocked).toBe(true);
    expect(evidence.updatedLedger.status).toBe('ready-for-binding-decision');
  });
});
