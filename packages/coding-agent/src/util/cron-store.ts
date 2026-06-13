/**
 * @deepwhale/coding-agent — Cron store (D-30.1δ.9, 2026-06-07).
 *
 * 拍板 (D-30.1δ): ~/.deepwhale/cron/jobs.json (CronJob[] JSON 数组).
 * 调度执行 daemon 留 D-30.2, 本期只暴露 list / add / remove.
 * D132 (2026-06-13): add cron/runs.json (CronRunRecord[]) execution records.
 * 0 改业务, 5 红线 0 触碰.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export interface CronJob {
  id: string
  schedule: string
  prompt: string
  enabled: boolean
}

export type CronRunStatus = 'success' | 'failed'

export interface CronRunRecord {
  runId: string
  jobId: string
  schedule: string
  prompt: string
  status: CronRunStatus
  startedAt: string
  finishedAt: string
  output?: string
  error?: string
}

export class CronStore {
  constructor(private readonly rootDir: string) {}

  private get jobsPath(): string {
    return join(this.rootDir, 'cron', 'jobs.json')
  }

  private get runsPath(): string {
    return join(this.rootDir, 'cron', 'runs.json')
  }

  async list(): Promise<CronJob[]> {
    try {
      const data = await fs.readFile(this.jobsPath, 'utf8')
      return JSON.parse(data) as CronJob[]
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }

  async add(job: CronJob): Promise<void> {
    const jobs = await this.list()
    jobs.push(job)
    await this.save(jobs)
  }

  async remove(id: string): Promise<void> {
    const jobs = await this.list()
    await this.save(jobs.filter((j) => j.id !== id))
  }

  async listRuns(): Promise<CronRunRecord[]> {
    try {
      const data = await fs.readFile(this.runsPath, 'utf8')
      return JSON.parse(data) as CronRunRecord[]
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }

  async recordRun(record: CronRunRecord): Promise<void> {
    const runs = await this.listRuns()
    runs.push(record)
    await this.saveRuns(runs)
  }

  private async save(jobs: CronJob[]): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'cron'), { recursive: true })
    await fs.writeFile(this.jobsPath, JSON.stringify(jobs, null, 2))
  }

  private async saveRuns(runs: CronRunRecord[]): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'cron'), { recursive: true })
    await fs.writeFile(this.runsPath, JSON.stringify(runs, null, 2))
  }
}
