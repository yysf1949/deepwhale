/**
 * @deepwhale/coding-agent — Cron daemon stub (D-30.3.4, 2026-06-07).
 *
 * 拍板 (D-30.3): CronDaemon.start(60_000) tick 调 store.list(), 对每个
 *   enabled job 调 onTick(job). 拍板 stub, 实调 (跑 prompt, 调 LLM) 留 D-30.4.
 * - onTick 失败 catch 住, 继续下一个 job
 * - timer.unref() 防止 daemon 阻进程退出
 * - 0 改业务, 5 红线 0 触碰
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
   * 拍板: 暴露 fireOnce 给单测 (fake-timer 跟 async chain 难串). 生产路径
   *   start() 内部 setInterval 回调调, 跟 fireOnce 行为 1:1.
   * - 0 改业务 (5 红线 0 触碰)
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
        // 拍板 stub: 单 job 失败不影响兄弟. 实调留 D-30.4 接 log.
      }
    }
  }

  /** 单测辅助: 等当前 in-flight tick 完成. */
  async drainInFlight(): Promise<void> {
    if (this.inFlight) await this.inFlight;
  }
}
