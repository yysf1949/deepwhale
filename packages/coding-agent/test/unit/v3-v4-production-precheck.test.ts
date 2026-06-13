import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { evaluateV3V4ProductionPrecheck } from '../../src/release/v3-v4-production-precheck.js';

function statusOf(
  result: ReturnType<typeof evaluateV3V4ProductionPrecheck>,
  id: string,
): string | undefined {
  return result.checks.find((check) => check.id === id)?.status;
}

describe('v3/v4 production precheck (D134)', () => {
  it('records current v3/v4 evidence and keeps production blockers explicit', () => {
    const result = evaluateV3V4ProductionPrecheck({
      defaultToolNames: createDefaultRegistry().list().map((tool) => tool.name),
    });

    expect(result.slice).toBe('D134');
    expect(result.passed).toBe(false);
    expect(result.completedChecks).toBe(5);
    expect(result.blockingChecks).toBe(2);
    expect(statusOf(result, 'v3-gate2-live-fixture')).toBe('pass');
    expect(statusOf(result, 'v3-reviewer-gate-boundary')).toBe('pass');
    expect(statusOf(result, 'v3-production-breadth')).toBe('blocked');
    expect(statusOf(result, 'v4-cross-session-agent-os')).toBe('pass');
    expect(statusOf(result, 'v4-persistent-memory-recovery')).toBe('pass');
    expect(statusOf(result, 'v4-cross-platform-sigkill')).toBe('blocked');
    expect(statusOf(result, 'default-exposure')).toBe('pass');
    expect(result.blockers).toEqual([
      'v3.0 production breadth needs multi-scenario long-horizon replay evidence',
      'v4.0 cross-platform SIGKILL/restore evidence is missing',
    ]);
    expect(result.defaultExposure.nonCodingDefaultEnabled).toBe(false);
    expect(result.nextActions[0]).toContain('D135');
  });

  it('fails default exposure when a non-coding tool leaks into defaults', () => {
    const result = evaluateV3V4ProductionPrecheck({
      defaultToolNames: ['read_file', 'desktop_control'],
    });

    expect(statusOf(result, 'default-exposure')).toBe('fail');
    expect(result.defaultExposure.nonCodingDefaultEnabled).toBe(true);
    expect(result.blockers).toContain('default registry exposure drift detected');
  });

  it('fails an evidence row when required evidence is missing', () => {
    const result = evaluateV3V4ProductionPrecheck({
      missingEvidencePaths: ['docs/superpowers/gate-2-long-horizon-live.json'],
    });

    expect(statusOf(result, 'v3-gate2-live-fixture')).toBe('fail');
    expect(result.blockers).toContain('missing evidence for v3-gate2-live-fixture');
  });

  it('ships machine-readable D134 evidence snapshot', () => {
    const snapshot = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/superpowers/v3-v4-production-precheck.json'), 'utf8'),
    ) as {
      slice: string;
      passed: boolean;
      blockers: string[];
      checks: Array<{ id: string; status: string }>;
    };

    expect(snapshot.slice).toBe('D134');
    expect(snapshot.passed).toBe(false);
    expect(snapshot.blockers).toEqual([
      'v3.0 production breadth needs multi-scenario long-horizon replay evidence',
      'v4.0 cross-platform SIGKILL/restore evidence is missing',
    ]);
    expect(snapshot.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      'v3-gate2-live-fixture:pass',
      'v3-reviewer-gate-boundary:pass',
      'v3-production-breadth:blocked',
      'v4-cross-session-agent-os:pass',
      'v4-persistent-memory-recovery:pass',
      'v4-cross-platform-sigkill:blocked',
      'default-exposure:pass',
    ]);
  });
});