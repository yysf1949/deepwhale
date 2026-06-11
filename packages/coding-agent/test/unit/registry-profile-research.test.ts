import { describe, expect, it } from 'vitest';
import { createRegistryForProfile } from '../../src/tools/registry.js';

describe('registry research profile (legacy opt-in)', () => {
  it('keeps the all profile at the explicit full surface count', async () => {
    expect((await createRegistryForProfile({ profile: 'all' })).size()).toBe(42);
  });

  it('registers research tools only when research is explicitly selected', async () => {
    const reg = await createRegistryForProfile({ profile: 'research' });
    expect(reg.get('arxiv')).toBeDefined();
    expect(reg.get('blogwatcher')).toBeDefined();
    expect(reg.get('llm_wiki')).toBeDefined();
    expect(reg.get('polymarket')).toBeDefined();
  });
});
