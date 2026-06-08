import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.2.2 — +1 cross-file tool)', () => {
  it('contains 40 tools (37 + 1 cross-file: find_references)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(40);
  });

  it('registers find_references', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('find_references')).toBeDefined();
  });
});
