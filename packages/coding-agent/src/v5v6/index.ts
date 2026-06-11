/**
 * v5/v6 Integration Module
 *
 * Ties together the v5/v6 seed work into a unified API:
 * - Observability (AuditLog)
 * - Plugin Governance (ToolCapabilities, PolicyEnforcement)
 * - Distribution (Manifest, UpgradeCheck, Changelog)
 * - Production Hardening (SignalHandlers, GracefulShutdown)
 * - Multi-Agent Safety (SubAgentRegistry, Policy)
 * - Hosted/Enterprise (TenantRateLimit, TenantQuota, SSO/OIDC)
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
import { installSignalHandlers as _installSignalHandlers } from '../hardening/signal-handler.js';
import { installProcessUncaughtHandlers as _installProcessUncaughtHandlers } from '../hardening/process-uncaught-handler.js';
import { gracefulShutdown as _gracefulShutdown } from '../hardening/graceful-shutdown.js';
export { formatFatalError } from '../hardening/fatal-error.js';
export { installSignalHandlers } from '../hardening/signal-handler.js';
export { installProcessUncaughtHandlers } from '../hardening/process-uncaught-handler.js';
export { gracefulShutdown } from '../hardening/graceful-shutdown.js';
export { evaluateCrossInstanceRollback } from '../hardening/cross-instance-rollback.js';

// Multi-Agent Safety
export { SubAgentRegistry, type SubAgent, type SubAgentId } from '../multi-agent/sub-agent.js';
export { enforceSubAgentPolicy, type SubAgentPolicyEvaluation } from '../multi-agent/sub-agent-policy.js';
export { rollbackSubAgent, type SubAgentRollbackResult } from '../multi-agent/rollback-sub-agent.js';
export { buildSubAgentPolicySnapshot, type SubAgentPolicySnapshot } from '../multi-agent/sub-agent-policy-snapshot.js';

// Hosted/Enterprise
export { enforceRateLimit, type RateLimitResult } from '../hosted/tenant-rate-limit.js';
export { enforceTenantQuota, type QuotaResult } from '../hosted/tenant-quota.js';
export { validateOidcToken, type OidcAuthResult } from '../hosted/sso-oidc.js';

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
  multiAgentSafety: boolean;
  hostedEnterprise: boolean;
  policySnapshot: boolean;
} {
  return {
    observability: true,
    pluginGovernance: true,
    distribution: true,
    productionHardening: true,
    multiAgentSafety: true,
    hostedEnterprise: true,
    policySnapshot: true,
  };
}

/**
 * Create a v5/v6 production runtime.
 * Returns an object with methods to initialize and manage the runtime.
 */
export function createV5V6Runtime() {
  let auditLog: import('../observability/persisting-audit-log.js').PersistingAuditLog | null = null;
  let cleanupFns: Array<() => void> = [];
  
  return {
    /**
     * Initialize the runtime with an audit log.
     */
    async initialize(auditLogPath?: string): Promise<void> {
      if (auditLogPath) {
        const { PersistingAuditLog } = await import('../observability/persisting-audit-log.js');
        auditLog = new PersistingAuditLog({ filePath: auditLogPath });
        await auditLog.load();
      }
    },
    
    /**
     * Get the audit log instance.
     */
    getAuditLog(): import('../observability/persisting-audit-log.js').PersistingAuditLog | null {
      return auditLog;
    },
    
    /**
     * Install signal handlers (requires audit log to be initialized).
     */
    installSignalHandlers(): void {
      if (auditLog) {
        const cleanup = _installSignalHandlers(auditLog);
        cleanupFns.push(cleanup);
      }
    },
    
    /**
     * Install uncaught exception handlers (requires audit log to be initialized).
     */
    installUncaughtHandlers(): void {
      if (auditLog) {
        const cleanup = _installProcessUncaughtHandlers(auditLog);
        cleanupFns.push(cleanup);
      }
    },
    
    /**
     * Cleanup all installed handlers.
     */
    cleanup(): void {
      for (const fn of cleanupFns) {
        fn();
      }
      cleanupFns = [];
    },
  };
}
