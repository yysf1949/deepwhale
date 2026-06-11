import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import { recordLiveBrowserTaskResults } from '../../src/browser/live-task-result-recorder.js';

const tasks: LiveBrowserTaskCandidate[] = [
  {
    id: 'docs-search',
    source: 'test',
    url: 'https://example.test/docs',
    goal: 'Search docs',
    requiredCapabilities: ['browser.navigate'],
  },
  {
    id: 'cart-add',
    source: 'test',
    url: 'https://example.test/cart',
    goal: 'Add to cart',
    requiredCapabilities: ['browser.click'],
  },
  {
    id: 'profile-edit',
    source: 'test',
    url: 'https://example.test/profile',
    goal: 'Edit profile',
    requiredCapabilities: ['browser.type'],
  },
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
    const twentyTasks = Array.from(
      { length: 20 },
      (_, index): LiveBrowserTaskCandidate => ({
        id: `task-${index + 1}`,
        source: 'test',
        url: `https://example.test/${index + 1}`,
        goal: `Run task ${index + 1}`,
        requiredCapabilities: ['browser.navigate'],
      }),
    );
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-11T00:00:00.000Z',
      tasks: twentyTasks,
    });

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
