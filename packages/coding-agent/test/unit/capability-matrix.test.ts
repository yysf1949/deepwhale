/**
 * buildCapabilityMatrix unit test -- D-100 v5.0 plugin governance 2nd cycle.
 *
 * After D-91 (vocabulary), D-92 (default-tool backfill), and D-93
 * (listByCapability query), D-100 adds the cross-pkg capability
 * matrix that crosses plugin-governance (D-91 ToolCapability) with
 * distribution/upgrade-flow (D-94 DistributionManifest). It answers:
 *   1. For each capability, which tools provide it?
 *   2. For each tool, is its capability in the manifest's allowlist?
 *
 * buildCapabilityMatrix is a PURE function. It does not log to
 * AuditLog; it returns a CapabilityMatrix that future runtime
 * consumers (changelog generators, profile-policy enforcers) can
 * inspect.
 */

import { describe, expect, it } from 'vitest';
import type { Tool } from '../../src/types.js';
import { buildCapabilityMatrix } from '../../src/governance/capability-matrix.js';
import { DISTRIBUTION_MANIFEST } from '../../src/distribution/manifest.js';

// Minimal Tool fixtures for tests. Mirrors the shape used in D-92 tests.
function makeTool(name: string, capabilities?: string[]): Tool {
  return {
    name,
    description: `mock ${name}`,
    inputSchema: { type: 'object', properties: {} },
    capabilities,
  } as unknown as Tool;
}

describe('buildCapabilityMatrix (D-100 v5.0 plugin governance 2nd cycle)', () => {
  it('builds inverted index: capability -> tool providers (D-100)', () => {
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('write-file', ['file-read', 'file-write']),
      makeTool('bash', ['shell-exec', 'network']),
    ];
    const matrix = buildCapabilityMatrix(DISTRIBUTION_MANIFEST, tools);
    // file-read: read-file + write-file
    const fileRead = matrix.entries.find((e) => e.capability === 'file-read');
    expect(fileRead).toBeDefined();
    expect(fileRead!.providers.sort()).toEqual(['read-file', 'write-file']);
    // file-write: write-file only
    const fileWrite = matrix.entries.find((e) => e.capability === 'file-write');
    expect(fileWrite!.providers).toEqual(['write-file']);
    // shell-exec: bash only
    const shellExec = matrix.entries.find((e) => e.capability === 'shell-exec');
    expect(shellExec!.providers).toEqual(['bash']);
    // network: bash only
    const network = matrix.entries.find((e) => e.capability === 'network');
    expect(network!.providers).toEqual(['bash']);
    // code-execute: no providers (manifest has it but no tool declares it)
    const codeExecute = matrix.entries.find((e) => e.capability === 'code-execute');
    expect(codeExecute).toBeDefined();
    expect(codeExecute!.providers).toEqual([]);
  });

  it('marks capabilities as declared based on manifest.capabilities membership (D-100)', () => {
    const tools = [makeTool('write-file', ['file-write'])];
    const matrix = buildCapabilityMatrix(DISTRIBUTION_MANIFEST, tools);
    const fileWrite = matrix.entries.find((e) => e.capability === 'file-write')!;
    expect(fileWrite.declared).toBe(true);  // file-write is in manifest.capabilities
    const fileRead = matrix.entries.find((e) => e.capability === 'file-read')!;
    expect(fileRead.declared).toBe(true);  // file-read is in manifest.capabilities
  });

  it('surfaces undeclared tool capabilities: tool declares a capability NOT in manifest.capabilities (D-100)', () => {
    const tools = [
      makeTool('rogue-tool', ['file-read', 'shell-exec']),
    ];
    // Custom manifest that does NOT allow shell-exec.
    const restrictedManifest = {
      ...DISTRIBUTION_MANIFEST,
      capabilities: ['file-read', 'file-write'] as const,
    };
    const matrix = buildCapabilityMatrix(restrictedManifest, tools);
    // file-read is declared (in manifest), shell-exec is NOT (not in manifest).
    const undeclared = matrix.undeclaredToolCapabilities;
    expect(undeclared).toEqual([{ toolName: 'rogue-tool', capability: 'shell-exec' }]);
  });

  it('lists tools without any capabilities field (legacy / ungoverned) (D-100)', () => {
    const tools = [
      makeTool('legacy-tool'),  // no capabilities field at all
      makeTool('governed-tool', ['file-read']),
      makeTool('explicit-empty', []),  // empty array, NOT "without"
    ];
    const matrix = buildCapabilityMatrix(DISTRIBUTION_MANIFEST, tools);
    expect(matrix.toolsWithoutCapabilities).toEqual(['legacy-tool']);
  });
});
