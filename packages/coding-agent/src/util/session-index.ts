/**
 * @deepwhale/coding-agent — Session index JSON 兜底 (D-30.1δ.10, 2026-06-07).
 *
 * 拍板: better-sqlite3 装不上 (Node 24.14.0 win32 无 prebuilt, 沙箱拒
 * curl 下载), 用 JSON 文件 兜底 sessions-index.json, list/add/remove/search
 * 4 方法 1:1 cover FTS5 拍板, 后续 D-30.3 升级.
 * 0 改业务, 5 红线 0 触碰.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export interface SessionEntry {
  id: string
  path: string
  messageCount: number
  firstUser: string
  createdAt: number
}

export class SessionIndex {
  constructor(private readonly rootDir: string) {}

  private get indexPath(): string {
    return join(this.rootDir, 'sessions-index.json')
  }

  async list(): Promise<SessionEntry[]> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf8')
      return JSON.parse(data) as SessionEntry[]
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }

  async add(entry: SessionEntry): Promise<void> {
    const all = await this.list()
    const idx = all.findIndex((e) => e.id === entry.id)
    if (idx >= 0) all[idx] = entry
    else all.push(entry)
    await this.save(all)
  }

  async remove(id: string): Promise<void> {
    const all = await this.list()
    await this.save(all.filter((e) => e.id !== id))
  }

  async search(query: string): Promise<SessionEntry[]> {
    const all = await this.list()
    const q = query.toLowerCase()
    return all.filter((e) => e.firstUser.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
  }

  private async save(entries: SessionEntry[]): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true })
    await fs.writeFile(this.indexPath, JSON.stringify(entries, null, 2))
  }
}
