/**
 * buildSubAgentPolicySnapshot -- D-110 v6.0 multi-agent safety
 * Theme 1 2nd cycle cross-bridge.
 *
 * Thin orchestration layer that ties the D-108 enforcement layer
 * (enforceSubAgentPolicy) and the D-109 rollback layer
 * (rollbackSubAgent) into a single SubAgentPolicySnapshot struct.
 * Mirrors the v5.0 D-105 buildPolicySnapshot cross-theme bridge
 * pattern.
 *
 * The function is PURE orchestration: no new logic, just
 * composition + presentation. It does NOT mutate the D-108 or
 * D-109 outputs; the snapshot is additive composition only.
 *
 * DEFENSIVE: never throws. Empty event list, missing
 * rollbackOptions, and missing clock are all handled gracefully.
 */

import type { AuditEvent } from '../observability/audit-log.js';
import type { DistributionManifest } from '../distribution/manifest.js';
import { enforceSubAgentPolicy, type SubAgentPolicyEvaluation } from './sub-agent-policy.js';
import {
  rollbackSubAgent,
  type SubAgentRollbackOptions,
  type SubAgentRollbackResult,
} from './rollback-sub-agent.js';
import type { SubAgent, SubAgentId } from './sub-agent.js';

export interface BuildSubAgentPolicySnapshotInput {
  readonly manifest: DistributionManifest;
  readonly subAgent: SubAgent;
  readonly events?: readonly AuditEvent[];
  readonly rollbackOptions?: SubAgentRollbackOptions;
  readonly clock?: () => number;
}

export interface SubAgentPolicySnapshotSummary {
  readonly policyDecision: 'allow' | 'deny';
  readonly rollbackOutcome: 'rolled-back' | 'no-events' | 'dry-run';
  readonly canRun: boolean;
  readonly violationCount: number;
  readonly eventsRolledBack: number;
  readonly summary: string;
}

export interface SubAgentPolicySnapshot {
  readonly subAgentId: SubAgentId;
  readonly takenAt: number;
  readonly policy: SubAgentPolicyEvaluation;
  readonly rollback: SubAgentRollbackResult;
  readonly summary: SubAgentPolicySnapshotSummary;
}

function buildSummaryText(
  subAgentId: SubAgentId,
  policyDecision: 'allow' | 'deny',
  rollbackOutcome: 'rolled-back' | 'no-events' | 'dry-run',
  violationCount: number,
  eventsRolledBack: number,
): string {
  return `sub-agent ${subAgentId}: ${policyDecision} + ${rollbackOutcome} (violations: ${violationCount}, events rolled back: ${eventsRolledBack})`;
}

/**
 * Build a unified SubAgentPolicySnapshot from a manifest, a
 * sub-agent, and an optional list of audit events.
 *
 * Calls enforceSubAgentPolicy (D-108, sync) and rollbackSubAgent
 * (D-109, sync), then composes their results into a single
 * snapshot with a `canRun` flag and a human-readable summary.
 *
 * `canRun` is true when policy.decision === 'allow' AND
 * rollback.outcome !== 'rolled-back'. The 'rolled-back' case
 * is an explicit signal that the sub-agent has done harmful
 * things and should NOT run anymore. The 'dry-run' case is
 * still canRun=true (we just previewed a rollback; the
 * sub-agent may continue).
 *
 * The function is PURE: it does not call any external service
 * and does not write to the audit log directly. The caller
 * persists via D-89 if needed.
 */
export async function buildSubAgentPolicySnapshot(
  input: BuildSubAgentPolicySnapshotInput,
): Promise<SubAgentPolicySnapshot> {
  const policy = enforceSubAgentPolicy(input.manifest, input.subAgent);
  const rollback = rollbackSubAgent(
    input.events ?? [],
    input.subAgent.id,
    input.rollbackOptions,
  );
  const takenAt = (input.clock ?? Date.now)();
  const canRun = policy.decision === 'allow' && rollback.outcome !== 'rolled-back';
  const summary: SubAgentPolicySnapshotSummary = {
    policyDecision: policy.decision,
    rollbackOutcome: rollback.outcome,
    canRun,
    violationCount: policy.violations.length,
    eventsRolledBack: rollback.eventsRolledBack,
    summary: buildSummaryText(
      input.subAgent.id,
      policy.decision,
      rollback.outcome,
      policy.violations.length,
      rollback.eventsRolledBack,
    ),
  };
  return {
    subAgentId: input.subAgent.id,
    takenAt,
    policy,
    rollback,
    summary,
  };
}
