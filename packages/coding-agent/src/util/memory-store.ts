/**
 * @deepwhale/coding-agent — Memory store (D-30.1δ.1, 2026-06-07).
 *
 * 拍板 (D-30.1δ): ~/.deepwhale/memory/{MEMORY,USER}.md 双文件 schema.
 *   - MEMORY.md: 跨 session 累积的事实 / 偏好 / 教训, 按时间戳分块 (## ISO)
 *   - USER.md: 用户身份 / 角色 / 项目背景, 列表追加格式 (`- <text>`)
 *   - 缺文件时首次读返空, 自动 mkdir -p 落 0 字节占位
 *   - 0 改业务, 5 红线 0 触碰
 *
 * D-126: Memory ranking — relevance scoring for memory retrieval.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export interface MemoryEntry {
  readonly timestamp: string
  readonly content: string
  readonly score: number
}

export class MemoryStore {
  constructor(private readonly rootDir: string) {}

  private get memoryDir(): string {
    return join(this.rootDir, 'memory')
  }
  private get memoryPath(): string {
    return join(this.memoryDir, 'MEMORY.md')
  }
  private get userPath(): string {
    return join(this.memoryDir, 'USER.md')
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.memoryDir, { recursive: true })
  }

  private async readOrInit(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.ensureDir()
        await fs.writeFile(path, '')
        return ''
      }
      throw e
    }
  }

  async readMemory(): Promise<string> {
    return this.readOrInit(this.memoryPath)
  }

  async readUser(): Promise<string> {
    return this.readOrInit(this.userPath)
  }

  /** 追加到 MEMORY.md, 加时间戳分块. */
  async appendMemory(text: string): Promise<void> {
    await this.ensureDir()
    const existing = await this.readMemory()
    const ts = new Date().toISOString()
    const newContent = existing + `\n\n## ${ts}\n\n${text}\n`
    await fs.writeFile(this.memoryPath, newContent)
  }

  /** 追加到 USER.md, 列表格式. */
  async appendUser(text: string): Promise<void> {
    await this.ensureDir()
    const existing = await this.readUser()
    const newContent = existing + (existing ? '\n' : '') + `- ${text}\n`
    await fs.writeFile(this.userPath, newContent)
  }

  /** 抹掉 MEMORY.md (debug 用). */
  async resetMemory(): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(this.memoryPath, '')
  }

  /** 抹掉 USER.md (debug 用). */
  async resetUser(): Promise<void> {
    await this.ensureDir()
    await fs.writeFile(this.userPath, '')
  }

  /**
   * Search memory entries by query, returning ranked results.
   * Uses simple TF scoring: counts query term occurrences in each entry.
   */
  async searchMemory(query: string, options?: { limit?: number }): Promise<MemoryEntry[]> {
    const content = await this.readMemory()
    if (!content.trim()) return []

    const entries = parseMemoryEntries(content)
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

    const scored = entries.map((entry) => {
      const lowerContent = entry.content.toLowerCase()
      let score = 0
      for (const term of queryTerms) {
        const matches = lowerContent.split(term).length - 1
        score += matches
      }
      // Recency boost: newer entries get slight advantage
      const ageMs = Date.now() - new Date(entry.timestamp).getTime()
      const ageBoost = Math.max(0, 1 - ageMs / (30 * 24 * 60 * 60 * 1000)) * 0.1
      return { ...entry, score: score + ageBoost }
    })

    return scored
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.limit ?? 10)
  }
}

function parseMemoryEntries(content: string): Array<{ timestamp: string; content: string }> {
  const entries: Array<{ timestamp: string; content: string }> = []
  const blocks = content.split(/^## /m).filter(Boolean)

  for (const block of blocks) {
    const lines = block.split('\n')
    const timestampMatch = lines[0]?.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*$/)
    if (timestampMatch && timestampMatch[1]) {
      entries.push({
        timestamp: timestampMatch[1],
        content: lines.slice(1).join('\n').trim(),
      })
    }
  }

  return entries
}
