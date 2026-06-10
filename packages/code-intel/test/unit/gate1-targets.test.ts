import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inventoryGate1Targets, renderGate1TargetInventoryMarkdown } from '../../src/gate1-targets.js';

describe('Gate-1 target inventory', () => {
  it('reports minimum-only when no local target reaches preferred LOC', async () => {
    const root = await makeTargetsRoot({ vite: 12 });
    try {
      const report = await inventoryGate1Targets({ targetsRoot: root, minimumLoc: 10, preferredLoc: 20 });

      expect(report.status).toBe('minimum-only');
      expect(report.preferredTargets).toEqual([]);
      expect(report.bestAvailable?.name).toBe('vite');
      expect(report.blocker).toContain('best local target is vite with 12 LOC');
      expect(report.blocker).toContain('below preferred 20 LOC');
      expect(report.blocker).not.toContain('100K+');
      const md = renderGate1TargetInventoryMarkdown(report);
      expect(md).toContain('Status: minimum-only');
      expect(md).toContain('Preferred targets: 0');
      expect(md).toContain('This inventory does not itself prove Gate-1 pass on a target');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports preferred-available when a target reaches preferred LOC', async () => {
    const root = await makeTargetsRoot({ small: 12, large: 25 });
    try {
      const report = await inventoryGate1Targets({ targetsRoot: root, minimumLoc: 10, preferredLoc: 20 });

      expect(report.status).toBe('preferred-available');
      expect(report.preferredTargets.map((target) => target.name)).toEqual(['large']);
      expect(report.blocker).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports none when the targets root has no directories', async () => {
    const root = await mkdir(resolve(tmpdir(), `dw-gate1-targets-empty-${Date.now()}`), { recursive: true });
    try {
      const report = await inventoryGate1Targets({ targetsRoot: root, minimumLoc: 10, preferredLoc: 20 });

      expect(report.status).toBe('none');
      expect(report.targets).toEqual([]);
      expect(report.blocker).toMatch(/no local Gate-1 target directories/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function makeTargetsRoot(targets: Record<string, number>): Promise<string> {
  const root = await mkdir(resolve(tmpdir(), `dw-gate1-targets-${Date.now()}-${Math.random().toString(16).slice(2)}`), {
    recursive: true,
  });
  for (const [name, loc] of Object.entries(targets)) {
    const src = resolve(root, name, 'src');
    await mkdir(src, { recursive: true });
    await writeFile(resolve(src, 'index.ts'), makeLines(loc), 'utf8');
  }
  return root;
}

function makeLines(count: number): string {
  return Array.from({ length: count }, (_, i) => `export const value${i} = ${i};`).join('\n');
}
