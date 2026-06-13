import { describe, expect, it } from 'vitest';
import { buildBrowserGate15Report, evaluateBrowserGate15, type BrowserTask } from '../../src/browser/gate15.js';

function makeBrowserTasks(successes: number, failures: number): BrowserTask[] {
  const tasks: BrowserTask[] = [];
  for (let i = 0; i < successes; i++) tasks.push({ id: `s-${i + 1}`, status: 'success' });
  for (let i = 0; i < failures; i++) tasks.push({ id: `f-${i + 1}`, status: 'failed' });
  return tasks;
}

describe('browser viability gate', () => {
  it('maps success rate to roadmap branch decisions', () => {
    expect(evaluateBrowserGate15(makeBrowserTasks(16, 4)).decision).toBe('continue');
    expect(evaluateBrowserGate15(makeBrowserTasks(10, 10)).decision).toBe('freeze-enhancement');
    expect(evaluateBrowserGate15(makeBrowserTasks(9, 11)).decision).toBe('minimal-runtime');
  });

  it('keeps fixture dry-run evidence advisory even when the algorithmic decision is continue', () => {
    const report = buildBrowserGate15Report({
      tasks: makeBrowserTasks(16, 4),
      evidenceKind: 'fixture-dry-run',
    });

    expect(report.decision).toBe('continue');
    expect(report.successRate).toBe(0.8);
    expect(report.evidenceKind).toBe('fixture-dry-run');
    expect(report.binding).toBe(false);
    expect(report.branchDecision).toBe('defer-live-evidence');
    expect(report.requiredLiveTasks).toBe(20);
    expect(report.interpretation).toContain('advisory');
    expect(report.interpretation).toContain('20 live browser tasks');
  });

  it('allows binding Browser branch decisions only for live evidence with at least 20 tasks', () => {
    expect(
      buildBrowserGate15Report({
        tasks: makeBrowserTasks(16, 4),
        evidenceKind: 'live-browser',
      }).branchDecision,
    ).toBe('continue-browser-enhancement');

    expect(
      buildBrowserGate15Report({
        tasks: makeBrowserTasks(10, 10),
        evidenceKind: 'live-browser',
      }).branchDecision,
    ).toBe('freeze-browser-enhancement');

    expect(
      buildBrowserGate15Report({
        tasks: makeBrowserTasks(9, 11),
        evidenceKind: 'live-browser',
      }).branchDecision,
    ).toBe('minimal-browser-runtime');

    const undersized = buildBrowserGate15Report({
      tasks: makeBrowserTasks(10, 0),
      evidenceKind: 'live-browser',
    });
    expect(undersized.binding).toBe(false);
    expect(undersized.branchDecision).toBe('defer-live-evidence');
  });
});
