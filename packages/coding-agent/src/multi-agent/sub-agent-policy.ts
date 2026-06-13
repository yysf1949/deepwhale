/**
 * enforceSubAgentPolicy -- D-108 v6.0 multi-agent safety seed part 2.
 *
 * Thin wrapper around enforceProfilePolicy (D-103) for sub-agents.
 * Constructs a minimal Tool[] from the sub-agent's declared tool
 * names + capabilities, runs the parent profile policy against it,
 * and returns a SubAgentPolicyEvaluation with sub-agent-specific
 * metadata (id, parentAgentId, decision, summary) attached.
 *
 * All real enforcement logic lives in D-103. D-108 is purely
 * composition + presentation.
 *
 * DEFENSIVE: never throws. Empty toolNames or capabilities are
 * allowed. The function is pure.
 */

import type { SubAgent, SubAgentId } from './sub-agent.js';
import type { DistributionManifest } from '../distribution/manifest.js';
import type { PolicyEnforcementResult } from '../governance/profile-policy-enforcer.js';
import { enforceProfilePolicy } from '../governance/profile-policy-enforcer.js';
import type { Tool } from '../types.js';

export type SubAgentPolicyDecision = 'allow' | 'deny';

export interface SubAgentPolicyEvaluation extends PolicyEnforcementResult {
  readonly subAgentId: SubAgentId;
  readonly parentAgentId: string;
  readonly decision: SubAgentPolicyDecision;
  readonly summary: string;
}

function buildSubAgentTools(subAgent: SubAgent): readonly Tool[] {
  return subAgent.toolNames.map(
    (name): Tool => ({
      name,
      description: subAgent.description,
      risk: 'low',
      schema: { type: 'object', properties: {} },
      capabilities: [...subAgent.capabilities],
      execute: () => Promise.resolve({ success: true, content: '' }),
    }),
  );
}

function buildSummary(subAgent: SubAgent, result: PolicyEnforcementResult): string {
  if (result.isCompliant) {
    return `${subAgent.description} can run (0 violations)`;
  }
  const kindSummary = result.violations
    .map((v) => `${v.kind}: ${v.capability}`)
    .join('; ');
  return `${subAgent.description} denied: ${result.violationCount} violations (${kindSummary})`;
}

/**
 * Evaluate a sub-agent against the parent agent's DistributionManifest.
 * Returns a SubAgentPolicyEvaluation with the policy decision
 * (allow / deny) plus all violations found.
 *
 * The function is a thin wrapper around enforceProfilePolicy
 * (D-103). It reuses D-103's violations semantics:
 * - 'undeclared-capability': the sub-agent declares a ToolCapability
 *   that is not in the manifest.
 * - 'missing-capability': the manifest requires a ToolCapability
 *   that no sub-agent tool provides.
 */
export function enforceSubAgentPolicy(
  manifest: DistributionManifest,
  subAgent: SubAgent,
): SubAgentPolicyEvaluation {
  const subAgentTools = buildSubAgentTools(subAgent);
  const result = enforceProfilePolicy(manifest, subAgentTools);
  const decision: SubAgentPolicyDecision = result.isCompliant ? 'allow' : 'deny';
  return {
    ...result,
    subAgentId: subAgent.id,
    parentAgentId: subAgent.parentAgentId,
    decision,
    summary: buildSummary(subAgent, result),
  };
}
