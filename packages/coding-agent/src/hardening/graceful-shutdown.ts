/**
 * Graceful shutdown sequence -- D-99 v5.0 production hardening 4th evidence.
 *
 * Sequences a 3-step shutdown protocol: (1) call optional beforeExit
 * callback (use to flush in-flight writes), (2) record a
 * 'graceful-shutdown' event into the v5.0 AuditLog (D-87) tagged
 * with the shutdown trigger, (3) call optional onComplete callback
 * (defaults to process.exit(exitCode)). Returns a ShutdownResult
 * describing what happened.
 *
 * After D-96 (formatter) + D-97 (signal handler) + D-98 (uncaught
 * handler) + D-99 (graceful shutdown), the v5.0 production-hardening
 * theme covers a 4-step protocol: format fatal errors + handle
 * operator signals + catch unhandled exceptions + drain pending work.
 * Event kinds are orthogonal ('fatal-error' from D-96, 'fatal-signal'
 * from D-97, 'fatal-uncaught' from D-98, 'graceful-shutdown' from
 * D-99) so the readAuditLog D-90 query can filter cleanly by kind.
 *
 * gracefulShutdown is an INVOKED function (called on demand by D-97/
 * D-98 handlers or application code), NOT a process-level listener
 * installer (those are D-97/D-98). It composes with them: a D-97
 * signal handler can call gracefulShutdown(auditLog, 'SIGINT')
 * before process.exit(0), gaining a flush step in the middle.
 *
 * For testability, the function does NOT call process.exit directly.
 * Tests inject a stub onComplete callback to capture the exit code
 * without killing the test process. The function is defensive:
 * errors from beforeExit / auditLog.record / onComplete are caught
 * and surfaced via ShutdownResult, never propagated as unhandled
 * rejections (which would defeat the purpose of graceful shutdown).
 */

import type { AuditLog } from '../observability/audit-log.js';

/** Discriminator for what triggered the shutdown. */
export type ShutdownTrigger =
  | NodeJS.Signals
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'manual';

export interface GracefulShutdownOptions {
  /**
   * Called FIRST, before the audit event. Use to flush in-flight
   * writes. Errors are caught and reported via beforeExitInvoked=false.
   */
  readonly beforeExit?: (trigger: ShutdownTrigger) => void | Promise<void>;
  /**
   * Called LAST, after the audit event. Defaults to
   * (code) => process.exit(code). Errors are caught and reported
   * via onCompleteInvoked=false.
   */
  readonly onComplete?: (exitCode: number) => void | Promise<void>;
  /** Exit code to pass to onComplete. Default: 0. */
  readonly exitCode?: number;
  /** Tags the event with a context string (default: 'kind=shutdown'). */
  readonly context?: string;
}

export interface ShutdownResult {
  /** The exit code that was passed to onComplete. */
  readonly exitCode: number;
  /** The trigger that caused the shutdown. */
  readonly trigger: ShutdownTrigger;
  /** Number of 'graceful-shutdown' events recorded (0 if AuditLog.record threw). */
  readonly eventsRecorded: number;
  /** True if beforeExit was invoked without throwing. */
  readonly beforeExitInvoked: boolean;
  /** True if onComplete was invoked without throwing. */
  readonly onCompleteInvoked: boolean;
}

/** Default onComplete: exit the process with the given code. */
function defaultOnComplete(code: number): void {
  process.exit(code);
}

/**
 * Sequence a graceful shutdown. Awaits beforeExit, records the
 * 'graceful-shutdown' event, then calls onComplete. Errors are
 * caught at every step and surfaced via ShutdownResult; the
 * function never throws.
 */
export async function gracefulShutdown(
  auditLog: AuditLog,
  trigger: ShutdownTrigger,
  options: GracefulShutdownOptions = {},
): Promise<ShutdownResult> {
  const exitCode = options.exitCode ?? 0;
  const context = options.context ?? 'kind=shutdown';
  const onComplete = options.onComplete ?? defaultOnComplete;

  // Step 1: beforeExit. Errors are caught.
  let beforeExitInvoked = true;
  if (options.beforeExit) {
    try {
      await options.beforeExit(trigger);
    } catch {
      beforeExitInvoked = false;
    }
  }

  // Step 2: record the shutdown event. Errors are caught so we still
  // reach step 3.
  let eventsRecorded = 0;
  try {
    auditLog.record({
      kind: 'graceful-shutdown',
      timestamp: Date.now(),
      payload: { trigger, exitCode, context },
    });
    eventsRecorded = 1;
  } catch {
    // Swallow: we want onComplete to still be called so the process
    // can exit even if the audit log is misbehaving.
  }

  // Step 3: onComplete. Errors are caught so the function resolves.
  let onCompleteInvoked = true;
  try {
    await onComplete(exitCode);
  } catch {
    onCompleteInvoked = false;
  }

  return {
    exitCode,
    trigger,
    eventsRecorded,
    beforeExitInvoked,
    onCompleteInvoked,
  };
}
