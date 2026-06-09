import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry research profile (legacy opt-in)', () => {
  it('keeps the all profile at the explicit full surface count', () => {
    expect(createDefaultRegistry({ profile: 'all' }).size()).toBe(41);
  });

  it('registers research tools only when research is explicitly selected', () => {
    const reg = createDefaultRegistry({ profile: 'research' });
    expect(reg.get('arxiv')).toBeDefined();
    expect(reg.get('blogwatcher')).toBeDefined();
    expect(reg.get('llm_wiki')).toBeDefined();
    expect(reg.get('polymarket')).toBeDefined();
  });
});
