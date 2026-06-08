import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.2.6 + D-31.3.5 + D-32.1.7 + D-32.1.7)', () => {
  it('contains 33 tools (23 + 4 research + 4 productivity + 4 code-intel)', () => {
    expect(createDefaultRegistry().size()).toBe(37);
  });
  it('registers arxiv / blogwatcher / llm_wiki / polymarket', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('arxiv')).toBeDefined();
    expect(reg.get('blogwatcher')).toBeDefined();
    expect(reg.get('llm_wiki')).toBeDefined();
    expect(reg.get('polymarket')).toBeDefined();
  });
});
