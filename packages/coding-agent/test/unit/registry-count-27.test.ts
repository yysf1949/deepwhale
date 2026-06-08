import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.2.6 + D-31.3.5)', () => {
  it('contains 31 tools (23 + 4 research + 4 productivity)', () => {
    expect(createDefaultRegistry().size()).toBe(31);
  });
  it('registers arxiv / blogwatcher / llm_wiki / polymarket', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('arxiv')).toBeDefined();
    expect(reg.get('blogwatcher')).toBeDefined();
    expect(reg.get('llm_wiki')).toBeDefined();
    expect(reg.get('polymarket')).toBeDefined();
  });
});
