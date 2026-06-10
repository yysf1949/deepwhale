import {
  buildBrowserGate15Report,
  type BrowserGateBranchDecision,
  type BrowserTask,
} from './gate15.js';
import type { BrowserCapability } from './runtime.js';

export type LiveBrowserTaskStatus = 'pending' | 'success' | 'failed';

export interface LiveBrowserTaskCandidate {
  id: string;
  source: string;
  url: string;
  goal: string;
  requiredCapabilities: ReadonlyArray<BrowserCapability>;
  status?: LiveBrowserTaskStatus;
}

export interface LiveBrowserTaskRow {
  id: string;
  source: string;
  url: string;
  goal: string;
  requiredCapabilities: ReadonlyArray<BrowserCapability>;
  status: LiveBrowserTaskStatus;
}

export interface BuildLiveBrowserTaskLedgerInput {
  generatedAt: string;
  tasks: ReadonlyArray<LiveBrowserTaskCandidate>;
  requiredTasks?: number;
}

export interface LiveBrowserTaskLedger {
  generatedAt: string;
  evidenceKind: 'live-browser-task-sourcing-ledger';
  status: 'queued' | 'partial-results' | 'ready-for-binding-decision';
  requiredTasks: number;
  candidateTasks: number;
  pendingTasks: number;
  completedTasks: number;
  successes: number;
  failures: number;
  successRate: number | null;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  browserEnhancementUnlocked: boolean;
  tasks: ReadonlyArray<LiveBrowserTaskRow>;
}

export function buildLiveBrowserTaskLedger(input: BuildLiveBrowserTaskLedgerInput): LiveBrowserTaskLedger {
  const requiredTasks = input.requiredTasks ?? 20;
  const tasks = uniqueTaskRows(input.tasks);
  const completedTasks = completedBrowserTasksForGate15({ tasks });
  const report = buildBrowserGate15Report({
    tasks: completedTasks,
    evidenceKind: 'live-browser',
    requiredLiveTasks: requiredTasks,
  });
  const pendingTasks = tasks.filter((task) => task.status === 'pending').length;

  return {
    generatedAt: input.generatedAt,
    evidenceKind: 'live-browser-task-sourcing-ledger',
    status: statusFor(pendingTasks, completedTasks.length, requiredTasks),
    requiredTasks,
    candidateTasks: tasks.length,
    pendingTasks,
    completedTasks: completedTasks.length,
    successes: report.successes,
    failures: report.failures,
    successRate: completedTasks.length > 0 ? report.successRate : null,
    binding: report.binding,
    branchDecision: report.branchDecision,
    browserEnhancementUnlocked: report.branchDecision === 'continue-browser-enhancement',
    tasks,
  };
}

export function completedBrowserTasksForGate15(
  ledger: Pick<LiveBrowserTaskLedger, 'tasks'> | { tasks: ReadonlyArray<LiveBrowserTaskRow> },
): BrowserTask[] {
  return ledger.tasks
    .filter((task) => task.status === 'success' || task.status === 'failed')
    .map((task) => ({ id: task.id, status: task.status as BrowserTask['status'] }));
}

function uniqueTaskRows(tasks: ReadonlyArray<LiveBrowserTaskCandidate>): LiveBrowserTaskRow[] {
  const seen = new Set<string>();
  const rows: LiveBrowserTaskRow[] = [];
  for (const task of tasks) {
    const id = task.id.trim();
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      source: task.source.trim(),
      url: task.url.trim(),
      goal: task.goal.trim(),
      requiredCapabilities: [...task.requiredCapabilities],
      status: task.status ?? 'pending',
    });
  }
  return rows;
}

function statusFor(
  pendingTasks: number,
  completedTasks: number,
  requiredTasks: number,
): LiveBrowserTaskLedger['status'] {
  if (completedTasks >= requiredTasks && pendingTasks === 0) return 'ready-for-binding-decision';
  if (completedTasks > 0) return 'partial-results';
  return 'queued';
}
