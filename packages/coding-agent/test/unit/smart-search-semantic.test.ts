import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
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
});
