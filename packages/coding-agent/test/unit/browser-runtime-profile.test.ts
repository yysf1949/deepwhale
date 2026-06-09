import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('browser foundation opt in', () => {
  it('keeps browser tools out of the default registry', () => {
    expect(createDefaultRegistry().list().map((tool) => tool.name)).not.toContain('browser_navigate');
  });
});
