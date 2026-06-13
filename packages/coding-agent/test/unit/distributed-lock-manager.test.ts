import { describe, expect, it, beforeEach } from 'vitest';
import {
  DistributedLockManager,
  asLockId,
} from '../../src/distributed/lock-manager.js';

describe('DistributedLockManager (D-138 v6.0 distributed coordination seed)', () => {
  let now: number;
  let clock: () => number;

  beforeEach(() => {
    now = 1_000_000;
    clock = () => now;
  });

  function advance(ms: number): void {
    now += ms;
  }

  it('acquires a lock on an empty slot (D-138)', () => {
    const mgr = new DistributedLockManager(clock);
    const lockId = asLockId('resource-A');

    const result = mgr.acquire(lockId, 'owner-1', 60_000);
    expect(result.acquired).toBe(true);
    expect(result.lockInfo).toBeDefined();
    expect(result.lockInfo!.lockId).toBe(lockId);
    expect(result.lockInfo!.owner).toBe('owner-1');
    expect(result.lockInfo!.acquiredAtMs).toBe(now);
    expect(result.lockInfo!.expiresAtMs).toBe(now + 60_000);
    expect(mgr.isLocked(lockId)).toBe(true);
    expect(mgr.size()).toBe(1);
  });

  it('fails to acquire when lock is held by a different owner (D-138)', () => {
    const mgr = new DistributedLockManager(clock);
    const lockId = asLockId('resource-A');

    mgr.acquire(lockId, 'owner-1', 60_000);
    advance(5_000);

    const result = mgr.acquire(lockId, 'owner-2', 60_000);
    expect(result.acquired).toBe(false);
    expect(result.lockInfo).toBeDefined();
    expect(result.lockInfo!.owner).toBe('owner-1');
    expect(result.reason).toContain('owner-1');
    expect(result.reason).toContain('55000ms');
    expect(mgr.size()).toBe(1);
  });

  it('renew extends TTL for the current owner (D-138)', () => {
    const mgr = new DistributedLockManager(clock);
    const lockId = asLockId('resource-A');

    mgr.acquire(lockId, 'owner-1', 30_000);
    advance(10_000);

    const renew = mgr.renew(lockId, 'owner-1', 60_000);
    expect(renew.acquired).toBe(true);
    expect(renew.lockInfo).toBeDefined();
    expect(renew.lockInfo!.expiresAtMs).toBe(now + 60_000);
    expect(renew.lockInfo!.renewedAtMs).toBe(now);
    expect(mgr.isLocked(lockId)).toBe(true);
  });

  it('release allows new acquisition by a different owner (D-138)', () => {
    const mgr = new DistributedLockManager(clock);
    const lockId = asLockId('resource-A');

    mgr.acquire(lockId, 'owner-1', 60_000);
    const released = mgr.release(lockId, 'owner-1');
    expect(released).toBe(true);
    expect(mgr.isLocked(lockId)).toBe(false);

    const result = mgr.acquire(lockId, 'owner-2', 60_000);
    expect(result.acquired).toBe(true);
    expect(result.lockInfo!.owner).toBe('owner-2');
    expect(mgr.size()).toBe(1);
  });
});
