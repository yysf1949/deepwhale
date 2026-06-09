import { describe, expect, it } from 'vitest';
import { SmartSearchTool } from '../../src/tools/smart-search.js';

describe('smart_search (D-33.3.2)', () => {
  it('labels the local action as heuristic in its description', () => {
    const tool = new SmartSearchTool();
    expect(tool.description.toLowerCase()).toContain('heuristic');
  });
});
