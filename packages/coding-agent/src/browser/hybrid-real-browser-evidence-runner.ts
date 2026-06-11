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

export type HybridJsAction = 'fill-search-input' | 'click-element' | 'extract-text';

export interface HybridJsRunnerResult {
  action: HybridJsAction;
  url: string;
  navigated: boolean;
  interactedElement: string | null;
  inputValue: string | null;
  pageTitle: string | null;
  ms: number;
  error: string | null;
}

export type HybridJsRunnerFn = (url: string, action: HybridJsAction) => Promise<HybridJsRunnerResult>;

export type HybridEvidenceKind = 'hybrid-browser-evidence' | 'hybrid-browser-evidence-skipped';

export type HybridSkipReason =
  | 'opt-in-required'
  | 'js-runner-missing'
  | 'no-task-mode-mapping'
  | 'no-real-url-mapping'
  | 'nothing-pending';

export type HybridTaskMode = 'http' | 'js';

export type HybridRunResult =
  | { kind: 'fetch'; fetchResult: RealBrowserFetchResult }
  | { kind: 'js'; jsResult: HybridJsRunnerResult };

export interface HybridRun {
  index: number;
  taskId: string;
  mode: HybridTaskMode;
  url: string;
  status: Extract<LiveBrowserTaskStatus, 'success' | 'failed'>;
  result: HybridRunResult;
}

export interface RecordHybridRealBrowserEvidenceInput {
  generatedAt: string;
  ledger: LiveBrowserTaskLedger;
  optIn: boolean;
  taskModes: Readonly<Record<string, HybridTaskMode>>;
  realUrls: Readonly<Record<string, string>>;
  fetchFn: RealBrowserFetchFn;
  jsRunnerFn?: HybridJsRunnerFn;
}

export interface HybridRealBrowserEvidence {
  evidenceKind: HybridEvidenceKind;
  generatedAt: string;
  attemptedRuns: number;
  runs: ReadonlyArray<HybridRun>;
  totalCompletedBefore: number;
  totalCompletedAfter: number;
  totalPendingAfter: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  skipReason?: HybridSkipReason;
}

function countCompleted(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'success' || task.status === 'failed').length;
}

function countPending(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter((task) => task.status === 'pending').length;
}

function skipped(
  input: RecordHybridRealBrowserEvidenceInput,
  skipReason: HybridSkipReason,
  currentLedger: LiveBrowserTaskLedger,
): HybridRealBrowserEvidence {
  return {
    evidenceKind: 'hybrid-browser-evidence-skipped',
    generatedAt: input.generatedAt,
    attemptedRuns: 0,
    runs: [],
    totalCompletedBefore: countCompleted(currentLedger.tasks),
    totalCompletedAfter: countCompleted(currentLedger.tasks),
    totalPendingAfter: countPending(currentLedger.tasks),
    binding: currentLedger.binding,
    branchDecision: currentLedger.branchDecision,
    skipReason,
  };
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

export async function recordHybridRealBrowserEvidence(
  input: RecordHybridRealBrowserEvidenceInput,
): Promise<HybridRealBrowserEvidence> {
  if (!input.optIn) {
    return skipped(input, 'opt-in-required', input.ledger);
  }
  if (Object.keys(input.taskModes).length === 0) {
    return skipped(input, 'no-task-mode-mapping', input.ledger);
  }

  const totalCompletedBefore = countCompleted(input.ledger.tasks);
  const runs: HybridRun[] = [];
  let currentLedger = input.ledger;
  const processedTaskIds = new Set<string>();

  for (let index = 0; index < 1000; index += 1) {
    if (countPending(currentLedger.tasks) === 0) {
      break;
    }
    if (processedTaskIds.size >= Object.keys(input.taskModes).length) {
      break;
    }
    const pendingTask = currentLedger.tasks.find(
      (task) => task.status === 'pending' && !processedTaskIds.has(task.id),
    );
    if (!pendingTask) {
      break;
    }
    processedTaskIds.add(pendingTask.id);
    const mode = input.taskModes[pendingTask.id];
    if (!mode) {
      return skipped(input, 'no-task-mode-mapping', currentLedger);
    }
    const realUrl = input.realUrls[pendingTask.id];
    if (!realUrl) {
      return skipped(input, 'no-real-url-mapping', currentLedger);
    }
    if (mode === 'js' && !input.jsRunnerFn) {
      return skipped(input, 'js-runner-missing', currentLedger);
    }

    let result: HybridRunResult;
    let newStatus: 'success' | 'failed';
    if (mode === 'http') {
      const fetchResult = await input.fetchFn(realUrl);
      newStatus = fetchResult.error === null ? 'success' : 'failed';
      result = { kind: 'fetch', fetchResult };
    } else {
      const jsRunnerFn = input.jsRunnerFn;
      if (!jsRunnerFn) {
        return skipped(input, 'js-runner-missing', currentLedger);
      }
      const jsResult = await jsRunnerFn(realUrl, 'fill-search-input');
      newStatus = jsResult.error === null ? 'success' : 'failed';
      result = { kind: 'js', jsResult };
    }
    runs.push({ index, taskId: pendingTask.id, mode, url: realUrl, status: newStatus, result });
    currentLedger = updateLedgerTaskStatus(currentLedger, pendingTask.id, newStatus);
  }

  return {
    evidenceKind: 'hybrid-browser-evidence',
    generatedAt: input.generatedAt,
    attemptedRuns: runs.length,
    runs,
    totalCompletedBefore,
    totalCompletedAfter: countCompleted(currentLedger.tasks),
    totalPendingAfter: countPending(currentLedger.tasks),
    binding: currentLedger.binding,
    branchDecision: currentLedger.branchDecision,
  };
}
