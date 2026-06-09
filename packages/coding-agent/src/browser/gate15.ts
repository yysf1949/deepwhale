export interface BrowserTask {
  id: string;
  status: 'success' | 'failed';
}

export type BrowserGateDecision = 'continue' | 'freeze-enhancement' | 'minimal-runtime';

export interface BrowserGateResult {
  decision: BrowserGateDecision;
  successRate: number;
  successes: number;
  failures: number;
}

export function evaluateBrowserGate15(tasks: ReadonlyArray<BrowserTask>): BrowserGateResult {
  const successes = tasks.filter((t) => t.status === 'success').length;
  const failures = tasks.filter((t) => t.status === 'failed').length;
  const total = successes + failures;
  if (total === 0) return { decision: 'minimal-runtime', successRate: 0, successes, failures };
  const successRate = successes / total;
  if (successRate >= 0.8) return { decision: 'continue', successRate, successes, failures };
  if (successRate >= 0.5) return { decision: 'freeze-enhancement', successRate, successes, failures };
  return { decision: 'minimal-runtime', successRate, successes, failures };
}
