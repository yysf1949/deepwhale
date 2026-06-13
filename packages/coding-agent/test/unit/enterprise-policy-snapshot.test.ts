/**
 * buildEnterprisePolicySnapshot unit test -- D-130 v6.0 Theme 2
 * (hosted/enterprise opt-in gates) cross-theme bridge.
 *
 * After D-111 (per-tenant rate limit), D-112 (per-tenant quota),
 * and D-113 (per-tenant SSO/OIDC), D-130 ties the three hosted
 * gates into a single EnterprisePolicySnapshot struct. Mirrors
 * the v5.0 D-105 buildPolicySnapshot cross-theme bridge and the
 * v6.0 D-110 buildSubAgentPolicySnapshot cross-sub-area bridge.
 *
 * The function is a PURE orchestration layer. It does not write
 * to the audit log, does not increment counters, and never throws.
 * `isAllowed` is true ONLY when rate-limit is not 'deny', quota is
 * not 'deny', AND OIDC is 'allow'.
 */

import { describe, expect, it } from 'vitest';
import { asTenantId } from '../../src/hosted/tenant-rate-limit.js';
import {
  buildEnterprisePolicySnapshot,
  buildEnterprisePolicySnapshotFromRaw,
} from '../../src/hosted/enterprise-policy-snapshot.js';
import type { RateLimitPolicy } from '../../src/hosted/tenant-rate-limit.js';
import type { TenantQuota } from '../../src/hosted/tenant-quota.js';
import type { OidcProvider, OidcToken } from '../../src/hosted/sso-oidc.js';

const NOW = 2_000_000;
const clock = () => NOW;

const T_PRO = asTenantId('t-pro');

const RATE_LIMIT: RateLimitPolicy = {
  windowMs: 60_000,
  maxRequests: 100,
  warnAtPercent: 80,
};

const QUOTA: TenantQuota = {
  dimension: 'tokens',
  limit: 10_000_000,
  warnAtPercent: 80,
};

const PROVIDER: OidcProvider = {
  providerId: 'auth0',
  issuer: 'https://auth.example.com',
  audience: 'https://api.example.com',
};

function makeValidToken(overrides: Partial<OidcToken> = {}): OidcToken {
  return {
    token: 'opaque-or-jwt',
    expiresAt: NOW + 60_000,
    claims: {
      iss: PROVIDER.issuer,
      aud: PROVIDER.audience,
      sub: 'user-123',
      tenant_id: 't-pro',
    },
    ...overrides,
  };
}

function makeInput(overrides: {
  currentRequestCount?: number;
  currentQuotaUsage?: number;
  token?: OidcToken;
} = {}) {
  return {
    tenantId: T_PRO,
    currentRequestCount: overrides.currentRequestCount ?? 5,
    rateLimit: RATE_LIMIT,
    currentQuotaUsage: overrides.currentQuotaUsage ?? 1_000_000,
    quota: QUOTA,
    token: overrides.token ?? makeValidToken(),
    provider: PROVIDER,
    clock,
  };
}

describe('buildEnterprisePolicySnapshot (D-130 v6.0 Theme 2 cross-bridge)', () => {
  it('returns isAllowed=true when all three checks pass (D-130)', () => {
    const snap = buildEnterprisePolicySnapshot(makeInput());
    expect(snap.tenantId).toBe(T_PRO);
    expect(snap.takenAt).toBe(NOW);
    expect(snap.rateLimit.decision).toBe('allow');
    expect(snap.quota.decision).toBe('allow');
    expect(snap.oidc.decision).toBe('allow');
    expect(snap.summary.isAllowed).toBe(true);
    expect(snap.summary.hasWarnings).toBe(false);
    expect(snap.summary.rateLimitDecision).toBe('allow');
    expect(snap.summary.quotaDecision).toBe('allow');
    expect(snap.summary.oidcDecision).toBe('allow');
    expect(snap.summary.summary).toContain('enterprise allow');
    expect(snap.summary.summary).toContain('t-pro');
  });

  it('returns isAllowed=false when OIDC denies (expired token) (D-130)', () => {
    const snap = buildEnterprisePolicySnapshot(
      makeInput({ token: makeValidToken({ expiresAt: NOW - 1 }) }),
    );
    expect(snap.oidc.decision).toBe('deny');
    expect(snap.summary.isAllowed).toBe(false);
    expect(snap.summary.oidcDecision).toBe('deny');
    expect(snap.summary.summary).toContain('enterprise deny');
  });

  it('returns isAllowed=false when rate limit denies (over-cap usage) (D-130)', () => {
    const snap = buildEnterprisePolicySnapshot(
      makeInput({ currentRequestCount: 1000 }),
    );
    expect(snap.rateLimit.decision).toBe('deny');
    expect(snap.summary.isAllowed).toBe(false);
    expect(snap.summary.rateLimitDecision).toBe('deny');
  });

  it('returns isAllowed=false when quota denies (over-cap usage) (D-130)', () => {
    const snap = buildEnterprisePolicySnapshot(
      makeInput({ currentQuotaUsage: 50_000_000 }),
    );
    expect(snap.quota.decision).toBe('deny');
    expect(snap.summary.isAllowed).toBe(false);
    expect(snap.summary.quotaDecision).toBe('deny');
  });

  it('returns isAllowed=true with hasWarnings=true when rate limit warns (D-130)', () => {
    const snap = buildEnterprisePolicySnapshot(
      makeInput({ currentRequestCount: 85 }),  // 85% of 100 = warn
    );
    expect(snap.rateLimit.decision).toBe('allow-with-warning');
    expect(snap.quota.decision).toBe('allow');
    expect(snap.oidc.decision).toBe('allow');
    expect(snap.summary.isAllowed).toBe(true);
    expect(snap.summary.hasWarnings).toBe(true);
    expect(snap.summary.summary).toContain('with warnings');
  });
});

describe('buildEnterprisePolicySnapshotFromRaw (D-130 convenience helper)', () => {
  it('accepts raw string tenantId and brands it correctly (D-130)', () => {
    const snap = buildEnterprisePolicySnapshotFromRaw({
      tenantId: 't-raw',
      currentRequestCount: 5,
      rateLimit: RATE_LIMIT,
      currentQuotaUsage: 1_000_000,
      quota: QUOTA,
      token: makeValidToken(),
      provider: PROVIDER,
      clock,
    });
    expect(snap.tenantId).toBe('t-raw');
    expect(snap.summary.isAllowed).toBe(true);
  });
});
