import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskLedger,
  type LiveBrowserTaskStatus,
} from './live-task-source.js';

export interface LiveBrowserTaskResultRow {
  id: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
}

export type IgnoredLiveBrowserTaskResultReason = 'unknown-task' | 'duplicate-result';

export interface IgnoredLiveBrowserTaskResult {
  id: string;
  reason: IgnoredLiveBrowserTaskResultReason;
}

export interface RecordLiveBrowserTaskResultsInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  results: ReadonlyArray<LiveBrowserTaskResultRow>;
}

export interface RecordLiveBrowserTaskResultsOutput {
  status: 'recorded' | 'no-results';
  acceptedResults: number;
  ignoredResults: ReadonlyArray<IgnoredLiveBrowserTaskResult>;
  updatedLedger: LiveBrowserTaskLedger;
}

export function recordLiveBrowserTaskResults(
  input: RecordLiveBrowserTaskResultsInput,
): RecordLiveBrowserTaskResultsOutput {
  const knownTaskIds = new Set(input.ledger.tasks.map((task) => task.id));
  const acceptedById = new Map<string, LiveBrowserTaskResultRow['status']>();
  const ignoredResults: IgnoredLiveBrowserTaskResult[] = [];

  for (const result of input.results) {
    if (!knownTaskIds.has(result.id)) {
      ignoredResults.push({ id: result.id, reason: 'unknown-task' });
      continue;
    }
    if (acceptedById.has(result.id)) {
      ignoredResults.push({ id: result.id, reason: 'duplicate-result' });
      continue;
    }
    acceptedById.set(result.id, result.status);
  }

  return {
    status: acceptedById.size === 0 ? 'no-results' : 'recorded',
    acceptedResults: acceptedById.size,
    ignoredResults,
    updatedLedger: buildLiveBrowserTaskLedger({
      generatedAt: input.generatedAt,
      requiredTasks: input.ledger.requiredTasks,
      tasks: input.ledger.tasks.map((task) => ({
        ...task,
        status: acceptedById.get(task.id) ?? task.status,
      })),
    }),
  };
}
