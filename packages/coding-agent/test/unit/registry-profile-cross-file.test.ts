import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.2.4 cross-file tools)', () => {
  it('default profile contains coding + code-intel essentials only', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(21);
  });

  it('code-intel profile registers call_graph + rename_symbol', () => {
    const reg = createDefaultRegistry({ profile: 'code-intel' });
    expect(reg.get('call_graph')).toBeDefined();
    expect(reg.get('rename_symbol')).toBeDefined();
  });
});
