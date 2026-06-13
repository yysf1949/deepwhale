import { describe, it, expect } from 'vitest';
import { createRegistryForProfile } from '../../src/tools/registry.js';

describe('registry (D-31.4.4 + D-32.1.7)', () => {
  it('all profile contains 43 tools', async () => {
    const reg = await createRegistryForProfile({ profile: 'all' });
    expect(reg.size()).toBe(43);
  });

  it('media profile registers spotify / youtube_content', async () => {
    const reg = await createRegistryForProfile({ profile: 'media' });
    expect(reg.get('spotify')).toBeDefined();
    expect(reg.get('youtube_content')).toBeDefined();
  });
});
