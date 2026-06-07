/**
 * D-30.3.3: Skill auto-load (启动时 detect ~/.deepwhale/skills, 注入 registry).
 *
 * 拍板 (D-30.3): 跟 SkillStore 1:1 同目录形态 (~/.deepwhale/skills/<name>/SKILL.md),
 *   SkillLoader.listSkills() 返回 {name, content}[].
 *   启动 hook 接 registry 留 D-30.4, 本批只暴露 listSkills.
 * - 0 改业务, 5 红线 0 触碰
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillLoader } from '../../src/util/skill-loader.js';

describe('SkillLoader (D-30.3.3)', () => {
  let dir: string;
  let loader: SkillLoader;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-skillloader-'));
    loader = new SkillLoader(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty array when skills dir does not exist', async () => {
    const skills = await loader.listSkills();
    expect(skills).toEqual([]);
  });

  it('returns empty array when skills dir is empty', async () => {
    mkdirSync(join(dir, 'skills'));
    const skills = await loader.listSkills();
    expect(skills).toEqual([]);
  });

  it('lists skills with their SKILL.md content', async () => {
    mkdirSync(join(dir, 'skills', 'commit'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'commit', 'SKILL.md'), '# Commit skill\nsteps', 'utf8');
    mkdirSync(join(dir, 'skills', 'review'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'review', 'SKILL.md'), '# Review skill', 'utf8');
    const skills = await loader.listSkills();
    expect(skills).toHaveLength(2);
    const byName = Object.fromEntries(skills.map((s) => [s.name, s.content]));
    expect(byName['commit']).toBe('# Commit skill\nsteps');
    expect(byName['review']).toBe('# Review skill');
  });

  it('skips directories without SKILL.md (content = empty string)', async () => {
    mkdirSync(join(dir, 'skills', 'no-skill-file'), { recursive: true });
    mkdirSync(join(dir, 'skills', 'has-skill'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'has-skill', 'SKILL.md'), 'has it', 'utf8');
    const skills = await loader.listSkills();
    expect(skills).toHaveLength(2);
    const noSkill = skills.find((s) => s.name === 'no-skill-file');
    expect(noSkill?.content).toBe('');
  });

  it('skips non-directory entries', async () => {
    mkdirSync(join(dir, 'skills'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'stray.txt'), 'stray', 'utf8');
    mkdirSync(join(dir, 'skills', 'real'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'real', 'SKILL.md'), 'real content', 'utf8');
    const skills = await loader.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('real');
  });
});
