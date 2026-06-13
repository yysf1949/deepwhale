export type LockId = string & { readonly __brand: 'LockId' };

export function asLockId(value: string): LockId {
  if (value.length === 0) {
    throw new Error('LockId must be non-empty');
  }
  return value as LockId;
}

export function isLockId(value: unknown): value is LockId {
  return typeof value === 'string' && value.length > 0;
}

export interface LockInfo {
  readonly lockId: LockId;
  readonly owner: string;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
  readonly renewedAtMs: number;
}

export interface LockAcquireResult {
  readonly acquired: boolean;
  readonly lockInfo?: LockInfo;
  readonly reason?: string;
}

export class DistributedLockManager {
  private readonly locks = new Map<LockId, LockInfo>();

  constructor(private readonly clock: () => number = Date.now) {}

  acquire(lockId: LockId, owner: string, ttlMs: number): LockAcquireResult {
    const now = this.clock();
    const safeTtl = ttlMs > 0 ? ttlMs : 0;
    const existing = this.locks.get(lockId);

    if (existing === undefined || existing.expiresAtMs <= now) {
      const info: LockInfo = {
        lockId,
        owner,
        acquiredAtMs: now,
        expiresAtMs: now + safeTtl,
        renewedAtMs: now,
      };
      this.locks.set(lockId, info);
      return { acquired: true, lockInfo: info };
    }

    return {
      acquired: false,
      lockInfo: existing,
      reason: `lock held by ${existing.owner} (expires in ${existing.expiresAtMs - now}ms)`,
    };
  }

  release(lockId: LockId, owner: string): boolean {
    const existing = this.locks.get(lockId);
    if (existing === undefined) {
      return false;
    }
    if (existing.owner !== owner) {
      return false;
    }
    this.locks.delete(lockId);
    return true;
  }

  renew(lockId: LockId, owner: string, ttlMs: number): LockAcquireResult {
    const now = this.clock();
    const safeTtl = ttlMs > 0 ? ttlMs : 0;
    const existing = this.locks.get(lockId);

    if (existing === undefined) {
      return { acquired: false, reason: 'lock not found' };
    }
    if (existing.owner !== owner) {
      return {
        acquired: false,
        lockInfo: existing,
        reason: `lock held by ${existing.owner}, not ${owner}`,
      };
    }

    const info: LockInfo = {
      ...existing,
      expiresAtMs: now + safeTtl,
      renewedAtMs: now,
    };
    this.locks.set(lockId, info);
    return { acquired: true, lockInfo: info };
  }

  isLocked(lockId: LockId): boolean {
    const existing = this.locks.get(lockId);
    if (existing === undefined) {
      return false;
    }
    return existing.expiresAtMs > this.clock();
  }

  getLock(lockId: LockId): LockInfo | undefined {
    return this.locks.get(lockId);
  }

  list(): readonly LockInfo[] {
    return Array.from(this.locks.values());
  }

  size(): number {
    return this.locks.size;
  }

  clear(): void {
    this.locks.clear();
  }
}
