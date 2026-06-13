import { runLiveBrowserTasks, type LiveBrowserTaskRunner } from './live-task-runner.js';
import type { BrowserGateBranchDecision } from './gate15.js';
import type { LiveBrowserTaskLedger } from './live-task-source.js';

export type OptInLiveBrowserEvidenceKind =
  | 'opt-in-first-run'
  | 'opt-in-partial-results'
  | 'opt-in-skipped';

export interface OptInLiveBrowserEvidence {
  evidenceKind: OptInLiveBrowserEvidenceKind;
  generatedAt: string;
  taskId: string | null;
  completedBefore: number;
  completedAfter: number;
  pendingAfter: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  recordedRunStatus: 'ran' | 'skipped-opt-in-required' | 'skipped-runner-missing' | 'nothing-pending';
}

export interface RecordOptInLiveBrowserEvidenceInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  runner?: LiveBrowserTaskRunner;
  maxTasks?: number;
}

function countCompleted(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'success' || task.status === 'failed').length;
}

function countPending(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'pending').length;
}

export async function recordOptInLiveBrowserEvidence(
  input: RecordOptInLiveBrowserEvidenceInput,
): Promise<OptInLiveBrowserEvidence> {
  const completedBefore = countCompleted(input.ledger.tasks);

  const output = await runLiveBrowserTasks({
    generatedAt: input.generatedAt,
    ledger: input.ledger,
    optIn: input.optIn,
    ...(input.runner === undefined ? {} : { runner: input.runner }),
    ...(input.maxTasks === undefined ? {} : { maxTasks: input.maxTasks }),
  });

  const completedAfter = countCompleted(output.updatedLedger.tasks);
  const pendingAfter = countPending(output.updatedLedger.tasks);

  let evidenceKind: OptInLiveBrowserEvidenceKind;
  if (output.status !== 'ran') {
    evidenceKind = 'opt-in-skipped';
  } else if (completedBefore === 0 && completedAfter > 0) {
    evidenceKind = 'opt-in-first-run';
  } else {
    evidenceKind = 'opt-in-partial-results';
  }

  return {
    evidenceKind,
    generatedAt: input.generatedAt,
    taskId: output.results[0]?.id ?? null,
    completedBefore,
    completedAfter,
    pendingAfter,
    binding: output.updatedLedger.binding,
    branchDecision: output.updatedLedger.branchDecision,
    recordedRunStatus: output.status,
  };
}
