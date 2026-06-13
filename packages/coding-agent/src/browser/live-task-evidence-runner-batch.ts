import { runLiveBrowserTasks, type LiveBrowserTaskRunner } from './live-task-runner.js';
import type { BrowserGateBranchDecision } from './gate15.js';
import type { LiveBrowserTaskLedger, LiveBrowserTaskStatus } from './live-task-source.js';

export type OptInLiveBrowserEvidenceBatchKind =
  | 'opt-in-batch-completed'
  | 'opt-in-batch-skipped';

export type OptInLiveBrowserEvidenceBatchSkipReason = 'opt-in-required' | 'runner-missing' | 'nothing-pending';

export interface OptInLiveBrowserEvidenceBatchRun {
  index: number;
  taskId: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  summary?: string;
}

export interface OptInLiveBrowserEvidenceBatch {
  evidenceKind: OptInLiveBrowserEvidenceBatchKind;
  generatedAt: string;
  requestedBatchSize: number;
  attemptedRuns: number;
  runs: ReadonlyArray<OptInLiveBrowserEvidenceBatchRun>;
  totalCompletedBefore: number;
  totalCompletedAfter: number;
  totalPendingAfter: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  skipReason?: OptInLiveBrowserEvidenceBatchSkipReason;
}

export interface RecordOptInLiveBrowserEvidenceBatchInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  runner?: LiveBrowserTaskRunner;
  batchSize: number;
}

function countCompleted(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'success' || task.status === 'failed').length;
}

function countPending(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'pending').length;
}

function skippedBatch(
  input: RecordOptInLiveBrowserEvidenceBatchInput,
  skipReason: OptInLiveBrowserEvidenceBatchSkipReason,
): OptInLiveBrowserEvidenceBatch {
  return {
    evidenceKind: 'opt-in-batch-skipped',
    generatedAt: input.generatedAt,
    requestedBatchSize: input.batchSize,
    attemptedRuns: 0,
    runs: [],
    totalCompletedBefore: countCompleted(input.ledger.tasks),
    totalCompletedAfter: countCompleted(input.ledger.tasks),
    totalPendingAfter: countPending(input.ledger.tasks),
    binding: input.ledger.binding,
    branchDecision: input.ledger.branchDecision,
    skipReason,
  };
}

export async function recordOptInLiveBrowserEvidenceBatch(
  input: RecordOptInLiveBrowserEvidenceBatchInput,
): Promise<OptInLiveBrowserEvidenceBatch> {
  if (!input.optIn) {
    return skippedBatch(input, 'opt-in-required');
  }
  if (!input.runner) {
    return skippedBatch(input, 'runner-missing');
  }

  const totalCompletedBefore = countCompleted(input.ledger.tasks);
  const runs: OptInLiveBrowserEvidenceBatchRun[] = [];
  let currentLedger = input.ledger;

  for (let index = 0; index < input.batchSize; index += 1) {
    if (countPending(currentLedger.tasks) === 0) {
      break;
    }
    const output = await runLiveBrowserTasks({
      generatedAt: input.generatedAt,
      ledger: currentLedger,
      optIn: true,
      runner: input.runner,
      maxTasks: 1,
    });
    if (output.status !== 'ran' || output.results.length === 0) {
      break;
    }
    const firstResult = output.results[0]!;
    runs.push({
      index,
      taskId: firstResult.id,
      status: firstResult.status,
      ...(firstResult.summary === undefined ? {} : { summary: firstResult.summary }),
    });
    currentLedger = output.updatedLedger;
  }

  return {
    evidenceKind: 'opt-in-batch-completed',
    generatedAt: input.generatedAt,
    requestedBatchSize: input.batchSize,
    attemptedRuns: runs.length,
    runs,
    totalCompletedBefore,
    totalCompletedAfter: countCompleted(currentLedger.tasks),
    totalPendingAfter: countPending(currentLedger.tasks),
    binding: currentLedger.binding,
    branchDecision: currentLedger.branchDecision,
  };
}
