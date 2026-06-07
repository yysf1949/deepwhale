/**
 * D-30.1δ.8: skill store — ~/.deepwhale/skills/<name>/SKILL.md.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillStore } from '../../src/util/skill-store.js';

describe('skill store (D-30.1δ.8)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-skill-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty list when no skills dir', async () => {
    const store = new SkillStore(dir);
    expect(await store.list()).toEqual([]);
  });

  it('lists installed skills', async () => {
    mkdirSync(join(dir, 'skills', 'code-review'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'code-review', 'SKILL.md'), '# code review');
    mkdirSync(join(dir, 'skills', 'refactor'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'refactor', 'SKILL.md'), '# refactor');
    const store = new SkillStore(dir);
    const skills = await store.list();
    expect(skills.sort()).toEqual(['code-review', 'refactor']);
  });

  it('reads SKILL.md content', async () => {
    mkdirSync(join(dir, 'skills', 'test-skill'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'test-skill', 'SKILL.md'), 'do the thing');
    const store = new SkillStore(dir);
    expect(await store.read('test-skill')).toBe('do the thing');
  });

  it('writes new SKILL.md', async () => {
    const store = new SkillStore(dir);
    await store.write('new-skill', '# new\n\nbody');
    expect(await store.read('new-skill')).toContain('# new');
  });

  it('deletes a skill', async () => {
    mkdirSync(join(dir, 'skills', 'to-delete'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'to-delete', 'SKILL.md'), 'x');
    const store = new SkillStore(dir);
    await store.delete('to-delete');
    expect(await store.list()).toEqual([]);
  });
});
