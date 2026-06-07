/**
 * @deepwhale/coding-agent — Skill store (D-30.1δ.8, 2026-06-07).
 *
 * 拍板 (D-30.1δ): ~/.deepwhale/skills/<name>/SKILL.md 形态 (1 dir per skill, 单 md).
 * 0 改业务, 5 红线 0 触碰.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export class SkillStore {
  constructor(private readonly rootDir: string) {}

  private get skillsDir(): string {
    return join(this.rootDir, 'skills')
  }

  private skillDir(name: string): string {
    return join(this.skillsDir, name)
  }

  private skillFile(name: string): string {
    return join(this.skillDir(name), 'SKILL.md')
  }

  async list(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw e
    }
  }

  async read(name: string): Promise<string> {
    return fs.readFile(this.skillFile(name), 'utf8')
  }

  async write(name: string, content: string): Promise<void> {
    await fs.mkdir(this.skillDir(name), { recursive: true })
    await fs.writeFile(this.skillFile(name), content)
  }

  async delete(name: string): Promise<void> {
    await fs.rm(this.skillDir(name), { recursive: true, force: true })
  }
}
