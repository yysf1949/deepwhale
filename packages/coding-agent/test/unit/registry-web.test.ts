import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('registry web profile (legacy opt-in)', () => {
  it('includes the legacy web tools only when explicitly selected', () => {
    const registry = createDefaultRegistry({ profile: 'web' });
    expect(registry.get('web_search')).toBeDefined();
    expect(registry.get('web_extract')).toBeDefined();
    expect(registry.get('browser_navigate')).toBeDefined();
  });

  it('does not include core coding tools in the web profile', () => {
    const registry = createDefaultRegistry({ profile: 'web' });
    expect(registry.size()).toBe(3);
    expect(registry.get('bash')).toBeUndefined();
  });
});
