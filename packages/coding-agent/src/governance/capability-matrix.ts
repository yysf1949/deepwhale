/**
 * Capability matrix -- D-100 v5.0 plugin governance 2nd cycle.
 *
 * Cross-pkg bridge between v5.0 plugin-governance theme (D-91
 * ToolCapability vocabulary) and v5.0 distribution/upgrade flow
 * theme (D-94 DistributionManifest). Answers:
 *   1. For each capability (declared in manifest OR observed in tools),
 *      which tools in the registry provide it?
 *   2. For each tool, is its declared capability in the manifest's
 *      allowlist? (Drift signal: undeclaredToolCapabilities.)
 *
 * The matrix is a PURE function (no I/O, no side effects). It does
 * NOT log to the AuditLog. Future runtime consumers can use it:
 *   - Changelog generators: "tool X now claims capability Y".
 *   - Profile-policy enforcers: reject tools with undeclared capabilities.
 *   - Drift detectors: surface manifest/tool mismatch.
 *
 * After D-91 (vocabulary), D-92 (default-tool backfill), D-93
 * (listByCapability query), and D-100 (capability matrix), the
 * v5.0 plugin-governance theme has 4 evidence pieces spanning
 * vocabulary + usage + query + cross-theme bridge. This is the
 * theme's 1st cycle COMPLETE; future D-101+ can move to a 2nd
 * cycle (profile-policy enforcement, drift detector, etc.).
 */

import type { Tool } from '../types.js';
import type { DistributionManifest } from '../distribution/manifest.js';
import { type ToolCapability, toolCapabilities } from './tool-capabilities.js';

export interface CapabilityMatrixEntry {
  readonly capability: ToolCapability;
  /** Tool names (from Tool.name) that declare this capability. */
  readonly providers: readonly string[];
  /** True iff this capability is in manifest.capabilities (the allowlist). */
  readonly declared: boolean;
}

export interface UndeclaredToolCapability {
  readonly toolName: string;
  readonly capability: ToolCapability;
}

export interface CapabilityMatrix {
  /** Inverted index: capability -> providers. One entry per (declared ∪ observed). */
  readonly entries: readonly CapabilityMatrixEntry[];
  /** Tools that declare a capability NOT in the manifest's allowlist (drift signal). */
  readonly undeclaredToolCapabilities: readonly UndeclaredToolCapability[];
  /** Tools with no `capabilities` field at all (legacy / ungoverned). */
  readonly toolsWithoutCapabilities: readonly string[];
}

/**
 * Build a capability matrix from a distribution manifest and a list
 * of tools. The matrix is pure: it does not mutate the inputs.
 */
export function buildCapabilityMatrix(
  manifest: DistributionManifest,
  tools: readonly Tool[],
): CapabilityMatrix {
  // Step 1: collect all observed + declared capabilities (using a dict
  // for O(1) dedup; Set<T> iteration needs downlevelIteration).
  const observedSet: Partial<Record<ToolCapability, true>> = {};
  for (const tool of tools) {
    for (const cap of toolCapabilities(tool)) {
      observedSet[cap] = true;
    }
  }
  const manifestSet: Partial<Record<ToolCapability, true>> = {};
  for (const cap of manifest.capabilities) {
    manifestSet[cap] = true;
  }

  // Step 2: build the inverted index.
  // Use array with dict-based dedup (Set<T> for-of needs downlevelIteration).
  const allCapabilitiesDict: Partial<Record<ToolCapability, true>> = { ...observedSet };
  for (const cap of Object.keys(manifestSet) as ToolCapability[]) {
    allCapabilitiesDict[cap] = true;
  }
  const allCapabilities: ToolCapability[] = Object.keys(allCapabilitiesDict) as ToolCapability[];
  const entries: CapabilityMatrixEntry[] = [];
  for (const capability of allCapabilities) {
    const providers: string[] = [];
    for (const tool of tools) {
      if (toolCapabilities(tool).includes(capability)) {
        providers.push(tool.name);
      }
    }
    entries.push({
      capability,
      providers,
      declared: manifestSet[capability] === true,
    });
  }

  // Step 3: surface undeclared tool capabilities.
  const undeclaredToolCapabilities: UndeclaredToolCapability[] = [];
  for (const tool of tools) {
    for (const cap of toolCapabilities(tool)) {
      if (manifestSet[cap] !== true) {
        undeclaredToolCapabilities.push({ toolName: tool.name, capability: cap });
      }
    }
  }

  // Step 4: list tools without a `capabilities` field at all.
  // Note: empty array [] is treated as "explicitly no capabilities" and is
  // NOT in toolsWithoutCapabilities; only `undefined` is.
  const toolsWithoutCapabilities: string[] = [];
  for (const tool of tools) {
    if (tool.capabilities === undefined) {
      toolsWithoutCapabilities.push(tool.name);
    }
  }

  return {
    entries,
    undeclaredToolCapabilities,
    toolsWithoutCapabilities,
  };
}
