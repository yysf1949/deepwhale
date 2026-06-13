/**
 * validateOidcToken unit test -- D-113 v6.0 Theme 2 seed part 3.
 *
 * After D-111 (per-tenant rate limiting time-windowed) and
 * D-112 (per-tenant billing/quota cumulative), D-113 adds
 * SSO/OIDC integration (per-tenant authentication).
 *
 * The function is PURE: no JWT signature verification, no
 * network calls, no IdP round-trip. Caller pre-decodes the
 * token claims; the function validates the claim-level
 * invariants (expiry, issuer, audience) and extracts
 * tenant + subject.
 *
 * Future D-NN could add actual JWT signature verification
 * using a crypto library. For D-113, the function trusts
 * the caller's pre-decoded claims.
 *
 * D-113 reuses TenantId + asTenantId from D-111
 * (re-imported, not redefined) to keep type continuity.
 * Does NOT modify any v5.0 type to keep 5 红线 empty.
 */

import { describe, expect, it } from 'vitest';
import {
  validateOidcToken,
  type OidcProvider,
  type OidcToken,
} from '../../src/hosted/sso-oidc.js';

const NOW = 2_000_000;
const clock = () => NOW;

const PROVIDER: OidcProvider = {
  providerId: 'auth0',
  issuer: 'https://auth.example.com',
  audience: 'https://api.example.com',
};

function makeToken(overrides: Partial<OidcToken> = {}): OidcToken {
  return {
    token: 'opaque-or-jwt',
    expiresAt: NOW + 60_000,  // 1 minute in the future
    claims: {
      iss: PROVIDER.issuer,
      aud: PROVIDER.audience,
      sub: 'user-123',
      tenant_id: 't-pro',
    },
    ...overrides,
  };
}

describe('validateOidcToken (D-113 v6.0 Theme 2 seed part 3)', () => {
  it('returns allow with tenantId and subject when token is valid (D-113)', () => {
    const result = validateOidcToken(makeToken(), PROVIDER, { clock });
    expect(result.decision).toBe('allow');
    expect(result.tenantId).toBe('t-pro');
    expect(result.subject).toBe('user-123');
    expect(result.providerId).toBe('auth0');
    expect(result.expiresAt).toBe(NOW + 60_000);
    expect(result.summary).toContain('allow');
  });

  it('returns deny with expired summary when token is past expiry (D-113)', () => {
    const result = validateOidcToken(
      makeToken({ expiresAt: NOW - 1 }),
      PROVIDER,
      { clock },
    );
    expect(result.decision).toBe('deny');
    expect(result.tenantId).toBeNull();
    expect(result.summary).toContain('expired');
  });

  it('returns deny with issuer-mismatch summary when iss claim does not match (D-113)', () => {
    const result = validateOidcToken(
      makeToken({ claims: { ...makeToken().claims, iss: 'https://attacker.example.com' } }),
      PROVIDER,
      { clock },
    );
    expect(result.decision).toBe('deny');
    expect(result.summary).toContain('issuer mismatch');
  });

  it('returns deny with audience-mismatch summary when aud claim does not match (D-113)', () => {
    const result = validateOidcToken(
      makeToken({ claims: { ...makeToken().claims, aud: 'https://other-api.example.com' } }),
      PROVIDER,
      { clock },
    );
    expect(result.decision).toBe('deny');
    expect(result.summary).toContain('audience mismatch');
  });
});
