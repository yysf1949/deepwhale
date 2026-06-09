import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkill } from '../../src/util/skill-loader.js';
import { requireApprovalForTool } from '../../src/policy/require-approval.js';

describe('skills and approval policy (D-33.2.4)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-skill-cap-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads SKILL.md frontmatter and rejects missing capabilities', async () => {
    mkdirSync(join(dir, 'sample'), { recursive: true });
    writeFileSync(
      join(dir, 'sample', 'SKILL.md'),
      '---\nname: sample\ncapabilities:\n  - tool.read_file\n---\n# Sample\n',
      'utf8',
    );

    const skill = await loadSkill({
      root: join(dir, 'sample'),
      availableCapabilities: ['tool.read_file'],
    });

    expect(skill.name).toBe('sample');
    expect(skill.capabilities).toEqual(['tool.read_file']);

    // Bad skill: capability not in available set
    const badDir = mkdtempSync(join(tmpdir(), 'dw-skill-cap-bad-'));
    try {
      mkdirSync(join(badDir, 'bad'), { recursive: true });
      writeFileSync(
        join(badDir, 'bad', 'SKILL.md'),
        '---\nname: bad\ncapabilities:\n  - tool.write_file\n---\n# Bad\n',
        'utf8',
      );
      await expect(
        loadSkill({
          root: join(badDir, 'bad'),
          availableCapabilities: ['tool.read_file'],
        }),
      ).rejects.toThrow(/missing capability: tool.write_file/);
    } finally {
      rmSync(badDir, { recursive: true, force: true });
    }
  });

  it('requires approval for side-effecting tools', () => {
    expect(requireApprovalForTool({ name: 'read_file', riskLevel: 'low' })).toBe(false);
    expect(requireApprovalForTool({ name: 'bash', riskLevel: 'high' })).toBe(true);
    expect(requireApprovalForTool({ name: 'patch', riskLevel: 'medium' })).toBe(true);
  });
});
