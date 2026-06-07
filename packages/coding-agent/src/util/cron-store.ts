/**
 * @deepwhale/coding-agent — Cron store (D-30.1δ.9, 2026-06-07).
 *
 * 拍板 (D-30.1δ): ~/.deepwhale/cron/jobs.json (CronJob[] JSON 数组).
 * 调度执行 daemon 留 D-30.2, 本期只暴露 list / add / remove.
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

export class CronStore {
  constructor(private readonly rootDir: string) {}

  private get jobsPath(): string {
    return join(this.rootDir, 'cron', 'jobs.json')
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

  private async save(jobs: CronJob[]): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'cron'), { recursive: true })
    await fs.writeFile(this.jobsPath, JSON.stringify(jobs, null, 2))
  }
}
