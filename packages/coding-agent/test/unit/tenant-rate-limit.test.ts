/**
 * enforceRateLimit unit test -- D-111 v6.0 Theme 2 seed part 1.
 *
 * The v6.0 master plan (D-106) lists 4 themes. Theme 2 is
 * "hosted/enterprise opt-in gates", which covers per-tenant
 * rate limiting, billing/quota, SSO/OIDC, and SIEM
 * integration. D-111 starts this theme with the
 * per-tenant rate limiting seed: TenantId branded type,
 * RateLimitPolicy interface, and enforceRateLimit pure
 * function.
 *
 * The function is PURE: callers pass the currentCount
 * explicitly; no in-memory state, no network calls, no
 * persistent storage. Caller is responsible for actually
 * rejecting the request and for incrementing the counter.
 *
 * D-111 does NOT modify any v5.0 type to keep 5 红线 empty.
 */

import { describe, expect, it } from 'vitest';
import {
  asTenantId,
  enforceRateLimit,
  type RateLimitPolicy,
} from '../../src/hosted/tenant-rate-limit.js';

const T_PRO = asTenantId('t-pro');
const T_FREE = asTenantId('t-free');

const STANDARD_POLICY: RateLimitPolicy = {
  windowMs: 60_000,  // 1 minute
  maxRequests: 100,
  warnAtPercent: 80,
};

describe('enforceRateLimit (D-111 v6.0 Theme 2 seed part 1)', () => {
  it('returns allow when current count is well under the limit (D-111)', () => {
    const result = enforceRateLimit(T_PRO, 5, STANDARD_POLICY);
    expect(result.decision).toBe('allow');
    expect(result.currentCount).toBe(5);
    expect(result.limit).toBe(100);
    expect(result.retryAfterMs).toBe(0);
    expect(result.utilizationPercent).toBe(5);
    expect(result.summary).toContain('allow');
    expect(result.summary).toContain('t-pro');
  });

  it('returns allow-with-warning when current count is at warn threshold (D-111)', () => {
    const result = enforceRateLimit(T_PRO, 85, STANDARD_POLICY);
    expect(result.decision).toBe('allow-with-warning');
    expect(result.utilizationPercent).toBe(85);
    expect(result.retryAfterMs).toBe(0);
    expect(result.summary).toContain('warning');
  });

  it('returns deny with retryAfterMs when current count exceeds the limit (D-111)', () => {
    const result = enforceRateLimit(T_PRO, 105, STANDARD_POLICY);
    expect(result.decision).toBe('deny');
    expect(result.retryAfterMs).toBe(60_000);
    expect(result.utilizationPercent).toBe(100);
    expect(result.summary).toContain('deny');
    expect(result.summary).toContain('t-pro');
  });

  it('uses default warnAtPercent=80 when policy omits it (D-111)', () => {
    const policyWithoutWarn: RateLimitPolicy = {
      windowMs: 60_000,
      maxRequests: 100,
    };
    // 80 = 80% of 100, so 80 should be the warn threshold.
    const result = enforceRateLimit(T_FREE, 80, policyWithoutWarn);
    expect(result.decision).toBe('allow-with-warning');
    expect(result.utilizationPercent).toBe(80);
  });
});
