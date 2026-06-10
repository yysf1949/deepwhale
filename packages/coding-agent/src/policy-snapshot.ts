/**
 * buildPolicySnapshot -- D-105 v5.0 cross-theme bridge.
 *
 * Thin orchestration layer that ties the 4 v5.0 2nd-cycle
 * sub-sprint outputs (D-100, D-101, D-103, D-104) into a single
 * PolicySnapshot struct. A future CLI / REPL / TUI can display
 * the snapshot as a single "status dashboard" without needing to
 * call each function individually.
 *
 * Three themes are bridged here:
 *   - plugin governance (D-100 capability matrix + D-103 enforcement)
 *   - distribution/upgrade flow (D-101 changelog)
 *   - production hardening (D-104 cross-instance recovery)
 *
 * The 4th theme (observability+auditability) surfaces indirectly
 * via D-104's audit log read.
 *
 * The function is async (because D-104 is async). It does NOT
 * log to the AuditLog (no recursion). It is DEFENSIVE: all 4
 * underlying functions are themselves defensive, so the aggregate
 * never throws.
 */

import { buildCapabilityMatrix } from './governance/capability-matrix.js';
import { generateChangelog } from './distribution/changelog-generator.js';
import { enforceProfilePolicy } from './governance/profile-policy-enforcer.js';
import { evaluateCrossInstanceRollback } from './hardening/cross-instance-rollback.js';
import type { Tool } from './types.js';
import type { DistributionManifest } from './distribution/manifest.js';
import type { CapabilityMatrix } from './governance/capability-matrix.js';
import type { ChangelogDocument } from './distribution/changelog-generator.js';
import type { PolicyEnforcementResult } from './governance/profile-policy-enforcer.js';
import type { RollbackEvaluation } from './hardening/cross-instance-rollback.js';

export interface BuildPolicySnapshotInput {
  readonly currentManifest: DistributionManifest;
  readonly previousManifest: DistributionManifest;
  readonly tools: readonly Tool[];
  readonly auditPath: string;
  readonly maxStaleMs: number;
  readonly clock?: () => number;
}

export interface PolicySnapshotSummary {
  /** True iff policyEnforcement has no violations. */
  readonly isCompliant: boolean;
  /** True iff crossInstance decision is 'proceed'. */
  readonly isProceed: boolean;
  /** Numeric count of profile policy violations. */
  readonly violationCount: number;
}

export interface PolicySnapshot {
  readonly takenAt: number;
  readonly capabilityMatrix: CapabilityMatrix;
  readonly changelog: ChangelogDocument;
  readonly policyEnforcement: PolicyEnforcementResult;
  readonly crossInstance: RollbackEvaluation;
  readonly summary: PolicySnapshotSummary;
}

/**
 * Build a unified PolicySnapshot from the 4 v5.0 2nd-cycle
 * sub-sprint outputs. Pure orchestration: no new logic, just
 * composition.
 */
export async function buildPolicySnapshot(
  input: BuildPolicySnapshotInput,
): Promise<PolicySnapshot> {
  const capabilityMatrix = buildCapabilityMatrix(input.currentManifest, input.tools);
  const changelog = generateChangelog(input.previousManifest, input.currentManifest);
  const policyEnforcement = enforceProfilePolicy(input.currentManifest, input.tools);
  const crossInstance = await evaluateCrossInstanceRollback(input.auditPath, {
    maxStaleMs: input.maxStaleMs,
    ...(input.clock !== undefined ? { clock: input.clock } : {}),
  });
  const takenAt = (input.clock ?? Date.now)();
  return {
    takenAt,
    capabilityMatrix,
    changelog,
    policyEnforcement,
    crossInstance,
    summary: {
      isCompliant: policyEnforcement.isCompliant,
      isProceed: crossInstance.decision === 'proceed',
      violationCount: policyEnforcement.violationCount,
    },
  };
}
