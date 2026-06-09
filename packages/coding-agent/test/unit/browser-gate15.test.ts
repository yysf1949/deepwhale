import { describe, expect, it } from 'vitest';
import { evaluateBrowserGate15, type BrowserTask } from '../../src/browser/gate15.js';

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
});
