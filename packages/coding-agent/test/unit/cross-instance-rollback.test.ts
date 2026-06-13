/**
 * evaluateCrossInstanceRollback unit test -- D-104 v5.0 production hardening 5th evidence.
 *
 * After D-96 (formatFatalError), D-97 (installSignalHandlers),
 * D-98 (installProcessUncaughtHandlers), and D-99 (gracefulShutdown),
 * D-104 ties the per-instance hardening to a cross-instance
 * recovery decision. The function reads the prior instance's
 * audit log via D-90 readAuditLog and decides whether the next
 * instance should:
 *   - proceed: prior instance was graceful + recent.
 *   - rollback: prior instance was either fatal or stale.
 *   - no-evidence: prior audit log is empty (first run).
 *
 * The function is async (because readAuditLog is async) but
 * does NOT log to the AuditLog itself. Accepts an optional clock
 * for testing.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateCrossInstanceRollback } from '../../src/hardening/cross-instance-rollback.js';
import type { AuditEvent } from '../../src/observability/audit-log.js';

let auditPath: string;

beforeEach(async () => {
  auditPath = join(tmpdir(), `rollback-test-${Date.now()}-${Math.random()}.jsonl`);
  await fsp.writeFile(auditPath, '', 'utf8');
});

afterEach(async () => {
  try { await fsp.unlink(auditPath); } catch { /* ok */ }
});

async function appendEvent(event: AuditEvent): Promise<void> {
  await fsp.appendFile(auditPath, JSON.stringify(event) + '\n', 'utf8');
}

describe('evaluateCrossInstanceRollback (D-104 v5.0 production hardening 5th evidence)', () => {
  it('returns no-evidence for a non-existent file (D-104)', async () => {
    const missingPath = join(tmpdir(), `rollback-missing-${Date.now()}-${Math.random()}.jsonl`);
    const result = await evaluateCrossInstanceRollback(missingPath, {
      maxStaleMs: 60_000,
    });
    expect(result.decision).toBe('no-evidence');
    expect(result.reason).toContain('no prior audit log entries');
  });

  it('returns proceed when last event is graceful-shutdown within freshness window (D-104)', async () => {
    // 30s ago: graceful shutdown.
    const now = 1_000_000;
    await appendEvent({ timestamp: now - 30_000, kind: 'graceful-shutdown', payload: { reason: 'SIGTERM' } });
    const result = await evaluateCrossInstanceRollback(auditPath, {
      maxStaleMs: 60_000,
      clock: () => now,
    });
    expect(result.decision).toBe('proceed');
    expect(result.lastEventKind).toBe('graceful-shutdown');
    expect(result.ageMs).toBe(30_000);
    expect(result.reason).toContain('graceful');
  });

  it('returns rollback when last event is a fatal kind (unclean shutdown) (D-104)', async () => {
    // 5s ago: fatal-uncaught.
    const now = 1_000_000;
    await appendEvent({ timestamp: now - 5_000, kind: 'fatal-uncaught', payload: { kind: 'unhandledRejection' } });
    const result = await evaluateCrossInstanceRollback(auditPath, {
      maxStaleMs: 60_000,
      clock: () => now,
    });
    expect(result.decision).toBe('rollback');
    expect(result.lastEventKind).toBe('fatal-uncaught');
    expect(result.ageMs).toBe(5_000);
    expect(result.reason).toContain('unclean');
    expect(result.reason).toContain('fatal-uncaught');
  });

  it('returns rollback when last event is too old (stale audit log) (D-104)', async () => {
    // 5 minutes ago: even a graceful shutdown is irrelevant because
    // the log is stale.
    const now = 1_000_000;
    await appendEvent({ timestamp: now - 5 * 60_000, kind: 'graceful-shutdown', payload: {} });
    const result = await evaluateCrossInstanceRollback(auditPath, {
      maxStaleMs: 60_000,  // 1 minute
      clock: () => now,
    });
    expect(result.decision).toBe('rollback');
    expect(result.ageMs).toBe(5 * 60_000);
    expect(result.reason).toContain('stale');
  });
});
