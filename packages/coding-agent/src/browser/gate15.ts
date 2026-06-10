export interface BrowserTask {
  id: string;
  status: 'success' | 'failed';
}

export type BrowserGateDecision = 'continue' | 'freeze-enhancement' | 'minimal-runtime';
export type BrowserGateEvidenceKind = 'fixture-dry-run' | 'live-browser';
export type BrowserGateBranchDecision =
  | 'continue-browser-enhancement'
  | 'freeze-browser-enhancement'
  | 'minimal-browser-runtime'
  | 'defer-live-evidence';

export interface BrowserGateResult {
  decision: BrowserGateDecision;
  successRate: number;
  successes: number;
  failures: number;
}

export interface BrowserGateReportInput {
  tasks: ReadonlyArray<BrowserTask>;
  evidenceKind: BrowserGateEvidenceKind;
  requiredLiveTasks?: number;
}

export interface BrowserGateReport extends BrowserGateResult {
  evidenceKind: BrowserGateEvidenceKind;
  requiredLiveTasks: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  interpretation: string;
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

export function buildBrowserGate15Report(input: BrowserGateReportInput): BrowserGateReport {
  const result = evaluateBrowserGate15(input.tasks);
  const requiredLiveTasks = input.requiredLiveTasks ?? 20;
  const total = result.successes + result.failures;
  const hasBindingEvidence = input.evidenceKind === 'live-browser' && total >= requiredLiveTasks;

  if (!hasBindingEvidence) {
    return {
      ...result,
      evidenceKind: input.evidenceKind,
      requiredLiveTasks,
      binding: false,
      branchDecision: 'defer-live-evidence',
      interpretation:
        input.evidenceKind === 'fixture-dry-run'
          ? 'Fixture dry-run result is advisory only; collect 20 live browser tasks before changing the Browser roadmap branch.'
          : `Live browser evidence has ${total} tasks; collect at least ${requiredLiveTasks} tasks before changing the Browser roadmap branch.`,
    };
  }

  const branchDecision = branchDecisionFor(result.decision);
  return {
    ...result,
    evidenceKind: input.evidenceKind,
    requiredLiveTasks,
    binding: true,
    branchDecision,
    interpretation: `Live browser evidence is binding for Gate-1.5 and maps to ${branchDecision}.`,
  };
}

function branchDecisionFor(decision: BrowserGateDecision): BrowserGateBranchDecision {
  if (decision === 'continue') return 'continue-browser-enhancement';
  if (decision === 'freeze-enhancement') return 'freeze-browser-enhancement';
  return 'minimal-browser-runtime';
}
