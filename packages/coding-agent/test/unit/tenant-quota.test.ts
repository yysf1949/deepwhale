/**
 * enforceTenantQuota unit test -- D-112 v6.0 Theme 2 seed part 2.
 *
 * After D-111 (per-tenant rate limiting time-windowed), D-112
 * adds per-tenant billing/quota (cumulative). Same defensive
 * pattern + pure function + caller-tracks-state architecture.
 *
 * The function is PURE: callers pass the currentUsage
 * explicitly; no in-memory state, no network calls, no
 * persistent storage. Caller is responsible for actually
 * rejecting the request and for tracking usage.
 *
 * D-112 reuses TenantId from D-111 (re-imported, not
 * redefined) to keep type continuity. Does NOT modify
 * any v5.0 type to keep 5 红线 empty.
 */

import { describe, expect, it } from 'vitest';
import {
  asTenantId,
} from '../../src/hosted/tenant-rate-limit.js';
import {
  enforceTenantQuota,
  type TenantQuota,
} from '../../src/hosted/tenant-quota.js';

const T_PRO = asTenantId('t-pro');
const T_FREE = asTenantId('t-free');

const TOKEN_QUOTA: TenantQuota = {
  dimension: 'tokens',
  limit: 10_000_000,  // 10M tokens
  warnAtPercent: 80,
};

describe('enforceTenantQuota (D-112 v6.0 Theme 2 seed part 2)', () => {
  it('returns allow when current usage is well under the limit (D-112)', () => {
    const result = enforceTenantQuota(T_PRO, 5_000_000, TOKEN_QUOTA);
    expect(result.decision).toBe('allow');
    expect(result.currentUsage).toBe(5_000_000);
    expect(result.limit).toBe(10_000_000);
    expect(result.utilizationPercent).toBe(50);
    expect(result.overage).toBe(0);
    expect(result.dimension).toBe('tokens');
    expect(result.summary).toContain('allow');
    expect(result.summary).toContain('t-pro');
  });

  it('returns allow-with-warning when current usage is at warn threshold (D-112)', () => {
    const result = enforceTenantQuota(T_PRO, 8_500_000, TOKEN_QUOTA);
    expect(result.decision).toBe('allow-with-warning');
    expect(result.utilizationPercent).toBe(85);
    expect(result.overage).toBe(0);
    expect(result.summary).toContain('warning');
  });

  it('returns deny with overage when current usage exceeds the limit (D-112)', () => {
    const result = enforceTenantQuota(T_PRO, 12_000_000, TOKEN_QUOTA);
    expect(result.decision).toBe('deny');
    expect(result.utilizationPercent).toBe(100);
    expect(result.overage).toBe(2_000_000);
    expect(result.summary).toContain('deny');
    expect(result.summary).toContain('2M over');
  });

  it('uses default warnAtPercent=80 when quota omits it (D-112)', () => {
    const quotaWithoutWarn: TenantQuota = {
      dimension: 'tokens',
      limit: 1_000,
    };
    // 80 = 80% of 1000, so 800 should be the warn threshold.
    const result = enforceTenantQuota(T_FREE, 800, quotaWithoutWarn);
    expect(result.decision).toBe('allow-with-warning');
    expect(result.utilizationPercent).toBe(80);
  });
});
