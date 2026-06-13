/**
 * Cron daemon timer boundary.
 *
 * CronDaemon lists jobs on each tick and calls the injected handler for enabled
 * jobs. D132 AutomationRuntime provides the prompt execution boundary above it.
 */

import type { CronJob, CronStore } from './cron-store.js';

export type CronTickHandler = (job: CronJob) => Promise<void>;

export class CronDaemon {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly store: CronStore,
    private readonly onTick: CronTickHandler,
  ) {}

  start(intervalMs: number = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.inFlight = this.fireOnce().catch(() => undefined);
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Exposes one tick for tests; start() uses the same behavior from setInterval.
   */
  async fireOnce(): Promise<void> {
    let jobs: CronJob[];
    try {
      jobs = await this.store.list();
    } catch {
      return;
    }
    for (const job of jobs.filter((j) => j.enabled)) {
      try {
        await this.onTick(job);
      } catch {
        // A single job failure must not block later enabled jobs.
      }
    }
  }

  /** 单测辅助: 等当前 in-flight tick 完成. */
  async drainInFlight(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }
}
