import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry (D-32.2.2 â€?+1 cross-file tool)', () => {
  it('default profile contains coding + code-intel essentials only', () => {
    const reg = createDefaultRegistry();
    expect(reg.size()).toBe(20);
  });

  it('code-intel profile registers find_references', () => {
    const reg = createDefaultRegistry({ profile: 'code-intel' });
    expect(reg.get('find_references')).toBeDefined();
  });
});
