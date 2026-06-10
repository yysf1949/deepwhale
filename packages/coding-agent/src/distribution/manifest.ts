/**
 * Distribution manifest — D-94 v5.0 distribution/upgrade flow theme 1st evidence.
 *
 * A typed single-source-of-truth constant for the current distribution
 * state of @deepwhale/coding-agent. The manifest is the foundation for
 * future D-95+ work (upgrade check, capability matrix, changelog
 * generator). All fields are required.
 *
 * The capabilities field is constrained to the same TOOL_CAPABILITIES
 * vocabulary that the v5.0 plugin-governance theme uses (D-91), so the
 * two themes share a single source of truth for what tools are
 * enabled in the default profile.
 */

import { TOOL_CAPABILITIES, type ToolCapability } from '../governance/tool-capabilities.js';

export type DistributionChannel = 'npm' | 'github' | 'local';

export interface DistributionManifest {
  /** Package name (e.g. '@deepwhale/coding-agent'). */
  readonly package: string;
  /** Semver version (e.g. '2.2.0'). */
  readonly version: string;
  /** Distribution channel. */
  readonly channel: DistributionChannel;
  /** Supported Node engine range (semver range syntax). */
  readonly nodeEngine: string;
  /** Tool capabilities enabled by the default profile. */
  readonly capabilities: readonly ToolCapability[];
  /** Semver ranges we officially support as upgrade origins. */
  readonly supportedUpgradesFrom: readonly string[];
}

/**
 * The current distribution manifest. This is the single source of truth
 * for the package version + channel + capabilities + supported upgrade
 * origins. Future D-NN can add an upgrade-check function that compares
 * this constant against a fetched latest version.
 */
export const DISTRIBUTION_MANIFEST: DistributionManifest = {
  package: '@deepwhale/coding-agent',
  version: '2.2.0',
  channel: 'npm',
  nodeEngine: '>=20.0.0',
  capabilities: [
    'file-read',
    'file-write',
    'shell-exec',
    'network',
    'code-execute',
  ],
  supportedUpgradesFrom: ['>=2.0.0 <2.2.0'],
};

/**
 * Structural validator: returns true if the value is a non-null object
 * with all required string/array fields. Used by future upgrade-check
 * code to verify a manifest fetched from a remote source.
 */
export function isValidDistributionManifest(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Partial<DistributionManifest>;
  return (
    typeof v.package === 'string' &&
    v.package.length > 0 &&
    typeof v.version === 'string' &&
    /^\d+\.\d+\.\d+/.test(v.version) &&
    (v.channel === 'npm' || v.channel === 'github' || v.channel === 'local') &&
    typeof v.nodeEngine === 'string' &&
    v.nodeEngine.length > 0 &&
    Array.isArray(v.capabilities) &&
    v.capabilities.every((c) => TOOL_CAPABILITIES.includes(c as ToolCapability)) &&
    Array.isArray(v.supportedUpgradesFrom) &&
    v.supportedUpgradesFrom.every((s) => typeof s === 'string')
  );
}
