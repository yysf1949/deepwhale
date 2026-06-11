import { describe, it, expect } from 'vitest';
import { createDefaultRegistry, createRegistryForProfile } from '../../src/tools/registry.js';

describe('registry (D-32.3.4 â€?+1 smart_search)', () => {
  it('all profile contains 41 tools', async () => {
    const reg = await createRegistryForProfile({ profile: 'all' });
    expect(reg.size()).toBe(42);
  });
  it('code-intel profile registers smart_search', () => {
    const reg = createDefaultRegistry({ profile: 'code-intel' });
    expect(reg.get('smart_search')).toBeDefined();
  });
});
