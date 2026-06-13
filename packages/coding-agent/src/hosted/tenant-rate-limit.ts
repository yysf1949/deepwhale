/**
 * enforceRateLimit -- D-111 v6.0 Theme 2 seed part 1.
 *
 * Per-tenant rate limiting foundational types + enforcement
 * function. Part 1 of the v6.0 Theme 2 (hosted/enterprise
 * opt-in gates) seed.
 *
 * The function is PURE: callers pass the currentCount
 * explicitly; no in-memory state, no network calls, no
 * persistent storage. Caller is responsible for actually
 * rejecting the request and for incrementing the counter.
 *
 * D-111 does NOT modify any v5.0 type to keep 5 红线 empty.
 *
 * DEFENSIVE: never throws. Negative counts and missing
 * optional fields are handled gracefully.
 */

export type TenantId = string & { readonly __brand: 'TenantId' };

export function asTenantId(value: string): TenantId {
  return value as TenantId;
}

export function isTenantId(value: string): value is TenantId {
  return typeof value === 'string' && value.length > 0;
}

export interface RateLimitPolicy {
  /** Window size in milliseconds (e.g. 60_000 for 1 minute). */
  readonly windowMs: number;
  /** Max requests allowed in the window. */
  readonly maxRequests: number;
  /** When to emit 'allow-with-warning' as a percent of max (default 80). */
  readonly warnAtPercent?: number;
}

export type RateLimitDecision = 'allow' | 'allow-with-warning' | 'deny';

export interface RateLimitResult {
  readonly tenantId: TenantId;
  readonly decision: RateLimitDecision;
  readonly currentCount: number;
  readonly limit: number;
  readonly windowMs: number;
  readonly retryAfterMs: number;
  readonly utilizationPercent: number;
  readonly summary: string;
}

const DEFAULT_WARN_AT_PERCENT = 80;

function buildSummary(
  tenantId: TenantId,
  decision: RateLimitDecision,
  currentCount: number,
  limit: number,
  utilizationPercent: number,
  retryAfterMs: number,
): string {
  if (decision === 'deny') {
    return `tenant ${tenantId}: deny (${currentCount}/${limit}, retry after ${retryAfterMs}ms)`;
  }
  if (decision === 'allow-with-warning') {
    return `tenant ${tenantId}: allow-with-warning (${currentCount}/${limit}, ${utilizationPercent}% utilized)`;
  }
  return `tenant ${tenantId}: allow (${currentCount}/${limit}, ${utilizationPercent}% utilized)`;
}

/**
 * Enforce a per-tenant rate limit.
 *
 * Returns a RateLimitResult with the decision ('allow' /
 * 'allow-with-warning' / 'deny'), the retryAfterMs (only
 * set when decision is 'deny'), the utilizationPercent
 * (rounded), and a human-readable summary.
 *
 * Algorithm:
 * - warnAtPercent defaults to 80.
 * - utilizationPercent = currentCount <= maxRequests ?
 *   round(currentCount * 100 / maxRequests) : 100.
 * - 'deny' when currentCount >= maxRequests.
 * - 'allow-with-warning' when currentCount >= warnThreshold.
 * - 'allow' otherwise.
 *
 * The function is PURE: no side effects, no I/O, no state.
 * Caller passes the current count and is responsible for
 * incrementing it and for actually rejecting the request
 * if decision is 'deny'.
 */
export function enforceRateLimit(
  tenantId: TenantId,
  currentCount: number,
  policy: RateLimitPolicy,
  // options reserved for future window-start tracking via clock; not yet used.
  _options?: { clock?: () => number },
): RateLimitResult {
  // Defensive: normalize inputs.
  const safeCount = currentCount < 0 ? 0 : currentCount;
  const max = policy.maxRequests > 0 ? policy.maxRequests : 0;
  const windowMs = policy.windowMs > 0 ? policy.windowMs : 0;
  const warnPercent = policy.warnAtPercent ?? DEFAULT_WARN_AT_PERCENT;
  const warnThreshold = Math.floor((max * warnPercent) / 100);

  // Defensive: max=0 always denies.
  if (max === 0) {
    return {
      tenantId,
      decision: 'deny',
      currentCount: safeCount,
      limit: max,
      windowMs,
      retryAfterMs: windowMs,
      utilizationPercent: 100,
      summary: buildSummary(tenantId, 'deny', safeCount, max, 100, windowMs),
    };
  }

  const utilizationPercent = safeCount <= max
    ? Math.round((safeCount * 100) / max)
    : 100;

  let decision: RateLimitDecision;
  let retryAfterMs: number;
  if (safeCount >= max) {
    decision = 'deny';
    retryAfterMs = windowMs;
  } else if (safeCount >= warnThreshold) {
    decision = 'allow-with-warning';
    retryAfterMs = 0;
  } else {
    decision = 'allow';
    retryAfterMs = 0;
  }

  return {
    tenantId,
    decision,
    currentCount: safeCount,
    limit: max,
    windowMs,
    retryAfterMs,
    utilizationPercent,
    summary: buildSummary(tenantId, decision, safeCount, max, utilizationPercent, retryAfterMs),
  };
}
