/**
 * buildPolicySnapshot unit test -- D-105 v5.0 cross-theme bridge.
 *
 * After D-100 (capability matrix), D-101 (changelog generator),
 * D-103 (policy enforcement), and D-104 (cross-instance rollback),
 * D-105 is the cross-theme bridge that ties them all into a single
 * PolicySnapshot struct. The function orchestrates the 4 v5.0
 * 2nd-cycle sub-sprint outputs and returns a flat, host-friendly
 * summary (isCompliant + isProceed + violationCount).
 *
 * The function is async (because D-104 is async). It does NOT
 * log to the AuditLog. It is a thin orchestration layer; all
 * 4 underlying functions do the real work.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPolicySnapshot } from '../../src/policy-snapshot.js';
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

let auditPath: string;

beforeEach(async () => {
  auditPath = join(tmpdir(), `snapshot-test-${Date.now()}-${Math.random()}.jsonl`);
  await fsp.writeFile(auditPath, '', 'utf8');
});

afterEach(async () => {
  try { await fsp.unlink(auditPath); } catch { /* ok */ }
});

async function appendEvent(event: { timestamp: number; kind: string; payload?: Record<string, unknown> }): Promise<void> {
  await fsp.appendFile(auditPath, JSON.stringify(event) + '\n', 'utf8');
}

describe('buildPolicySnapshot (D-105 v5.0 cross-theme bridge)', () => {
  it('returns isCompliant + isProceed when everything aligns (D-105)', async () => {
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('write-file', ['file-write']),
      makeTool('bash', ['shell-exec']),
    ];
    const now = 1_000_000;
    await appendEvent({ timestamp: now - 5_000, kind: 'graceful-shutdown', payload: { reason: 'SIGTERM' } });
    const snapshot = await buildPolicySnapshot({
      currentManifest: makeManifest(),
      previousManifest: makeManifest({ version: '2.2.0' }),
      tools,
      auditPath,
      maxStaleMs: 60_000,
      clock: () => now,
    });
    expect(snapshot.summary.isCompliant).toBe(true);
    expect(snapshot.summary.isProceed).toBe(true);
    expect(snapshot.summary.violationCount).toBe(0);
    // All 4 sub-results present.
    expect(snapshot.capabilityMatrix.entries.length).toBeGreaterThan(0);
    expect(snapshot.changelog.entries[0]!.summary).toBe('2.2.0 -> 2.3.0');
    expect(snapshot.policyEnforcement.isCompliant).toBe(true);
    expect(snapshot.crossInstance.decision).toBe('proceed');
  });

  it('flips isCompliant to false when a tool declares an undeclared capability (D-105)', async () => {
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('curl', ['network']),  // 'network' NOT in manifest
    ];
    const now = 1_000_000;
    await appendEvent({ timestamp: now - 5_000, kind: 'graceful-shutdown' });
    const snapshot = await buildPolicySnapshot({
      currentManifest: makeManifest(),
      previousManifest: makeManifest({ version: '2.2.0' }),
      tools,
      auditPath,
      maxStaleMs: 60_000,
      clock: () => now,
    });
    expect(snapshot.summary.isCompliant).toBe(false);
    expect(snapshot.summary.violationCount).toBeGreaterThan(0);
    expect(snapshot.summary.isProceed).toBe(true);  // cross-instance still clean
  });

  it('flips isProceed to false when audit log is stale (D-105)', async () => {
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('write-file', ['file-write']),
      makeTool('bash', ['shell-exec']),
    ];
    const now = 1_000_000;
    // Audit event 5 minutes ago, even though it was graceful.
    await appendEvent({ timestamp: now - 5 * 60_000, kind: 'graceful-shutdown' });
    const snapshot = await buildPolicySnapshot({
      currentManifest: makeManifest(),
      previousManifest: makeManifest({ version: '2.2.0' }),
      tools,
      auditPath,
      maxStaleMs: 60_000,  // 1 minute window
      clock: () => now,
    });
    expect(snapshot.summary.isCompliant).toBe(true);  // tools are fine
    expect(snapshot.summary.isProceed).toBe(false);   // but prior instance is stale
    expect(snapshot.crossInstance.decision).toBe('rollback');
  });

  it('handles empty inputs gracefully (no tools, no manifest diff, no audit) (D-105)', async () => {
    const snapshot = await buildPolicySnapshot({
      currentManifest: makeManifest({ capabilities: [] }),
      previousManifest: makeManifest({ capabilities: [], version: '2.2.0' }),
      tools: [],
      auditPath: join(tmpdir(), `snapshot-missing-${Date.now()}-${Math.random()}.jsonl`),
      maxStaleMs: 60_000,
    });
    expect(snapshot.summary.isCompliant).toBe(true);
    expect(snapshot.summary.violationCount).toBe(0);
    // No prior audit log -> no-evidence (NOT proceed, NOT rollback).
    expect(snapshot.crossInstance.decision).toBe('no-evidence');
    expect(snapshot.summary.isProceed).toBe(false);  // strict: only 'proceed' counts
  });
});
