/**
 * @deepwhale/coding-agent — Memory store (D-30.1δ.1, 2026-06-07).
 *
 * 拍板 (D-30.1δ): ~/.deepwhale/memory/{MEMORY,USER}.md 双文件 schema.
 *   - MEMORY.md: 跨 session 累积的事实 / 偏好 / 教训, 按时间戳分块 (## ISO)
 *   - USER.md: 用户身份 / 角色 / 项目背景, 列表追加格式 (`- <text>`)
 *   - 缺文件时首次读返空, 自动 mkdir -p 落 0 字节占位
 *   - 0 改业务, 5 红线 0 触碰
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

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
}
