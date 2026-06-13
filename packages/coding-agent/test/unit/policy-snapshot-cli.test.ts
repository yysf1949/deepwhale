/**
 * runPolicySnapshotCommand unit test -- D-129 v5.0 3rd-cycle depth.
 *
 * Tests the thin CLI surface that wraps the D-105 buildPolicySnapshot
 * cross-theme bridge. The CLI returns a `PolicySnapshotCommandResult`
 * containing both the typed `snapshot` (for programmatic consumption)
 * and a pretty-printed `json` string (for stdout piping to `jq` or
 * downstream tooling).
 *
 * Coverage:
 *   - happy path: valid input -> success=true with snapshot + json
 *   - json output is a stable, parseable JSON object that includes
 *     the same summary fields as the typed snapshot
 *   - invalid input (missing auditPath) -> success=false, no throws
 *   - invalid input (negative maxStaleMs) -> success=false, no throws
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPolicySnapshotCommand } from '../../src/cli/policy-snapshot-command.js';
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
  auditPath = join(tmpdir(), `cli-snapshot-test-${Date.now()}-${Math.random()}.jsonl`);
  await fsp.writeFile(auditPath, '', 'utf8');
});

afterEach(async () => {
  try { await fsp.unlink(auditPath); } catch { /* ok */ }
});

describe('runPolicySnapshotCommand (D-129 v5.0 3rd cycle CLI)', () => {
  it('returns success=true with a typed snapshot and parseable JSON for valid input (D-129)', async () => {
    const tools = [
      makeTool('read-file', ['file-read']),
      makeTool('write-file', ['file-write']),
      makeTool('bash', ['shell-exec']),
    ];
    const now = 1_000_000;
    // Seed a recent graceful-shutdown event so D-105 cross-instance is 'proceed'.
    await fsp.appendFile(
      auditPath,
      JSON.stringify({ timestamp: now - 5_000, kind: 'graceful-shutdown' }) + '\n',
      'utf8',
    );
    const result = await runPolicySnapshotCommand({
      currentManifest: makeManifest(),
      previousManifest: makeManifest({ version: '2.2.0' }),
      tools,
      auditPath,
      maxStaleMs: 60_000,
      clock: () => now,
    });
    expect(result.success).toBe(true);
    expect(result.snapshot).toBeDefined();
    expect(result.json).toBeDefined();

    // The typed snapshot mirrors the D-105 struct.
    expect(result.snapshot!.summary.isCompliant).toBe(true);
    expect(result.snapshot!.summary.isProceed).toBe(true);
    expect(result.snapshot!.summary.violationCount).toBe(0);
    expect(result.snapshot!.takenAt).toBe(now);

    // The JSON round-trips through JSON.parse and matches the typed snapshot.
    const parsed = JSON.parse(result.json!) as {
      takenAt: number;
      summary: { isCompliant: boolean; isProceed: boolean; violationCount: number };
    };
    expect(parsed.takenAt).toBe(now);
    expect(parsed.summary).toEqual({
      isCompliant: true,
      isProceed: true,
      violationCount: 0,
    });
    // Pretty-print contains newlines (2-space indent).
    expect(result.json).toContain('\n  ');
  });

  it('rejects input with a missing auditPath (success=false, no throw) (D-129)', async () => {
    const tools = [makeTool('read-file', ['file-read'])];
    const result = await runPolicySnapshotCommand({
      auditPath: '',
      currentManifest: makeManifest(),
      previousManifest: makeManifest({ version: '2.2.0' }),
      tools,
      maxStaleMs: 60_000,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.snapshot).toBeUndefined();
    expect(result.json).toBeUndefined();
  });

  it('rejects input with a negative maxStaleMs (success=false, no throw) (D-129)', async () => {
    const tools = [makeTool('read-file', ['file-read'])];
    const result = await runPolicySnapshotCommand({
      currentManifest: makeManifest(),
      previousManifest: makeManifest({ version: '2.2.0' }),
      tools,
      auditPath,
      maxStaleMs: -1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.snapshot).toBeUndefined();
  });

  it('rejects input that is not an object (success=false, no throw) (D-129)', async () => {
    // Pass a non-object value through a cast to bypass the type checker.
    const result = await runPolicySnapshotCommand(null as unknown as Parameters<typeof runPolicySnapshotCommand>[0]);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
