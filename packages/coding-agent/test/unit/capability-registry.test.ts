import { describe, expect, it } from 'vitest';
import { createCapabilityRegistry } from '../../src/runtime/capability-registry.js';

describe('capability registry (D-33.2.3)', () => {
  it('rejects duplicate ids and exposes only enabled profiles', () => {
    const registry = createCapabilityRegistry();
    registry.register({ id: 'tool.read_file', source: 'tool', riskLevel: 'low', profiles: ['core', 'coding'] });

    expect(() => {
      registry.register({ id: 'tool.read_file', source: 'tool', riskLevel: 'low', profiles: ['core'] });
    }).toThrow(/duplicate capability id/);

    expect(registry.list({ profiles: ['coding'] }).map((capability) => capability.id)).toEqual(['tool.read_file']);
    expect(registry.list({ profiles: ['media'] })).toEqual([]);
  });
});
