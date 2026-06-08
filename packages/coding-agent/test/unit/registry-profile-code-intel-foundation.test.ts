import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.1.7 — 4 code-intel tools)', () => {
  it('default profile contains coding + code-intel essentials only', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(19);
  });

  it('code-intel profile registers parse_file / get_symbols / analyze_repo / find_definition', () => {
    const reg = createDefaultRegistry({ profile: 'code-intel' });
    expect(reg.get('parse_file')).toBeDefined();
    expect(reg.get('get_symbols')).toBeDefined();
    expect(reg.get('analyze_repo')).toBeDefined();
    expect(reg.get('find_definition')).toBeDefined();
  });
});
