/**
 * LeaderElector unit test -- D-130 v6.0 distributed coordination seed.
 *
 * Tests the simple lease-based leader election pattern: acquire,
 * check, release. The class is in-memory and process-local; a
 * future D-NN can wrap it with a real distributed coordinator
 * (etcd / consul / zookeeper). For D-130, the seed is the
 * interface + the in-memory implementation.
 *
 * Coverage:
 *   - happy path: first candidate acquires, holds, releases
 *   - contention: second candidate is denied while first holds
 *   - expiry: lease is reported as 'expired' after ttl elapses;
 *     a new acquire succeeds and overwrites
 *   - renewal: same candidate re-acquiring (idempotent) succeeds
 *   - release guard: a non-leader release is a no-op
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { LeaderElector } from '../../src/distributed/leader-election.js';

describe('LeaderElector (D-130 v6.0 distributed coordination seed)', () => {
  let now: number;
  let clock: () => number;

  beforeEach(() => {
    now = 1_000_000;
    clock = () => now;
  });

  function advance(ms: number): void {
    now += ms;
  }

  it('acquires, holds, and releases a lease on first candidate (D-130)', () => {
    const e = new LeaderElector(clock);
    // Empty state.
    expect(e.check().status).toBe('no-leader');
    expect(e.check().leaderId).toBe('no-leader');

    const acq = e.acquire('node-A', 60_000);
    expect(acq.success).toBe(true);
    expect(acq.state.status).toBe('active');
    expect(acq.state.leaderId).toBe('node-A');
    expect(acq.state.remainingMs).toBe(60_000);

    // Check while held.
    const mid = e.check();
    expect(mid.status).toBe('active');
    expect(mid.leaderId).toBe('node-A');
    expect(mid.remainingMs).toBe(60_000);

    // Release.
    const rel = e.release('node-A');
    expect(rel.success).toBe(true);
    expect(rel.state.status).toBe('no-leader');
    expect(rel.state.leaderId).toBe('no-leader');
  });

  it('denies a second candidate while a first holds an active lease (D-130)', () => {
    const e = new LeaderElector(clock);
    e.acquire('node-A', 60_000);
    advance(5_000);

    const acq = e.acquire('node-B', 60_000);
    expect(acq.success).toBe(false);
    expect(acq.currentLeader).toBe('node-A');
    expect(acq.retryAfterMs).toBe(55_000);
    expect(acq.reason).toContain('node-A');

    // State still shows A.
    const mid = e.check();
    expect(mid.status).toBe('active');
    expect(mid.leaderId).toBe('node-A');
  });

  it('reports an expired lease after ttl elapses, and a new acquire succeeds (D-130)', () => {
    const e = new LeaderElector(clock);
    e.acquire('node-A', 30_000);
    advance(40_000);  // ttl+10s

    const mid = e.check();
    expect(mid.status).toBe('expired');
    expect(mid.leaderId).toBe('node-A');  // last known leader
    expect(mid.remainingMs).toBe(0);

    // A new candidate can now take over.
    const acq = e.acquire('node-B', 60_000);
    expect(acq.success).toBe(true);
    expect(acq.state.leaderId).toBe('node-B');
    expect(acq.state.status).toBe('active');
  });

  it('allows the same candidate to re-acquire (idempotent renew) (D-130)', () => {
    const e = new LeaderElector(clock);
    e.acquire('node-A', 30_000);
    advance(10_000);

    const renew = e.acquire('node-A', 60_000);
    expect(renew.success).toBe(true);
    expect(renew.state.leaderId).toBe('node-A');
    expect(renew.state.remainingMs).toBe(60_000);  // ttl reset
    expect(renew.reason).toContain('renewed');
  });

  it('refuses a release from a non-leader candidate (D-130)', () => {
    const e = new LeaderElector(clock);
    e.acquire('node-A', 60_000);
    advance(1_000);

    const rel = e.release('node-B');
    expect(rel.success).toBe(false);
    expect(rel.reason).toContain('node-A');
    // State still shows A as leader.
    const mid = e.check();
    expect(mid.status).toBe('active');
    expect(mid.leaderId).toBe('node-A');
  });

  it('is defensive: empty candidateId and negative ttl are handled gracefully (D-130)', () => {
    const e = new LeaderElector(clock);
    const acq1 = e.acquire('', 60_000);
    // Empty candidateId is normalized to 'unknown' and still acquires.
    expect(acq1.success).toBe(true);
    expect(acq1.state.leaderId).toBe('unknown');

    // Advance past the first lease's expiry so the second acquire can succeed.
    advance(60_001);

    const acq2 = e.acquire('node-B', -1);
    // Negative ttl is normalized to 0 -- lease is immediately expired,
    // so the second candidate can take over.
    expect(acq2.success).toBe(true);
    expect(acq2.state.leaderId).toBe('node-B');
    expect(acq2.state.remainingMs).toBe(0);
  });
});
