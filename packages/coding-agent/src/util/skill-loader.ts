/**
 * @deepwhale/coding-agent — Skill auto-load (D-30.3.3, 2026-06-07).
 *
 * 拍板 (D-30.3): 跟 SkillStore 1:1 同目录形态 (~/.deepwhale/skills/<name>/SKILL.md),
 *   SkillLoader.listSkills() 返回 {name, content}[].
 *   启动 hook 接 registry 留 D-30.4, 本批只暴露 listSkills.
 *   缺 SKILL.md 的 dir 仍列出 (content = ''), 跟 SkillStore.read 抛错 区分.
 * - 0 改业务, 5 红线 0 触碰
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface LoadedSkill {
  name: string;
  content: string;
}

export class SkillLoader {
  constructor(private readonly rootDir: string) {}

  private get skillsDir(): string {
    return join(this.rootDir, 'skills');
  }

  async listSkills(): Promise<LoadedSkill[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const skills: LoadedSkill[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name = e.name;
      const skillFile = join(this.skillsDir, name, 'SKILL.md');
      const content = await fs.readFile(skillFile, 'utf8').catch((err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
        throw err;
      });
      skills.push({ name, content });
    }
    return skills;
  }
}
