/**
 * enforceProfilePolicy unit test -- D-103 v5.0 plugin governance 2nd cycle.
 *
 * After D-100 (buildCapabilityMatrix inverted index) and D-101
 * (generateChangelog) and D-102 (dumpAuditLog), D-103 turns the
 * capability matrix into a policy gate. The function answers:
 * "Given a manifest's allowed-capability list and the actual
 * tool registry, are the tools authorized, and does the manifest's
 * contract have providers for every declared capability?"
 *
 * Two violation kinds:
 *   1. undeclared-capability: a tool declares a capability NOT in
 *      the manifest (drift signal -- tool is over-privileged).
 *   2. missing-capability: a manifest-required capability has no
 *      providers (coverage gap -- manifest contract unfulfilled).
 *
 * The function is a PURE data-shape function. Sync, no I/O, no
 * side effects. Returns a PolicyEnforcementResult that future
 * host-level gates can inspect.
 */

import { describe, expect, it } from 'vitest';
import { enforceProfilePolicy } from '../../src/governance/profile-policy-enforcer.js';
import type { Tool } from '../../src/types.js';
import type { ToolName } from '@deepwhale/core';
import type { DistributionManifest } from '../../src/distribution/manifest.js';
import type { ToolCapability } from '../../src/governance/tool-capabilities.js';

function makeTool(name: string, capabilities: readonly ToolCapability[]): Tool {
  return {
    name: name as ToolName,
    description: `mock tool ${name}`,
    risk: 'low',
    schema: { type: 'object', properties: {} },
    capabilities: [...capabilities] as ToolCapability[],
    execute: () => Promise.resolve({ success: true, content: '' }),
  };
}

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

describe('enforceProfilePolicy (D-103 v5.0 plugin governance 2nd cycle)', () => {
  it('returns isCompliant=true when all tool capabilities are declared (D-103)', () => {
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('write-file', ['file-write', 'file-read']),
      makeTool('bash', ['shell-exec']),
    ];
    const result = enforceProfilePolicy(makeManifest(), tools);
    expect(result.isCompliant).toBe(true);
    expect(result.violationCount).toBe(0);
    expect(result.violations).toHaveLength(0);
  });

  it('emits undeclared-capability violation when a tool declares a forbidden cap (D-103)', () => {
    // 'network' is NOT in the manifest's allowlist. The manifest
    // also requires file-write and shell-exec with no providers,
    // so we expect 1 undeclared-capability + 2 missing-capability
    // = 3 violations total, but the undeclared one is what this
    // test pins down.
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('curl', ['network']),
    ];
    const result = enforceProfilePolicy(makeManifest(), tools);
    expect(result.isCompliant).toBe(false);
    const undeclared = result.violations.filter((v) => v.kind === 'undeclared-capability');
    expect(undeclared).toHaveLength(1);
    const v = undeclared[0]!;
    expect(v.capability).toBe('network');
    expect(v.tools).toEqual(['curl']);
  });

  it('emits missing-capability violation when manifest requires a cap with no providers (D-103)', () => {
    // The manifest declares 'file-write' and 'shell-exec' as required,
    // but the registry only provides 'file-read'. The unused caps
    // become missing-capability violations.
    const tools = [
      makeTool('read-file', ['file-read']),
    ];
    const manifest = makeManifest({
      capabilities: ['file-read', 'file-write', 'shell-exec'],
    });
    const result = enforceProfilePolicy(manifest, tools);
    expect(result.isCompliant).toBe(false);
    const missing = result.violations.filter((v) => v.kind === 'missing-capability');
    expect(missing).toHaveLength(2);
    const missingCaps = missing.map((v) => v.capability).sort();
    expect(missingCaps).toEqual(['file-write', 'shell-exec']);
    for (const v of missing) {
      expect(v.tools).toEqual([]);
    }
  });

  it('surfaces BOTH undeclared-capability AND missing-capability in one run (D-103)', () => {
    // 'curl' declares 'network' (undeclared). The manifest only
    // declares file-read (provided by read-file); all other caps
    // are absent -> no missing-capability violations in this case.
    // Total = 1 undeclared-capability. We expect both kinds to
    // appear in the violations list when the manifest is built
    // with mixed coverage.
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('curl', ['network']),
    ];
    // Manifest declares 'file-read' (provided) + 'shell-exec' (missing).
    // So 1 missing + 1 undeclared = 2 violations.
    const manifest = makeManifest({ capabilities: ['file-read', 'shell-exec'] });
    const result = enforceProfilePolicy(manifest, tools);
    expect(result.isCompliant).toBe(false);
    expect(result.violationCount).toBe(2);
    const kinds = result.violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(['missing-capability', 'undeclared-capability']);
  });
});
