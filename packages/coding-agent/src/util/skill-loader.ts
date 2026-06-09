/**
 * @deepwhale/coding-agent — Skill auto-load (D-30.3.3, 2026-06-07).
 *
 * 拍板 (D-30.3): 跟 SkillStore 1:1 同目录形态 (~/.deepwhale/skills/<name>/SKILL.md),
 *   SkillLoader.listSkills() 返回 {name, content}[].
 *   启动 hook 接 registry 留 D-30.4, 本批只暴露 listSkills.
 *   缺 SKILL.md 的 dir 仍列出 (content = ''), 跟 SkillStore.read 抛错 区分.
 * - 0 改业务, 5 红线 0 触碰
 *
 * D-33.2.4 (2026-06-09): free function `loadSkill({ root, availableCapabilities })`
 *   parses SKILL.md frontmatter and validates the `capabilities:` array
 *   against the available capability set. Throws if any required
 *   capability is missing. The class-based `SkillLoader.listSkills()`
 *   API stays unchanged for backward compat.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export interface LoadedSkill {
  name: string;
  content: string;
}

export interface LoadSkillOptions {
  /** Directory containing SKILL.md (the skill root, not the skills dir). */
  root: string;
  /** Set of capability ids the caller can supply; SKILL.md `capabilities:` must be a subset. */
  availableCapabilities: ReadonlyArray<string>;
}

export interface LoadedSkillWithMeta {
  name: string;
  content: string;
  capabilities: ReadonlyArray<string>;
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

/**
 * Parse a single SKILL.md and validate its declared capabilities.
 *
 * Throws:
 *   - if SKILL.md is missing
 *   - if frontmatter (`--- ... ---`) is missing
 *   - if `name:` is missing
 *   - if any `capabilities:` entry is not in `availableCapabilities`
 */
export async function loadSkill(options: LoadSkillOptions): Promise<LoadedSkillWithMeta> {
  const skillFile = join(options.root, 'SKILL.md');
  const raw = await fs.readFile(skillFile, 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!fm) throw new Error(`SKILL.md missing frontmatter: ${skillFile}`);
  const fmBody = fm[1] ?? '';
  const nameMatch = /^name:\s*(\S+)/m.exec(fmBody);
  if (!nameMatch) throw new Error(`SKILL.md missing 'name' in frontmatter: ${skillFile}`);
  const name = nameMatch[1] ?? '';
  const capMatch = /capabilities:\s*\n((?:\s*-\s*.+\n?)*)/.exec(fmBody);
  const capabilities = capMatch
    ? (capMatch[1] ?? '')
        .split('\n')
        .map((l) => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean)
    : [];
  for (const cap of capabilities) {
    if (!options.availableCapabilities.includes(cap)) {
      throw new Error(`missing capability: ${cap} (skill ${name})`);
    }
  }
  return { name, content: raw, capabilities };
}

