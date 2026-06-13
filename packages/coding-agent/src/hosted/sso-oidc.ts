/**
 * validateOidcToken -- D-113 v6.0 Theme 2 seed part 3.
 *
 * SSO/OIDC integration foundational types + validation
 * function. Part 3 of the v6.0 Theme 2 (hosted/enterprise
 * opt-in gates) seed. Adds per-tenant authentication to
 * complement D-111 (rate limiting) and D-112 (billing/quota).
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
 *
 * DEFENSIVE: never throws. Missing claims, malformed
 * tokens, and negative expiry are handled gracefully.
 */

import { asTenantId, type TenantId } from './tenant-rate-limit.js';

export interface OidcProvider {
  /** Provider identifier (e.g. 'google', 'okta', 'auth0'). */
  readonly providerId: string;
  /** Expected 'iss' claim value. */
  readonly issuer: string;
  /** Expected 'aud' claim value. */
  readonly audience: string;
  /** Claim name for tenant id (default 'tenant_id'). */
  readonly tenantClaim?: string;
}

export interface OidcToken {
  /** Opaque or JWT-like token string (caller pre-decoded). */
  readonly token: string;
  /** Token expiration timestamp in ms. */
  readonly expiresAt: number;
  /** Pre-decoded claims (sub, iss, aud, custom claims). */
  readonly claims: Record<string, unknown>;
}

export type OidcAuthDecision = 'allow' | 'deny';

export interface OidcAuthResult {
  readonly providerId: string;
  readonly tenantId: TenantId | null;
  readonly decision: OidcAuthDecision;
  readonly expiresAt: number;
  readonly subject: string | null;
  readonly summary: string;
}

export interface OidcValidationOptions {
  /** Clock for testability (ms timestamp). */
  readonly clock?: () => number;
}

const DEFAULT_TENANT_CLAIM = 'tenant_id';

function extractStringClaim(claims: Record<string, unknown>, name: string): string | null {
  const value = claims[name];
  return typeof value === 'string' ? value : null;
}

/**
 * Validate an OIDC token against a provider configuration.
 *
 * Returns an OidcAuthResult with the decision ('allow' /
 * 'deny'), the extracted tenantId (null if not in claims),
 * the extracted subject (null if not in claims), the
 * providerId, and a human-readable summary.
 *
 * Algorithm:
 * 1. Check expiry: token.expiresAt must be > now.
 * 2. Check issuer: claims.iss must equal provider.issuer.
 * 3. Check audience: claims.aud must equal provider.audience.
 * 4. If all pass, decision='allow' and extract tenantId
 *    from claims[tenantClaim] (default 'tenant_id') and
 *    subject from claims.sub.
 *
 * The function is PURE: no side effects, no I/O, no crypto.
 * JWT signature verification is OUT OF SCOPE for D-113;
 * future D-NN can add it.
 */
export function validateOidcToken(
  token: OidcToken,
  provider: OidcProvider,
  options?: OidcValidationOptions,
): OidcAuthResult {
  const now = (options?.clock ?? Date.now)();
  const tenantClaimName = provider.tenantClaim ?? DEFAULT_TENANT_CLAIM;

  // Check 1: expiry.
  if (token.expiresAt <= now) {
    return {
      providerId: provider.providerId,
      tenantId: null,
      decision: 'deny',
      expiresAt: token.expiresAt,
      subject: null,
      summary: `oidc ${provider.providerId}: deny (token expired)`,
    };
  }

  // Check 2: issuer.
  const issuer = extractStringClaim(token.claims, 'iss');
  if (issuer !== provider.issuer) {
    return {
      providerId: provider.providerId,
      tenantId: null,
      decision: 'deny',
      expiresAt: token.expiresAt,
      subject: null,
      summary: `oidc ${provider.providerId}: deny (issuer mismatch)`,
    };
  }

  // Check 3: audience.
  const audience = extractStringClaim(token.claims, 'aud');
  if (audience !== provider.audience) {
    return {
      providerId: provider.providerId,
      tenantId: null,
      decision: 'deny',
      expiresAt: token.expiresAt,
      subject: null,
      summary: `oidc ${provider.providerId}: deny (audience mismatch)`,
    };
  }

  // All checks pass: extract tenant + subject.
  const tenantIdRaw = extractStringClaim(token.claims, tenantClaimName);
  const tenantId: TenantId | null = tenantIdRaw !== null ? asTenantId(tenantIdRaw) : null;
  const subject = extractStringClaim(token.claims, 'sub');

  return {
    providerId: provider.providerId,
    tenantId,
    decision: 'allow',
    expiresAt: token.expiresAt,
    subject,
    summary: `oidc ${provider.providerId}: allow (tenant=${tenantId ?? 'none'}, sub=${subject ?? 'none'})`,
  };
}
