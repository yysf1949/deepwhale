/**
 * Fatal-error formatter — D-96 v5.0 production hardening theme 1st evidence.
 *
 * A pure, defensive formatter that converts any thrown value (Error
 * instance, string, object, etc.) into a structured FatalErrorEvent,
 * plus a recorder that writes the event into the v5.0 AuditLog (D-87).
 *
 * After D-96, the project has a single source of truth for how to
 * format an uncaught error. Future D-97+ can build on this:
 * SIGINT/SIGTERM handler, uncaught exception process-level hook,
 * health check endpoint, graceful shutdown sequence.
 *
 * The cross-theme bridge (fatal events flow into the audit log) makes
 * production-hardening + observability complementary: the same
 * readAuditLog path (D-90) can be used to inspect fatal events.
 */

import type { AuditLog } from '../observability/audit-log.js';

export interface FatalErrorEvent {
  readonly kind: 'fatal-error';
  readonly timestamp: number;
  readonly payload: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
    readonly context?: string;
    readonly originalType: 'Error' | 'string' | 'object' | 'other';
  };
}

/**
 * Format any thrown value into a structured FatalErrorEvent. Never
 * throws. Always returns a valid event.
 */
export function formatFatalError(error: unknown, context?: string): FatalErrorEvent {
  let name: string;
  let message: string;
  let stack: string | undefined;
  let originalType: FatalErrorEvent['payload']['originalType'];

  if (error instanceof Error) {
    name = error.name;
    message = error.message;
    stack = error.stack;
    originalType = 'Error';
  } else if (typeof error === 'string') {
    name = 'string';
    message = error;
    originalType = 'string';
  } else if (error !== null && typeof error === 'object') {
    name = 'object';
    try {
      message = JSON.stringify(error);
    } catch {
      // Circular reference or unstringifiable object.
      message = '[unstringifiable object]';
    }
    originalType = 'object';
  } else {
    name = typeof error;
    message = String(error);
    originalType = 'other';
  }

  return {
    kind: 'fatal-error',
    timestamp: Date.now(),
    payload: {
      name,
      message,
      ...(stack !== undefined ? { stack } : {}),
      ...(context !== undefined ? { context } : {}),
      originalType,
    },
  };
}

/**
 * Record a FatalErrorEvent into the v5.0 AuditLog (D-87). This is the
 * cross-theme bridge that makes production-hardening fatal events
 * queryable via the same observability path (D-90 readAuditLog).
 */
export function recordFatalEvent(auditLog: AuditLog, event: FatalErrorEvent): void {
  auditLog.record(event);
}
