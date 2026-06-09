import { describe, expect, it } from 'vitest';
import { registerMcpManifest } from '../../src/mcp/runtime.js';
import { createCapabilityRegistry } from '../../src/runtime/capability-registry.js';

describe('mcp runtime opt in', () => {
  it('registers mcp tools as hidden capabilities until the mcp profile is selected', () => {
    const registry = createCapabilityRegistry();
    registerMcpManifest(registry, {
      server: 'gh-search',
      tools: [{ name: 'code_search', inputSchema: { type: 'object' } }],
    });

    expect(registry.list({ profiles: ['default'] })).toEqual([]);
    expect(registry.list({ profiles: ['mcp'] }).map((capability) => capability.id)).toEqual([
      'mcp.gh-search.code_search',
    ]);
  });
});
