import type { BrowserGateBranchDecision } from './gate15.js';
import type { LiveBrowserTaskLedger, LiveBrowserTaskStatus } from './live-task-source.js';

export interface RealBrowserFetchResult {
  status: number;
  contentType: string | null;
  bodyLen: number;
  title: string | null;
  finalUrl: string;
  ms: number;
  error: string | null;
}

export type RealBrowserFetchFn = (url: string) => Promise<RealBrowserFetchResult>;

export type RealBrowserAdapterEvidenceKind = 'real-browser-fetch' | 'real-browser-fetch-skipped';

export type RealBrowserAdapterSkipReason = 'opt-in-required' | 'no-real-url-mapping' | 'nothing-pending';

export interface RealBrowserAdapterRun {
  index: number;
  taskId: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  url: string;
  result: RealBrowserFetchResult;
}

export interface RecordRealBrowserEvidenceInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  realUrls: Readonly<Record<string, string>>;
  fetchFn: RealBrowserFetchFn;
  batchSize: number;
}

export interface RealBrowserEvidence {
  evidenceKind: RealBrowserAdapterEvidenceKind;
  generatedAt: string;
  requestedBatchSize: number;
  attemptedRuns: number;
  runs: ReadonlyArray<RealBrowserAdapterRun>;
  totalCompletedBefore: number;
  totalCompletedAfter: number;
  totalPendingAfter: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  skipReason?: RealBrowserAdapterSkipReason;
}

function countCompleted(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'success' || task.status === 'failed').length;
}

function countPending(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'pending').length;
}

function skippedEvidence(
  input: RecordRealBrowserEvidenceInput,
  skipReason: RealBrowserAdapterSkipReason,
): RealBrowserEvidence {
  return {
    evidenceKind: 'real-browser-fetch-skipped',
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

export async function defaultRealBrowserFetchFn(url: string): Promise<RealBrowserFetchResult> {
  const t0 = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    const text = await response.text();
    const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      bodyLen: text.length,
      title: titleMatch?.[1]?.trim() ?? null,
      finalUrl: response.url,
      ms: Date.now() - t0,
      error: null,
    };
  } catch (err) {
    return {
      status: 0,
      contentType: null,
      bodyLen: 0,
      title: null,
      finalUrl: '',
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function updateLedgerTaskStatus(
  ledger: LiveBrowserTaskLedger,
  taskId: string,
  newStatus: 'success' | 'failed',
): LiveBrowserTaskLedger {
  const updatedTasks = ledger.tasks.map((task) =>
    task.id === taskId ? { ...task, status: newStatus } : task,
  );
  const completed = updatedTasks.filter((t) => t.status === 'success' || t.status === 'failed').length;
  const pending = updatedTasks.filter((t) => t.status === 'pending').length;
  const successes = updatedTasks.filter((t) => t.status === 'success').length;
  const failures = updatedTasks.filter((t) => t.status === 'failed').length;
  return {
    ...ledger,
    tasks: updatedTasks,
    completedTasks: completed,
    pendingTasks: pending,
    successes,
    failures,
    successRate: completed > 0 ? successes / completed : null,
  };
}

export async function recordRealBrowserEvidence(
  input: RecordRealBrowserEvidenceInput,
): Promise<RealBrowserEvidence> {
  if (!input.optIn) {
    return skippedEvidence(input, 'opt-in-required');
  }

  const totalCompletedBefore = countCompleted(input.ledger.tasks);
  const runs: RealBrowserAdapterRun[] = [];
  let currentLedger = input.ledger;

  for (let index = 0; index < input.batchSize; index += 1) {
    if (countPending(currentLedger.tasks) === 0) {
      break;
    }
    const pendingTask = currentLedger.tasks.find((task) => task.status === 'pending');
    if (!pendingTask) {
      break;
    }
    const realUrl = input.realUrls[pendingTask.id];
    if (!realUrl) {
      return skippedEvidence(
        { ...input, ledger: currentLedger },
        'no-real-url-mapping',
      );
    }
    const result = await input.fetchFn(realUrl);
    const newStatus: 'success' | 'failed' = result.error === null ? 'success' : 'failed';
    runs.push({
      index,
      taskId: pendingTask.id,
      status: newStatus,
      url: realUrl,
      result,
    });
    currentLedger = updateLedgerTaskStatus(currentLedger, pendingTask.id, newStatus);
  }

  return {
    evidenceKind: 'real-browser-fetch',
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
