import { describe, expect, it } from 'vitest';
import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskCandidate,
} from '../../src/browser/live-task-source.js';
import { runLiveBrowserTasks } from '../../src/browser/live-task-runner.js';

const tasks: LiveBrowserTaskCandidate[] = [
  {
    id: 'docs-search',
    source: 'test',
    url: 'https://example.test/docs',
    goal: 'Search docs',
    requiredCapabilities: ['browser.navigate', 'browser.type'],
  },
  {
    id: 'cart-add',
    source: 'test',
    url: 'https://example.test/cart',
    goal: 'Add to cart',
    requiredCapabilities: ['browser.navigate', 'browser.click'],
  },
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
      runner: async (task) => ({
        status: task.id === 'docs-search' ? 'success' : 'failed',
        summary: `ran ${task.id}`,
      }),
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
