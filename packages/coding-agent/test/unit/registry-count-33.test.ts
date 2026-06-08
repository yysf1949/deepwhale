import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-31.4.4)', () => {
  it('contains 33 tools (31 + 2 media)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(33);
  });

  it('registers spotify / youtube_content', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('spotify')).toBeDefined();
    expect(reg.get('youtube_content')).toBeDefined();
  });
});
