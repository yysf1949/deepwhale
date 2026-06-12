import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SmartSearchTool } from '../../src/tools/smart-search.js';

describe('smart_search (D-33.3.2)', () => {
  it('labels the local action as heuristic in its description', () => {
    const tool = new SmartSearchTool();
    expect(tool.description.toLowerCase()).toContain('heuristic');
  });

  it('marks successful local results as heuristic in metadata', async () => {
    const tool = new SmartSearchTool();
    const result = await tool.execute({
      action: 'local',
      query: 'Greeter',
      path: resolve(process.cwd(), 'packages/code-intel/test/fixtures'),
    });

    expect(result.success).toBe(true);
    expect(result.meta).toMatchObject({ heuristic: true });
  });

  it('uses semantic fallback for free-text local queries', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'dw-smart-search-'));
    await writeFile(
      join(tmp, 'status.ts'),
      [
        'export function renderStatusBar() {',
        "  return 'ready';",
        '}',
        '',
        'export function unrelatedPanel() {',
        "  return 'panel';",
        '}',
      ].join('\n'),
    );
    const tool = new SmartSearchTool();

    const result = await tool.execute({
      action: 'local',
      query: 'status bar',
      path: tmp,
      maxResults: 5,
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('semantic_fallback');
    expect(result.content).toContain('renderStatusBar');
    expect(result.meta).toMatchObject({
      heuristic: true,
      semanticCount: expect.any(Number),
      matchModes: expect.arrayContaining(['semantic_fallback']),
    });
    expect((result.meta as { semanticCount?: number }).semanticCount).toBeGreaterThan(0);

    await rm(tmp, { recursive: true, force: true });
  });
});
