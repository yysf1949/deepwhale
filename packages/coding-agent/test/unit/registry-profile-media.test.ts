import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.4.4 + D-32.1.7)', () => {
  it('all profile contains 41 tools', () => {
    const reg = createDefaultRegistry({ profile: 'all' });
    expect(reg.size()).toBe(41);
  });

  it('media profile registers spotify / youtube_content', () => {
    const reg = createDefaultRegistry({ profile: 'media' });
    expect(reg.get('spotify')).toBeDefined();
    expect(reg.get('youtube_content')).toBeDefined();
  });
});
