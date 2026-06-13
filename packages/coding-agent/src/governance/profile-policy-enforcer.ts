/**
 * enforceProfilePolicy -- D-103 v5.0 plugin governance 2nd cycle.
 *
 * Turns the D-100 buildCapabilityMatrix inverted index into a
 * policy gate. Answers two distinct questions:
 *   1. Drift: do any tools declare capabilities NOT in
 *      manifest.capabilities? -> undeclared-capability violation.
 *   2. Coverage: do all manifest capabilities have at least one
 *      provider in the registry? -> missing-capability violation.
 *
 * Together with D-91 (vocabulary), D-92 (usage on 19 default tools),
 * D-93 (query via ToolRegistry.listByCapability), D-100 (cross-theme
 * bridge buildCapabilityMatrix), and now D-103, the v5 plugin
 * governance 2nd cycle is COMPLETE: vocabulary + usage + query +
 * cross-theme bridge + enforcement.
 *
 * The function is a PURE data-shape function. Sync, no I/O, no
 * side effects, no logging to AuditLog. Returns a
 * PolicyEnforcementResult that future host-level gates (CLI, REPL,
 * TUI) can inspect for compliance decisions.
 *
 * DEFENSIVE: empty tools + empty manifest -> no violations,
 * isCompliant = true. Never throws.
 */

import type { Tool } from '../types.js';
import type { DistributionManifest } from '../distribution/manifest.js';
import type { ToolCapability } from './tool-capabilities.js';
import { buildCapabilityMatrix } from './capability-matrix.js';

export type PolicyViolationKind =
  | 'undeclared-capability'
  | 'missing-capability';

export interface PolicyViolation {
  readonly kind: PolicyViolationKind;
  readonly capability: ToolCapability;
  /** Tool names that contributed to the violation (undeclared) or that
   *  are required to provide the capability (missing: empty array). */
  readonly tools: readonly string[];
}

export interface PolicyEnforcementResult {
  readonly manifest: DistributionManifest;
  readonly violations: readonly PolicyViolation[];
  /** Convenience: true iff `violations` is empty. */
  readonly isCompliant: boolean;
  /** Convenience: violations.length. */
  readonly violationCount: number;
}

function groupUndeclaredByCapability(
  matrix: ReturnType<typeof buildCapabilityMatrix>,
): PolicyViolation[] {
  // Group undeclaredToolCapabilities by capability, collecting tool names.
  // Use dict-based dedup so iteration order is deterministic across runs.
  const groupsDict: Partial<Record<ToolCapability, string[]>> = {};
  for (const { toolName, capability } of matrix.undeclaredToolCapabilities) {
    if (groupsDict[capability] === undefined) {
      groupsDict[capability] = [];
    }
    groupsDict[capability]!.push(toolName);
  }
  const out: PolicyViolation[] = [];
  for (const cap of Object.keys(groupsDict) as ToolCapability[]) {
    out.push({
      kind: 'undeclared-capability',
      capability: cap,
      tools: groupsDict[cap]!,
    });
  }
  return out;
}

function findMissingCapabilities(
  matrix: ReturnType<typeof buildCapabilityMatrix>,
): PolicyViolation[] {
  // Find declared capabilities with zero providers.
  const out: PolicyViolation[] = [];
  for (const entry of matrix.entries) {
    if (entry.declared && entry.providers.length === 0) {
      out.push({
        kind: 'missing-capability',
        capability: entry.capability,
        tools: [],
      });
    }
  }
  return out;
}

/**
 * Enforce a profile policy against the running tool registry.
 * Reuses D-100 buildCapabilityMatrix as the data shape and adds
 * the enforcement layer.
 */
export function enforceProfilePolicy(
  manifest: DistributionManifest,
  tools: readonly Tool[],
): PolicyEnforcementResult {
  const matrix = buildCapabilityMatrix(manifest, tools);
  const violations: PolicyViolation[] = [
    ...groupUndeclaredByCapability(matrix),
    ...findMissingCapabilities(matrix),
  ];
  return {
    manifest,
    violations,
    isCompliant: violations.length === 0,
    violationCount: violations.length,
  };
}
