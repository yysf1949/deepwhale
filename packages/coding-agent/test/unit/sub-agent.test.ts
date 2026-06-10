/**
 * SubAgentId + SubAgentRegistry unit test -- D-107 v6.0 multi-agent safety seed.
 *
 * The v5.0 plugin governance theme (D-91..D-103) covered tool
 * capabilities and policy enforcement. v6.0 Theme 1 (multi-agent
 * safety) extends the same vocabulary to SUB-AGENTS: a sub-agent
 * is a delegated context that runs under a parent agent, declares
 * a subset of the ToolCapability vocabulary, and has its own
 * audit-log partition (D-109 will add the rollback side).
 *
 * D-107 is part 1 of 3 of the multi-agent safety seed. It
 * defines the foundational types: SubAgentId (branded string),
 * SubAgent (interface), and SubAgentRegistry (in-memory class).
 * D-108 will add enforceSubAgentPolicy (reuse D-103). D-109 will
 * add rollbackSubAgent (reuse D-89 + D-104 patterns).
 *
 * The registry is in-memory only. Distributed sub-agent
 * coordination is deferred to v6.0 Theme 3 (D-NN).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { asSubAgentId, isSubAgentId, SubAgentRegistry } from '../../src/multi-agent/sub-agent.js';
import type { SubAgent } from '../../src/multi-agent/sub-agent.js';
import type { ToolName } from '@deepwhale/core';

function makeSubAgent(overrides: Partial<SubAgent> = {}): SubAgent {
  return {
    id: asSubAgentId('sa-test-1'),
    parentAgentId: 'parent-A',
    description: 'summarizer',
    capabilities: ['file-read', 'code-execute'],
    toolNames: ['Read' as ToolName, 'CodeExec' as ToolName],
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe('SubAgentId + SubAgentRegistry (D-107 v6.0 multi-agent safety seed)', () => {
  describe('asSubAgentId (D-107)', () => {
    it('accepts non-empty strings up to 256 chars (D-107)', () => {
      expect(asSubAgentId('sa-foo')).toBe('sa-foo');
      expect(isSubAgentId(asSubAgentId('sa-bar'))).toBe(true);
    });

    it('rejects empty strings and oversize strings (D-107)', () => {
      expect(() => asSubAgentId('')).toThrow();
      expect(() => asSubAgentId('x'.repeat(257))).toThrow();
    });
  });

  describe('SubAgentRegistry (D-107)', () => {
    let registry: SubAgentRegistry;
    beforeEach(() => {
      registry = new SubAgentRegistry();
    });

    it('register + get round-trips a sub-agent (D-107)', () => {
      const sa = makeSubAgent();
      registry.register(sa);
      expect(registry.get(sa.id)).toEqual(sa);
      expect(registry.size()).toBe(1);
    });

    it('register throws on duplicate id (D-107)', () => {
      const sa = makeSubAgent();
      registry.register(sa);
      expect(() => registry.register(sa)).toThrow(/already registered/);
    });

    it('unregister returns the entry and removes it (D-107)', () => {
      const sa = makeSubAgent();
      registry.register(sa);
      expect(registry.unregister(sa.id)).toEqual(sa);
      expect(registry.get(sa.id)).toBeUndefined();
      expect(registry.size()).toBe(0);
      // Idempotent: unregistering again returns null.
      expect(registry.unregister(sa.id)).toBeNull();
    });

    it('listByParent returns only sub-agents of the given parent (D-107)', () => {
      const a1 = makeSubAgent({ id: asSubAgentId('sa-1'), parentAgentId: 'parent-A' });
      const a2 = makeSubAgent({ id: asSubAgentId('sa-2'), parentAgentId: 'parent-A' });
      const b1 = makeSubAgent({ id: asSubAgentId('sa-3'), parentAgentId: 'parent-B' });
      registry.register(a1);
      registry.register(a2);
      registry.register(b1);
      const aChildren = registry.listByParent('parent-A');
      const bChildren = registry.listByParent('parent-B');
      expect(aChildren.map((s) => s.id).sort()).toEqual(['sa-1', 'sa-2']);
      expect(bChildren.map((s) => s.id)).toEqual(['sa-3']);
      expect(registry.listByParent('parent-C')).toEqual([]);
    });
  });
});
