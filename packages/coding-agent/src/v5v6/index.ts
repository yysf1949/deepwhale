/**
 * v5/v6 Integration Module
 *
 * Ties together the v5/v6 seed work into a unified API:
 * - Observability (AuditLog)
 * - Plugin Governance (ToolCapabilities, PolicyEnforcement)
 * - Distribution (Manifest, UpgradeCheck, Changelog)
 * - Production Hardening (SignalHandlers, GracefulShutdown)
 * - Multi-Agent Safety (SubAgentRegistry, Policy)
 */

// Observability
export { AuditLog } from '../observability/audit-log.js';
export { PersistingAuditLog } from '../observability/persisting-audit-log.js';
export { readAuditLog } from '../observability/audit-log-reader.js';
export { dumpAuditLog } from '../observability/audit-log-dump.js';

// Plugin Governance
export { toolCapabilities, isToolCapability, type ToolCapability } from '../governance/tool-capabilities.js';
export { buildCapabilityMatrix, type CapabilityMatrix } from '../governance/capability-matrix.js';
export { enforceProfilePolicy, type PolicyEnforcementResult } from '../governance/profile-policy-enforcer.js';

// Distribution
export { DISTRIBUTION_MANIFEST, isValidDistributionManifest, type DistributionManifest } from '../distribution/manifest.js';
export { compareVersions, type UpgradeCheckResult } from '../distribution/upgrade-check.js';
export { generateChangelog, type ChangelogDocument } from '../distribution/changelog-generator.js';

// Production Hardening
export { formatFatalError } from '../hardening/fatal-error.js';
export { installSignalHandlers } from '../hardening/signal-handler.js';
export { installProcessUncaughtHandlers } from '../hardening/process-uncaught-handler.js';
export { gracefulShutdown } from '../hardening/graceful-shutdown.js';
export { evaluateCrossInstanceRollback } from '../hardening/cross-instance-rollback.js';

// Policy Snapshot (cross-theme bridge)
export { buildPolicySnapshot, type PolicySnapshot } from '../policy-snapshot.js';

/**
 * Get a summary of all v5/v6 capabilities.
 */
export function getV5V6Capabilities(): {
  observability: boolean;
  pluginGovernance: boolean;
  distribution: boolean;
  productionHardening: boolean;
  policySnapshot: boolean;
} {
  return {
    observability: true,
    pluginGovernance: true,
    distribution: true,
    productionHardening: true,
    policySnapshot: true,
  };
}
