import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.2.4 — +2 cross-file tools)', () => {
  it('contains 41 tools (38 + 2 cross-file: call_graph + rename_symbol)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(41);
  });

  it('registers call_graph + rename_symbol', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('call_graph')).toBeDefined();
    expect(reg.get('rename_symbol')).toBeDefined();
  });
});
