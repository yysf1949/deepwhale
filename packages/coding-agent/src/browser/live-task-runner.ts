import {
  buildLiveBrowserTaskLedger,
  type LiveBrowserTaskLedger,
  type LiveBrowserTaskRow,
  type LiveBrowserTaskStatus,
} from './live-task-source.js';
import {
  recordLiveBrowserTaskResults,
  type IgnoredLiveBrowserTaskResult,
} from './live-task-result-recorder.js';

export interface LiveBrowserTaskRunResult {
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  summary?: string;
}

export type LiveBrowserTaskRunner = (task: LiveBrowserTaskRow) => Promise<LiveBrowserTaskRunResult>;

export type LiveBrowserTaskRunStatus =
  | 'skipped-opt-in-required'
  | 'skipped-runner-missing'
  | 'nothing-pending'
  | 'ran';

export interface RunLiveBrowserTasksInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  runner?: LiveBrowserTaskRunner;
  maxTasks?: number;
}

export interface LiveBrowserTaskRunRow {
  id: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  summary?: string;
}

export interface LiveBrowserTaskRunOutput {
  status: LiveBrowserTaskRunStatus;
  attemptedTasks: number;
  acceptedResults: number;
  ignoredResults: ReadonlyArray<IgnoredLiveBrowserTaskResult>;
  results: ReadonlyArray<LiveBrowserTaskRunRow>;
  updatedLedger: LiveBrowserTaskLedger;
}

export async function runLiveBrowserTasks(input: RunLiveBrowserTasksInput): Promise<LiveBrowserTaskRunOutput> {
  if (!input.optIn) {
    return skipped('skipped-opt-in-required', input);
  }
  if (!input.runner) {
    return skipped('skipped-runner-missing', input);
  }

  const pendingTasks = input.ledger.tasks.filter((task) => task.status === 'pending');
  const tasksToRun = input.maxTasks === undefined ? pendingTasks : pendingTasks.slice(0, Math.max(0, input.maxTasks));
  if (tasksToRun.length === 0) {
    return skipped('nothing-pending', input);
  }

  const results: LiveBrowserTaskRunRow[] = [];
  for (const task of tasksToRun) {
    const result = await input.runner(task);
    results.push({
      id: task.id,
      status: result.status,
      ...(result.summary === undefined ? {} : { summary: result.summary }),
    });
  }

  const recorded = recordLiveBrowserTaskResults({
    generatedAt: input.generatedAt,
    ledger: input.ledger,
    results,
  });

  return {
    status: 'ran',
    attemptedTasks: results.length,
    acceptedResults: recorded.acceptedResults,
    ignoredResults: recorded.ignoredResults,
    results,
    updatedLedger: recorded.updatedLedger,
  };
}

function skipped(status: Exclude<LiveBrowserTaskRunStatus, 'ran'>, input: RunLiveBrowserTasksInput): LiveBrowserTaskRunOutput {
  return {
    status,
    attemptedTasks: 0,
    acceptedResults: 0,
    ignoredResults: [],
    results: [],
    updatedLedger: buildLiveBrowserTaskLedger({
      generatedAt: input.generatedAt,
      requiredTasks: input.ledger.requiredTasks,
      tasks: input.ledger.tasks,
    }),
  };
}
