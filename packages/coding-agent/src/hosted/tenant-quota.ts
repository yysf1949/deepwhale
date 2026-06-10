/**
 * enforceTenantQuota -- D-112 v6.0 Theme 2 seed part 2.
 *
 * Per-tenant billing/quota foundational types + enforcement
 * function. Part 2 of the v6.0 Theme 2 (hosted/enterprise
 * opt-in gates) seed. Complements D-111 enforceRateLimit:
 * - D-111 rate limit: per-tenant, time-windowed (e.g. 100 req/min).
 * - D-112 quota: per-tenant, cumulative (e.g. 10M tokens/month).
 *
 * The function is PURE: callers pass the currentUsage
 * explicitly; no in-memory state, no network calls, no
 * persistent storage. Caller is responsible for actually
 * rejecting the request and for tracking usage.
 *
 * D-112 reuses TenantId from D-111 (re-imported, not
 * redefined) to keep type continuity. Does NOT modify
 * any v5.0 type to keep 5 红线 empty.
 *
 * DEFENSIVE: never throws. Negative usage and missing
 * optional fields are handled gracefully.
 */

import type { TenantId } from './tenant-rate-limit.js';

export type CostDimension = 'tokens' | 'requests' | 'storage' | 'compute-seconds';

export interface TenantQuota {
  readonly dimension: CostDimension;
  readonly limit: number;
  /** When to emit 'allow-with-warning' as a percent of limit (default 80). */
  readonly warnAtPercent?: number;
}

export type QuotaDecision = 'allow' | 'allow-with-warning' | 'deny';

export interface QuotaResult {
  readonly tenantId: TenantId;
  readonly dimension: CostDimension;
  readonly decision: QuotaDecision;
  readonly currentUsage: number;
  readonly limit: number;
  readonly utilizationPercent: number;
  /** Amount over limit if exceeded, 0 otherwise. */
  readonly overage: number;
  readonly summary: string;
}

const DEFAULT_WARN_AT_PERCENT = 80;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}

function buildSummary(
  tenantId: TenantId,
  dimension: CostDimension,
  decision: QuotaDecision,
  currentUsage: number,
  limit: number,
  utilizationPercent: number,
  overage: number,
): string {
  const usage = formatNumber(currentUsage);
  const lim = formatNumber(limit);
  if (decision === 'deny') {
    return `tenant ${tenantId} (${dimension}): deny (${usage}/${lim}, ${formatNumber(overage)} over)`;
  }
  if (decision === 'allow-with-warning') {
    return `tenant ${tenantId} (${dimension}): allow-with-warning (${usage}/${lim}, ${utilizationPercent}% utilized)`;
  }
  return `tenant ${tenantId} (${dimension}): allow (${usage}/${lim}, ${utilizationPercent}% utilized)`;
}

/**
 * Enforce a per-tenant cumulative quota.
 *
 * Returns a QuotaResult with the decision ('allow' /
 * 'allow-with-warning' / 'deny'), the overage (only set
 * when decision is 'deny'), the utilizationPercent
 * (rounded), the dimension (for the summary), and a
 * human-readable summary.
 *
 * Algorithm:
 * - warnAtPercent defaults to 80.
 * - utilizationPercent = currentUsage <= limit ?
 *   round(currentUsage * 100 / limit) : 100.
 * - overage = currentUsage > limit ? currentUsage - limit : 0.
 * - 'deny' when currentUsage >= limit.
 * - 'allow-with-warning' when currentUsage >= warnThreshold.
 * - 'allow' otherwise.
 *
 * The function is PURE: no side effects, no I/O, no state.
 * Caller passes the current usage and is responsible for
 * tracking it and for actually rejecting the request if
 * decision is 'deny'.
 */
export function enforceTenantQuota(
  tenantId: TenantId,
  currentUsage: number,
  quota: TenantQuota,
  // options reserved for future quota-reset tracking via clock; not yet used.
  _options?: { clock?: () => number },
): QuotaResult {
  // Defensive: normalize inputs.
  const safeUsage = currentUsage < 0 ? 0 : currentUsage;
  const limit = quota.limit > 0 ? quota.limit : 0;
  const warnPercent = quota.warnAtPercent ?? DEFAULT_WARN_AT_PERCENT;
  const warnThreshold = Math.floor((limit * warnPercent) / 100);

  // Defensive: limit=0 always denies.
  if (limit === 0) {
    return {
      tenantId,
      dimension: quota.dimension,
      decision: 'deny',
      currentUsage: safeUsage,
      limit: 0,
      utilizationPercent: 100,
      overage: safeUsage,
      summary: buildSummary(tenantId, quota.dimension, 'deny', safeUsage, 0, 100, safeUsage),
    };
  }

  const utilizationPercent = safeUsage <= limit
    ? Math.round((safeUsage * 100) / limit)
    : 100;
  const overage = safeUsage > limit ? safeUsage - limit : 0;

  let decision: QuotaDecision;
  if (safeUsage >= limit) {
    decision = 'deny';
  } else if (safeUsage >= warnThreshold) {
    decision = 'allow-with-warning';
  } else {
    decision = 'allow';
  }

  return {
    tenantId,
    dimension: quota.dimension,
    decision,
    currentUsage: safeUsage,
    limit,
    utilizationPercent,
    overage,
    summary: buildSummary(tenantId, quota.dimension, decision, safeUsage, limit, utilizationPercent, overage),
  };
}
