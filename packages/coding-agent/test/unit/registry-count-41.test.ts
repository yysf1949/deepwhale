import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.3.4 — +1 smart_search)', () => {
  it('contains 41 tools (40 + 1 smart_search)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(41);
  });
  it('registers smart_search', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('smart_search')).toBeDefined();
  });
});
