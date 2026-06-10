/**
 * Process-level uncaught handler -- D-98 v5.0 production hardening 3rd evidence.
 *
 * Wires Node's 'uncaughtException' and 'unhandledRejection' events into
 * the v5.0 production-hardening pipeline. On uncaught, the handler:
 *   1. Normalizes the input (Error -> message+stack; non-Error -> string).
 *   2. Records a 'fatal-uncaught' event into the v5.0 AuditLog (D-87).
 *   3. Calls the optional onUncaught callback (defaults to process.exit(1)).
 *   4. Returns a cleanup function that removes both listeners.
 *
 * After D-96 (formatter) + D-97 (signal handler) + D-98 (uncaught
 * handler), the v5.0 production-hardening theme covers a 3-event
 * taxonomy for fatal conditions: format fatal errors + handle
 * operator signals + catch unhandled exceptions. Event kinds are
 * orthogonal ('fatal-error' from D-96, 'fatal-signal' from D-97,
 * 'fatal-uncaught' from D-98) so the readAuditLog D-90 query can
 * filter cleanly by kind.
 *
 * For testability, the handler does NOT call process.exit directly.
 * Tests inject a stub onUncaught callback to capture the call without
 * killing the test process. The default-onUncaught uses process.exit(1)
 * (non-zero) because an uncaught exception signals a real failure, NOT
 * a graceful shutdown like SIGINT.
 */

import type { AuditLog } from '../observability/audit-log.js';

export type UncaughtKind = 'uncaughtException' | 'unhandledRejection';

/**
 * Normalized payload for an uncaught event. The input to Node's
 * uncaughtException is an Error; the input to unhandledRejection is
 * any value (commonly an Error, but may be a string / number / object).
 * This shape is stable and easy to read back from the AuditLog.
 */
export interface NormalizedUncaughtPayload {
  readonly kind: UncaughtKind;
  readonly message: string;
  readonly stack?: string;
}

export interface ProcessUncaughtHandlerOptions {
  /**
   * Called after the uncaught event is recorded. Defaults to
   * process.exit(1) (non-zero, because uncaught = real failure,
   * not graceful shutdown).
   */
  readonly onUncaught?: (
    kind: UncaughtKind,
    payload: NormalizedUncaughtPayload,
  ) => void | Promise<void>;
  /** Tags the event with a context string (default: 'kind=uncaught'). */
  readonly context?: string;
}

/** The set of Node-level catchall events this module subscribes to. */
const HANDLED_EVENTS: readonly UncaughtKind[] = [
  'uncaughtException',
  'unhandledRejection',
];

/**
 * Normalize the input to { kind, message, stack? }. Used by the
 * uncaught handler before recording to the AuditLog.
 */
function normalize(
  kind: UncaughtKind,
  input: unknown,
): NormalizedUncaughtPayload {
  if (input instanceof Error) {
    return {
      kind,
      message: input.message,
      ...(input.stack !== undefined ? { stack: input.stack } : {}),
    };
  }
  return { kind, message: String(input) };
}

/**
 * Default onUncaught: exit the process with code 1 (non-zero,
 * signals real failure, not graceful).
 */
function defaultOnUncaught(
  _kind: UncaughtKind,
  _payload: NormalizedUncaughtPayload,
): void {
  process.exit(1);
}

/**
 * Install 'uncaughtException' and 'unhandledRejection' handlers.
 * Returns a cleanup function that removes both listeners (idempotent).
 */
export function installProcessUncaughtHandlers(
  auditLog: AuditLog,
  options: ProcessUncaughtHandlerOptions = {},
): () => void {
  const onUncaught = options.onUncaught ?? defaultOnUncaught;
  const context = options.context ?? 'kind=uncaught';
  const listeners: Array<[UncaughtKind, (...args: unknown[]) => void]> = [];

  for (const event of HANDLED_EVENTS) {
    const listener: (...args: unknown[]) => void = (raw) => {
      const payload = normalize(event, raw);
      auditLog.record({
        kind: 'fatal-uncaught',
        timestamp: Date.now(),
        payload: { ...payload, context },
      });
      void onUncaught(event, payload);
    };
    process.on(event, listener);
    listeners.push([event, listener]);
  }

  let cleaned = false;
  return function cleanup() {
    if (cleaned) return;
    cleaned = true;
    for (const [event, listener] of listeners) {
      process.removeListener(event, listener);
    }
  };
}
