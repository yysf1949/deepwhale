import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.1.7 — 4 code-intel tools)', () => {
  it('contains 41 tools (33 + 4 code-intel: parse_file / get_symbols / analyze_repo / find_definition)', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(41);
  });

  it('registers parse_file / get_symbols / analyze_repo / find_definition', () => {
    const reg = createDefaultRegistry();
    expect(reg.get('parse_file')).toBeDefined();
    expect(reg.get('get_symbols')).toBeDefined();
    expect(reg.get('analyze_repo')).toBeDefined();
    expect(reg.get('find_definition')).toBeDefined();
  });
});
