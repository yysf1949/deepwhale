import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  completedBrowserTasksForGate15,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';

const baseTasks: LiveBrowserTaskCandidate[] = [
  {
    id: 'search-product',
    source: 'gate-1.5-seed',
    url: 'https://example.test/search',
    goal: 'Search for a product',
    requiredCapabilities: ['browser.navigate', 'browser.type', 'browser.click'],
  },
  {
    id: 'checkout-review',
    source: 'gate-1.5-seed',
    url: 'https://example.test/cart',
    goal: 'Review a checkout cart',
    requiredCapabilities: ['browser.navigate', 'browser.click'],
  },
  {
    id: 'search-product',
    source: 'duplicate',
    url: 'https://duplicate.test/search',
    goal: 'Duplicate should be ignored',
    requiredCapabilities: ['browser.navigate'],
  },
];

describe('Gate-1.5 live Browser task sourcing', () => {
  it('deduplicates candidate tasks and keeps pending tasks non-binding', () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: baseTasks,
    });

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
        {
          id: 'login-flow',
          source: 'gate-1.5-seed',
          url: 'https://example.test/login',
          goal: 'Log in with a test account',
          status: 'failed',
          requiredCapabilities: ['browser.navigate', 'browser.type', 'browser.click'],
        },
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
