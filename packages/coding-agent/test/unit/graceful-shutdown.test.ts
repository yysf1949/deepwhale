/**
 * gracefulShutdown unit test -- D-99 v5.0 production hardening 4th evidence.
 *
 * After D-96 (formatter), D-97 (signal handler), and D-98 (uncaught
 * handler), D-99 adds the graceful-shutdown sequence that gives the
 * application a chance to flush in-flight work between the trigger
 * and process.exit. Together D-96 + D-97 + D-98 + D-99 form a
 * 4-step production-hardening protocol: format + signal + catch + drain.
 *
 * gracefulShutdown is an INVOKED function (not a process-level
 * listener installer; those are D-97/D-98). It sequences:
 *   1. beforeExit(trigger) -- use to flush in-flight writes.
 *   2. auditLog.record({ kind: 'graceful-shutdown', payload: { trigger, exitCode, context } }).
 *   3. onComplete(exitCode) -- defaults to process.exit(exitCode).
 *
 * For testability, the function does NOT call process.exit directly;
 * it calls the optional onComplete callback. Tests inject a stub
 * onComplete to capture the exit code without killing the test process.
 * The function is defensive: errors from beforeExit / auditLog.record /
 * onComplete are caught and surfaced via ShutdownResult, never propagated.
 */

import { describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/observability/audit-log.js';
import { gracefulShutdown } from '../../src/hardening/graceful-shutdown.js';

describe('gracefulShutdown (D-99 v5.0 production hardening 4th evidence)', () => {
  it('sequences beforeExit, audit record, onComplete in order, returning ShutdownResult (D-99)', async () => {
    const log = new AuditLog();
    const order: string[] = [];
    const beforeExit = vi.fn(() => { order.push('beforeExit'); });
    const onComplete = vi.fn((code: number) => { order.push(`onComplete:${code}`); });
    const result = await gracefulShutdown(log, 'SIGINT', { beforeExit, onComplete });
    expect(order).toEqual(['beforeExit', 'onComplete:0']);
    expect(beforeExit).toHaveBeenCalledWith('SIGINT');
    expect(onComplete).toHaveBeenCalledWith(0);
    // AuditLog has the graceful-shutdown event.
    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'graceful-shutdown',
      payload: { trigger: 'SIGINT', exitCode: 0, context: 'kind=shutdown' },
    });
    expect(result).toEqual({
      exitCode: 0,
      trigger: 'SIGINT',
      eventsRecorded: 1,
      beforeExitInvoked: true,
      onCompleteInvoked: true,
    });
  });

  it('exitCode from options is passed to onComplete and recorded in audit event (D-99)', async () => {
    const log = new AuditLog();
    const onComplete = vi.fn();
    const result = await gracefulShutdown(log, 'uncaughtException', {
      onComplete,
      exitCode: 1,
    });
    expect(onComplete).toHaveBeenCalledWith(1);
    expect(result.exitCode).toBe(1);
    const events = log.getEvents();
    expect(events[0]!.payload).toMatchObject({ trigger: 'uncaughtException', exitCode: 1 });
  });

  it('beforeExit that throws does not abort the shutdown: onComplete still called and eventsRecorded=1 (D-99)', async () => {
    const log = new AuditLog();
    const beforeExit = vi.fn(() => { throw new Error('flush failed'); });
    const onComplete = vi.fn();
    const result = await gracefulShutdown(log, 'SIGTERM', { beforeExit, onComplete });
    // beforeExit threw -> beforeExitInvoked=false, but onComplete was still called.
    expect(beforeExit).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith(0);
    // The audit event was still recorded AFTER beforeExit failed.
    expect(result.eventsRecorded).toBe(1);
    expect(result.beforeExitInvoked).toBe(false);
    expect(result.onCompleteInvoked).toBe(true);
  });

  it('onComplete that throws does not propagate: result.onCompleteInvoked=false and function resolves (D-99)', async () => {
    const log = new AuditLog();
    const onComplete = vi.fn(() => { throw new Error('exit failed'); });
    // Should NOT throw, even though the user-supplied onComplete is broken.
    const result = await gracefulShutdown(log, 'manual', { onComplete });
    expect(onComplete).toHaveBeenCalledWith(0);
    expect(result.onCompleteInvoked).toBe(false);
    // The audit event was still recorded BEFORE onComplete failed.
    expect(result.eventsRecorded).toBe(1);
  });
});
