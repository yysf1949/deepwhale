/**
 * enforceSubAgentPolicy unit test -- D-108 v6.0 multi-agent safety seed part 2.
 *
 * After D-107 (SubAgentId + SubAgent + SubAgentRegistry foundational
 * types) and D-103 (enforceProfilePolicy for the parent agent),
 * D-108 adds the enforcement layer for SUB-AGENTS. The function
 * reuses enforceProfilePolicy internally (D-103) and adds
 * sub-agent-specific metadata (subAgentId, parentAgentId, decision,
 * summary).
 *
 * The function is a thin wrapper. All real enforcement logic lives
 * in D-103; D-108 just constructs a minimal Tool[] from the
 * sub-agent's tool names + capabilities and passes it through.
 */

import { describe, expect, it } from 'vitest';
import { enforceSubAgentPolicy } from '../../src/multi-agent/sub-agent-policy.js';
import { asSubAgentId } from '../../src/multi-agent/sub-agent.js';
import type { SubAgent } from '../../src/multi-agent/sub-agent.js';
import type { DistributionManifest } from '../../src/distribution/manifest.js';
import type { ToolName } from '@deepwhale/core';

function makeManifest(overrides: Partial<DistributionManifest> = {}): DistributionManifest {
  return {
    package: '@deepwhale/coding-agent',
    version: '2.3.0',
    channel: 'npm',
    nodeEngine: '>=20.0.0',
    capabilities: ['file-read', 'file-write', 'shell-exec'],
    supportedUpgradesFrom: ['>=2.0.0 <2.3.0'],
    ...overrides,
  };
}

function makeSubAgent(overrides: Partial<SubAgent> = {}): SubAgent {
  return {
    id: asSubAgentId('sa-summarizer'),
    parentAgentId: 'parent-A',
    description: 'summarizer',
    capabilities: ['file-read', 'file-write', 'shell-exec'],
    toolNames: ['Read' as ToolName, 'Edit' as ToolName],
    createdAt: 1_000_000,
    ...overrides,
  };
}

describe('enforceSubAgentPolicy (D-108 v6.0 multi-agent safety seed part 2)', () => {
  it('returns allow when sub-agent caps are a subset of manifest caps (D-108)', () => {
    const result = enforceSubAgentPolicy(makeManifest(), makeSubAgent());
    expect(result.decision).toBe('allow');
    expect(result.isCompliant).toBe(true);
    expect(result.violationCount).toBe(0);
    expect(result.subAgentId).toBe('sa-summarizer');
    expect(result.parentAgentId).toBe('parent-A');
    expect(result.summary).toContain('summarizer');
    expect(result.summary).toContain('can run');
  });

  it('returns deny + undeclared-capability when sub-agent caps exceed manifest (D-108)', () => {
    const sa = makeSubAgent({ capabilities: ['file-read', 'network'] });
    const result = enforceSubAgentPolicy(makeManifest(), sa);
    expect(result.decision).toBe('deny');
    expect(result.isCompliant).toBe(false);
    expect(result.violations.some((v) => v.kind === 'undeclared-capability' && v.capability === 'network')).toBe(true);
    expect(result.summary).toContain('denied');
    expect(result.summary).toContain('network');
  });

  it('returns deny + missing-capability when manifest requires caps the sub-agent does not provide (D-108)', () => {
    const manifest = makeManifest({ capabilities: ['file-read', 'shell-exec'] });
    const sa = makeSubAgent({ capabilities: ['file-read'] });  // no shell-exec
    const result = enforceSubAgentPolicy(manifest, sa);
    expect(result.decision).toBe('deny');
    expect(result.isCompliant).toBe(false);
    expect(result.violations.some((v) => v.kind === 'missing-capability' && v.capability === 'shell-exec')).toBe(true);
  });

  it('handles empty toolNames and capabilities gracefully (D-108)', () => {
    const manifest = makeManifest({ capabilities: ['file-read'] });
    const sa = makeSubAgent({ toolNames: [], capabilities: [] });
    const result = enforceSubAgentPolicy(manifest, sa);
    // No tools -> nothing to declare, but the manifest needs file-read and no tool provides it.
    expect(result.decision).toBe('deny');
    expect(result.isCompliant).toBe(false);
    expect(result.violations.some((v) => v.kind === 'missing-capability')).toBe(true);
  });
});
