import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import {
  evaluateV2Tier1Precheck,
  type V2Tier1PrecheckCheckId,
  type V2Tier1PrecheckResult,
} from '../../src/release/v2-tier1-precheck.js';

function statusOf(result: V2Tier1PrecheckResult, id: V2Tier1PrecheckCheckId): string | undefined {
  return result.checks.find((check) => check.id === id)?.status;
}

describe('v2.0 Tier-1 release precheck (D128)', () => {
  it('passes helper-layer checks but keeps the current v2.0 gate blocked', () => {
    const result = evaluateV2Tier1Precheck({
      defaultToolNames: createDefaultRegistry().list().map((tool) => tool.name),
    });

    expect(result.milestone).toBe('v2.0');
    expect(result.tier).toBe('Tier-1');
    expect(result.passed).toBe(false);
    expect(result.summary).toContain('not release-ready');
    expect(statusOf(result, 'browser-tier1-foundation')).toBe('pass');
    expect(statusOf(result, 'memory-ranking')).toBe('pass');
    expect(statusOf(result, 'code-intel-semantic-fallback')).toBe('pass');
    expect(statusOf(result, 'default-exposure')).toBe('pass');
    expect(statusOf(result, 'production-browser-automation')).toBe('blocked');
    expect(statusOf(result, 'visual-grounding')).toBe('blocked');
    expect(statusOf(result, 'tier2-blockers')).toBe('blocked');
    expect(result.defaultExposure.toolCount).toBe(21);
    expect(result.defaultExposure.nonCodingDefaultEnabled).toBe(false);
    expect(result.defaultExposure.caveat).toContain('coding-surface helpers');
    expect(result.blockers).toContain('production Browser automation proof is still missing');
    expect(result.nextActions[0]).toContain('production Browser automation');
  });

  it('fails default exposure when an opt-in non-coding tool leaks into defaults', () => {
    const result = evaluateV2Tier1Precheck({
      defaultToolNames: ['read_file', 'desktop_control'],
    });

    const check = result.checks.find((entry) => entry.id === 'default-exposure');
    expect(check?.status).toBe('fail');
    expect(check?.missing).toContain('unexpected default tools: desktop_control');
    expect(result.passed).toBe(false);
  });

  it('fails a helper check when required evidence is missing', () => {
    const result = evaluateV2Tier1Precheck({
      missingEvidencePaths: ['packages/coding-agent/src/memory/ranking.ts'],
    });

    const check = result.checks.find((entry) => entry.id === 'memory-ranking');
    expect(check?.status).toBe('fail');
    expect(check?.missing).toContain('packages/coding-agent/src/memory/ranking.ts');
    expect(result.passed).toBe(false);
  });

  it('ships a machine-readable D128 evidence snapshot', () => {
    const evidence = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/superpowers/v2-tier1-precheck.json'), 'utf8'),
    ) as {
      slice: string;
      milestone: string;
      tier: string;
      passed: boolean;
      blockers: string[];
      checks: Array<{ id: string; status: string }>;
    };

    expect(evidence.slice).toBe('D128');
    expect(evidence.milestone).toBe('v2.0');
    expect(evidence.tier).toBe('Tier-1');
    expect(evidence.passed).toBe(false);
    expect(evidence.blockers).toContain('production Browser automation proof is still missing');
    expect(evidence.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      'browser-tier1-foundation:pass',
      'memory-ranking:pass',
      'code-intel-semantic-fallback:pass',
      'default-exposure:pass',
      'production-browser-automation:blocked',
      'visual-grounding:blocked',
      'tier2-blockers:blocked',
    ]);
  });
});
