import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.2.6 + D-31.3.5 + D-32.1.7 + D-32.1.7)', () => {
  it('all profile contains 41 tools', () => {
    expect(createDefaultRegistry({ profile: 'all' }).size()).toBe(41);
  });
  it('research profile registers arxiv / blogwatcher / llm_wiki / polymarket', () => {
    const reg = createDefaultRegistry({ profile: 'research' });
    expect(reg.get('arxiv')).toBeDefined();
    expect(reg.get('blogwatcher')).toBeDefined();
    expect(reg.get('llm_wiki')).toBeDefined();
    expect(reg.get('polymarket')).toBeDefined();
  });
});
