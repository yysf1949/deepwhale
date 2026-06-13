/**
 * D132 automation runtime.
 *
 * Reuses CronDaemon's tick/drain boundary, runs enabled jobs through an injected
 * runner, and records success/failure outcomes through CronStore.
 */

import { CronDaemon } from './cron-daemon.js';
import type { CronJob, CronRunRecord, CronStore } from './cron-store.js';

export interface AutomationRunnerResult {
  output?: string;
}

export type AutomationRunner = (job: CronJob) => Promise<AutomationRunnerResult | void>;

export interface AutomationRuntimeOptions {
  store: CronStore;
  runner: AutomationRunner;
  clock?: () => Date;
  createRunId?: (job: CronJob, startedAt: string) => string;
}

export class AutomationRuntime {
  private readonly store: CronStore;
  private readonly runner: AutomationRunner;
  private readonly clock: () => Date;
  private readonly createRunId: (job: CronJob, startedAt: string) => string;
  private readonly daemon: CronDaemon;

  constructor(options: AutomationRuntimeOptions) {
    this.store = options.store;
    this.runner = options.runner;
    this.clock = options.clock ?? (() => new Date());
    this.createRunId = options.createRunId ?? ((job, startedAt) => `${job.id}:${startedAt}`);
    this.daemon = new CronDaemon(this.store, (job) => this.runJob(job));
  }

  start(intervalMs: number = 60_000): void {
    this.daemon.start(intervalMs);
  }

  stop(): void {
    this.daemon.stop();
  }

  async fireOnce(): Promise<void> {
    await this.daemon.fireOnce();
  }

  async drainInFlight(): Promise<void> {
    await this.daemon.drainInFlight();
  }

  private async runJob(job: CronJob): Promise<void> {
    const startedAt = this.clock().toISOString();
    const runId = this.createRunId(job, startedAt);
    try {
      const result = await this.runner(job);
      const finishedAt = this.clock().toISOString();
      const record: CronRunRecord = {
        runId,
        jobId: job.id,
        schedule: job.schedule,
        prompt: job.prompt,
        status: 'success',
        startedAt,
        finishedAt,
        ...(result?.output !== undefined ? { output: result.output } : {}),
      };
      await this.store.recordRun(record);
    } catch (err) {
      const finishedAt = this.clock().toISOString();
      const error = normalizeError(err);
      await this.store.recordRun({
        runId,
        jobId: job.id,
        schedule: job.schedule,
        prompt: job.prompt,
        status: 'failed',
        startedAt,
        finishedAt,
        error,
      });
    }
  }
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
