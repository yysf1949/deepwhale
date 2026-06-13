/**
 * buildSubAgentPolicySnapshot unit test -- D-110 v6.0 multi-agent safety
 * Theme 1 2nd cycle cross-bridge.
 *
 * After D-107 (foundational types) + D-108 (enforceSubAgentPolicy
 * enforcement) + D-109 (rollbackSubAgent rollback layer), D-110
 * unifies the enforcement + rollback layers into a single
 * SubAgentPolicySnapshot struct. Mirrors the v5.0 D-105
 * buildPolicySnapshot cross-theme bridge pattern.
 *
 * The function is a PURE orchestration layer: it calls
 * enforceSubAgentPolicy (D-108, sync) and rollbackSubAgent
 * (D-109, sync), then composes their results into a unified
 * snapshot with a `canRun` flag and a human-readable summary.
 *
 * D-110 does NOT modify D-108, D-109, or D-107 outputs. The
 * snapshot is additive composition only.
 */

import { describe, expect, it } from 'vitest';
import { buildSubAgentPolicySnapshot } from '../../src/multi-agent/sub-agent-policy-snapshot.js';
import { asSubAgentId, type SubAgent } from '../../src/multi-agent/sub-agent.js';
import type { DistributionManifest } from '../../src/distribution/manifest.js';
import type { AuditEvent } from '../../src/observability/audit-log.js';
import type { ToolName } from '@deepwhale/core';

const SA_A = 'sa-summarizer';

function makeSubAgent(overrides: Partial<SubAgent> = {}): SubAgent {
  return {
    id: asSubAgentId(SA_A),
    parentAgentId: 'parent-A',
    description: 'summarizer',
    capabilities: ['file-read', 'file-write', 'shell-exec'],
    toolNames: ['Read' as ToolName, 'Edit' as ToolName],
    createdAt: 1_000_000,
    ...overrides,
  };
}

function makeManifest(): DistributionManifest {
  return {
    package: '@deepwhale/coding-agent',
    version: '1.0.0',
    channel: 'npm',
    nodeEngine: '>=20',
    capabilities: ['file-read', 'file-write', 'shell-exec'],
    supportedUpgradesFrom: [],
  };
}

function makeEvent(timestamp: number, subAgentId: string, kind: string): AuditEvent {
  return { kind, timestamp, payload: { subAgentId } };
}

describe('buildSubAgentPolicySnapshot (D-110 v6.0 multi-agent safety 2nd cycle cross-bridge)', () => {
  it('returns canRun=true when policy allows and rollback has no-events (D-110)', async () => {
    const now = 2_000;
    const result = await buildSubAgentPolicySnapshot({
      manifest: makeManifest(),
      subAgent: makeSubAgent(),
      events: [],
      clock: () => now,
    });
    expect(result.subAgentId).toBe(SA_A);
    expect(result.takenAt).toBe(now);
    expect(result.policy.decision).toBe('allow');
    expect(result.rollback.outcome).toBe('no-events');
    expect(result.summary.canRun).toBe(true);
    expect(result.summary.policyDecision).toBe('allow');
    expect(result.summary.rollbackOutcome).toBe('no-events');
    expect(result.summary.violationCount).toBe(0);
    expect(result.summary.eventsRolledBack).toBe(0);
    expect(result.summary.summary).toContain('allow');
    expect(result.summary.summary).toContain(SA_A);
  });

  it('returns canRun=false when policy denies (D-110)', async () => {
    const subAgent = makeSubAgent({
      capabilities: ['file-read', 'file-write', 'shell-exec', 'network'],
    });
    const result = await buildSubAgentPolicySnapshot({
      manifest: makeManifest(),
      subAgent,
      events: [],
    });
    expect(result.summary.canRun).toBe(false);
    expect(result.summary.policyDecision).toBe('deny');
    expect(result.summary.violationCount).toBeGreaterThan(0);
  });

  it('returns canRun=false when rollback actually rolled back events (D-110)', async () => {
    const events: AuditEvent[] = [
      makeEvent(1_000, SA_A, 'tool-call'),
      makeEvent(1_001, SA_A, 'tool-call'),
    ];
    const result = await buildSubAgentPolicySnapshot({
      manifest: makeManifest(),
      subAgent: makeSubAgent(),
      events,
    });
    // Policy allows, but rollback.rolled-back -> canRun must be false.
    expect(result.summary.canRun).toBe(false);
    expect(result.summary.policyDecision).toBe('allow');
    expect(result.summary.rollbackOutcome).toBe('rolled-back');
    expect(result.summary.eventsRolledBack).toBe(2);
  });

  it('returns canRun=true when rollback is in dryRun mode (D-110)', async () => {
    const events: AuditEvent[] = [
      makeEvent(1_000, SA_A, 'tool-call'),
      makeEvent(1_001, SA_A, 'tool-call'),
    ];
    const result = await buildSubAgentPolicySnapshot({
      manifest: makeManifest(),
      subAgent: makeSubAgent(),
      events,
      rollbackOptions: { dryRun: true },
    });
    // dryRun is a preview, not an actual rollback -> canRun still true.
    expect(result.summary.canRun).toBe(true);
    expect(result.summary.rollbackOutcome).toBe('dry-run');
  });
});
