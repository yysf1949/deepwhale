/**
 * Leader election -- D-130 v6.0 distributed coordination seed.
 *
 * Simple lease-based leader election for a single-process /
 * single-coordinator scenario. A future D-NN can wrap this with
 * a real distributed coordinator (etcd / consul / zookeeper); for
 * D-130, the implementation is in-memory and process-local.
 *
 * The seed is intentionally minimal: one Lease struct, one
 * LeaderElector class with 3 methods (acquire, check, release),
 * and a clock-injectable design so tests are deterministic.
 *
 * Lease semantics:
 *   - acquire(candidateId, ttlMs): if no current lease, OR the
 *     current lease has expired, OR the same candidateId is
 *     re-acquiring, succeed and (re)start the lease. Otherwise
 *     fail with the current leader's id and remaining ms.
 *   - check(): returns the current leader's id and remaining
 *     lease ms. If the lease has expired, returns 'expired' +
 *     a 'no-leader' leaderId (callers should re-acquire).
 *   - release(candidateId): releases the lease IFF the caller
 *     is the current leader. Returns success/failure. This is
 *     the only mutating call that takes a candidateId (defense
 *     against a stale process trying to release a lease it no
 *     longer owns).
 *
 * The class is DEFENSIVE: never throws. Negative ttl, empty
 * candidateId, and out-of-order clock are all handled gracefully.
 *
 * Scope of THIS sub-sprint: minimal in-memory seed + 5 unit
 * tests (acquire, check, release, expire, contention).
 */

export type LeaderId = string & { readonly __brand: 'LeaderId' };

export function asLeaderId(value: string): LeaderId {
  return value as LeaderId;
}

export type LeaseStatus = 'active' | 'expired' | 'no-leader';

export interface LeaseState {
  /** Current leader id, or 'no-leader' when the lease is empty / expired. */
  readonly leaderId: LeaderId | 'no-leader';
  /** Status: 'active' = a valid lease is held; 'expired' = was held, now expired; 'no-leader' = no lease has ever been acquired (or it was just released). */
  readonly status: LeaseStatus;
  /** Epoch ms when the lease was acquired. */
  readonly acquiredAt: number;
  /** Epoch ms when the lease will expire (acquiredAt + ttl). */
  readonly expiresAt: number;
  /** Ms remaining until expiry (0 if expired or no leader). */
  readonly remainingMs: number;
}

export interface AcquireResult {
  readonly success: boolean;
  /** The new lease state after the attempt. */
  readonly state: LeaseState;
  /** When success=false, the current leader (denied candidate may want to know). */
  readonly currentLeader?: LeaderId;
  /** When success=false, ms until the current lease expires. */
  readonly retryAfterMs?: number;
  /** Human-readable reason. */
  readonly reason: string;
}

export interface ReleaseResult {
  readonly success: boolean;
  /** The new lease state after the release attempt. */
  readonly state: LeaseState;
  /** Human-readable reason. */
  readonly reason: string;
}

const NO_LEADER: LeaderId = 'no-leader' as LeaderId;

export class LeaderElector {
  private lease: { leaderId: LeaderId; acquiredAt: number; expiresAt: number } | null = null;

  constructor(private readonly clock: () => number = Date.now) {}

  /**
   * Try to acquire leadership for the given candidate with the
   * given lease TTL in milliseconds.
   *
   * Succeeds when:
   *   - no lease has been acquired yet, OR
   *   - the current lease has expired, OR
   *   - the same candidateId is re-acquiring (idempotent renew).
   *
   * Fails when:
   *   - another candidate currently holds an active lease.
   */
  acquire(candidateId: string, ttlMs: number): AcquireResult {
    const safeCandidate = candidateId.length > 0 ? candidateId : 'unknown';
    const safeTtl = ttlMs > 0 ? ttlMs : 0;
    const now = this.clock();

    if (this.lease === null || this.lease.expiresAt <= now) {
      // Either no lease, or it has expired -- take it.
      this.lease = {
        leaderId: asLeaderId(safeCandidate),
        acquiredAt: now,
        expiresAt: now + safeTtl,
      };
      return {
        success: true,
        state: this.snapshotState(now),
        reason: `acquired by ${safeCandidate} (ttl ${safeTtl}ms)`,
      };
    }

    // Active lease held.
    if (this.lease.leaderId === safeCandidate) {
      // Idempotent renew.
      this.lease = {
        leaderId: asLeaderId(safeCandidate),
        acquiredAt: now,
        expiresAt: now + safeTtl,
      };
      return {
        success: true,
        state: this.snapshotState(now),
        reason: `renewed by ${safeCandidate} (ttl ${safeTtl}ms)`,
      };
    }

    // Active lease held by a different candidate -- deny.
    const remainingMs = this.lease.expiresAt - now;
    return {
      success: false,
      state: this.snapshotState(now),
      currentLeader: this.lease.leaderId,
      retryAfterMs: remainingMs > 0 ? remainingMs : 0,
      reason: `denied: lease held by ${this.lease.leaderId} (${remainingMs}ms remaining)`,
    };
  }

  /**
   * Read the current lease state. Returns the current leader
   * (or 'no-leader') and the remaining ms. Does NOT mutate
   * the lease: an expired lease is reported as 'expired' but
   * stays in place until a new acquire() overwrites it (or a
   * release() clears it).
   */
  check(): LeaseState {
    return this.snapshotState(this.clock());
  }

  /**
   * Release the current lease, but only if the caller is the
   * current leader. A non-leader release is a no-op that
   * returns success=false with a reason.
   */
  release(candidateId: string): ReleaseResult {
    const safeCandidate = candidateId.length > 0 ? candidateId : 'unknown';
    const now = this.clock();

    if (this.lease === null) {
      return {
        success: false,
        state: this.snapshotState(now),
        reason: `no-op: no lease to release (called by ${safeCandidate})`,
      };
    }

    if (this.lease.leaderId !== safeCandidate) {
      return {
        success: false,
        state: this.snapshotState(now),
        reason: `denied: lease held by ${this.lease.leaderId}, not ${safeCandidate}`,
      };
    }

    this.lease = null;
    return {
      success: true,
      state: this.snapshotState(now),
      reason: `released by ${safeCandidate}`,
    };
  }

  private snapshotState(now: number): LeaseState {
    if (this.lease === null) {
      return {
        leaderId: 'no-leader',
        status: 'no-leader',
        acquiredAt: 0,
        expiresAt: 0,
        remainingMs: 0,
      };
    }
    if (this.lease.expiresAt <= now) {
      return {
        leaderId: this.lease.leaderId,
        status: 'expired',
        acquiredAt: this.lease.acquiredAt,
        expiresAt: this.lease.expiresAt,
        remainingMs: 0,
      };
    }
    return {
      leaderId: this.lease.leaderId,
      status: 'active',
      acquiredAt: this.lease.acquiredAt,
      expiresAt: this.lease.expiresAt,
      remainingMs: this.lease.expiresAt - now,
    };
  }
}

// Re-export the no-leader sentinel for callers that want to
// compare against it without a string literal.
export const NO_LEADER_ID: LeaderId = NO_LEADER;
