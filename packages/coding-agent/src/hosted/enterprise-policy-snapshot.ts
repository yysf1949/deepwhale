/**
 * buildEnterprisePolicySnapshot -- D-130 v6.0 Theme 2 (hosted/enterprise
 * opt-in gates) cross-theme bridge.
 *
 * Thin orchestration layer that ties the three v6.0 Theme 2
 * seed-part outputs into a single EnterprisePolicySnapshot struct:
 *   - D-111 enforceRateLimit  (per-tenant rate limiting, time-windowed)
 *   - D-112 enforceTenantQuota (per-tenant billing/quota, cumulative)
 *   - D-113 validateOidcToken (per-tenant SSO/OIDC authentication)
 *
 * Mirrors the v5.0 D-105 buildPolicySnapshot cross-theme bridge and
 * the v6.0 D-110 buildSubAgentPolicySnapshot cross-sub-area bridge
 * patterns.
 *
 * The function is PURE orchestration: no new logic, no I/O, no state.
 * It calls the 3 underlying functions, then composes their results
 * into a unified struct with a high-level `isAllowed` flag and a
 * human-readable summary.
 *
 * `isAllowed` is true ONLY when ALL THREE of the following hold:
 *   - rateLimit.decision   !== 'deny'
 *   - quota.decision       !== 'deny'
 *   - oidc.decision        === 'allow'
 *
 * A 'deny' in any of the three is fatal: the request must be rejected.
 * An 'allow-with-warning' is not fatal but surfaces in the summary.
 * An OIDC 'deny' (e.g. expired token) is always fatal even if the
 * rate limit / quota would have allowed the call.
 *
 * DEFENSIVE: never throws. All 3 underlying functions are themselves
 * defensive. Empty / missing inputs are handled by passing safe
 * defaults downstream.
 */

import {
  enforceRateLimit,
  asTenantId,
  type RateLimitPolicy,
  type RateLimitResult,
  type TenantId,
} from './tenant-rate-limit.js';
import {
  enforceTenantQuota,
  type TenantQuota,
  type QuotaResult,
} from './tenant-quota.js';
import {
  validateOidcToken,
  type OidcAuthResult,
  type OidcProvider,
  type OidcToken,
} from './sso-oidc.js';

export interface BuildEnterprisePolicySnapshotInput {
  readonly tenantId: TenantId;
  /** Current request count for the rate-limit window. */
  readonly currentRequestCount: number;
  readonly rateLimit: RateLimitPolicy;
  /** Current cumulative usage for the quota dimension. */
  readonly currentQuotaUsage: number;
  readonly quota: TenantQuota;
  /** Caller-decoded OIDC token (no crypto verification in D-113). */
  readonly token: OidcToken;
  readonly provider: OidcProvider;
  readonly clock?: () => number;
}

export interface EnterprisePolicySnapshotSummary {
  /**
   * True ONLY when all three checks pass: rate limit not 'deny',
   * quota not 'deny', OIDC 'allow'. False on any failure.
   */
  readonly isAllowed: boolean;
  /** True when at least one check is 'allow-with-warning'. */
  readonly hasWarnings: boolean;
  /** Rate-limit decision (verbatim from D-111). */
  readonly rateLimitDecision: 'allow' | 'allow-with-warning' | 'deny';
  /** Quota decision (verbatim from D-112). */
  readonly quotaDecision: 'allow' | 'allow-with-warning' | 'deny';
  /** OIDC decision (verbatim from D-113). */
  readonly oidcDecision: 'allow' | 'deny';
  /** Human-readable summary line. */
  readonly summary: string;
}

export interface EnterprisePolicySnapshot {
  readonly tenantId: TenantId;
  readonly takenAt: number;
  readonly rateLimit: RateLimitResult;
  readonly quota: QuotaResult;
  readonly oidc: OidcAuthResult;
  readonly summary: EnterprisePolicySnapshotSummary;
}

function buildSummary(
  tenantId: TenantId,
  rateLimit: RateLimitResult,
  quota: QuotaResult,
  oidc: OidcAuthResult,
  isAllowed: boolean,
  hasWarnings: boolean,
): string {
  const head = isAllowed ? 'enterprise allow' : 'enterprise deny';
  const warn = hasWarnings ? ' (with warnings)' : '';
  return `${head}${warn}: tenant=${tenantId}; rate=${rateLimit.decision}; quota=${quota.decision}; oidc=${oidc.decision}`;
}

/**
 * Build a unified EnterprisePolicySnapshot from a tenant, the
 * tenant's current rate-limit / quota usage, and the caller's
 * OIDC token. Calls the 3 underlying pure functions (D-111, D-112,
 * D-113) and composes their results into a single struct with
 * an `isAllowed` flag and a human-readable summary.
 *
 * The function is PURE: it does not call any external service, does
 * not write to the audit log, does not increment counters, and does
 * not throw. The caller is responsible for actually rejecting the
 * request, incrementing the counter, and persisting audit events.
 *
 * The function is also CLOCK-INJECTABLE: callers can pass a `clock`
 * option in the input for deterministic tests.
 */
export function buildEnterprisePolicySnapshot(
  input: BuildEnterprisePolicySnapshotInput,
): EnterprisePolicySnapshot {
  const clock = input.clock ?? Date.now;
  const rateLimit = enforceRateLimit(input.tenantId, input.currentRequestCount, input.rateLimit);
  const quota = enforceTenantQuota(input.tenantId, input.currentQuotaUsage, input.quota);
  const oidc = validateOidcToken(input.token, input.provider, { clock });
  const takenAt = clock();

  const hasWarnings =
    rateLimit.decision === 'allow-with-warning' ||
    quota.decision === 'allow-with-warning';
  const isAllowed =
    rateLimit.decision !== 'deny' &&
    quota.decision !== 'deny' &&
    oidc.decision === 'allow';

  return {
    tenantId: input.tenantId,
    takenAt,
    rateLimit,
    quota,
    oidc,
    summary: {
      isAllowed,
      hasWarnings,
      rateLimitDecision: rateLimit.decision,
      quotaDecision: quota.decision,
      oidcDecision: oidc.decision,
      summary: buildSummary(input.tenantId, rateLimit, quota, oidc, isAllowed, hasWarnings),
    },
  };
}

/**
 * Convenience helper: build the snapshot from raw string inputs.
 * Same shape as buildEnterprisePolicySnapshot, but accepts plain
 * `string` for tenantId, request count, and quota usage. Useful for
 * CLI / HTTP boundary code that has not yet branded its inputs.
 */
export function buildEnterprisePolicySnapshotFromRaw(input: {
  readonly tenantId: string;
  readonly currentRequestCount: number;
  readonly rateLimit: RateLimitPolicy;
  readonly currentQuotaUsage: number;
  readonly quota: TenantQuota;
  readonly token: OidcToken;
  readonly provider: OidcProvider;
  readonly clock?: () => number;
}): EnterprisePolicySnapshot {
  return buildEnterprisePolicySnapshot({
    ...input,
    tenantId: asTenantId(input.tenantId),
  });
}
