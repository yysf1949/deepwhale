/**
 * Signal handler — D-97 v5.0 production hardening 2nd evidence.
 *
 * Wires SIGINT + SIGTERM into the v5.0 production-hardening pipeline.
 * On signal, the handler:
 *   1. Records a 'fatal-signal' event into the v5.0 AuditLog (D-87).
 *   2. Calls the optional onSignal callback (defaults to process.exit).
 *   3. Returns a cleanup function that removes both listeners.
 *
 * After D-97, the v5.0 production-hardening 1st cycle is complete:
 * D-96 formatter answers "how do I format a fatal error?"; D-97
 * signal handler answers "how does the process respond to Ctrl+C /
 * SIGTERM?".
 *
 * For testability, the handler does NOT call process.exit directly.
 * Tests inject a stub onSignal callback to capture the call without
 * killing the test process.
 */

import type { AuditLog } from '../observability/audit-log.js';

export interface SignalHandlerOptions {
  /** Called after the signal event is recorded. Defaults to process.exit(0). */
  readonly onSignal?: (signal: NodeJS.Signals) => void | Promise<void>;
  /** Tags the event with a context string (default: 'kind=signal'). */
  readonly context?: string;
}

/** The set of signals that installSignalHandlers subscribes to. */
const HANDLED_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

/**
 * Install SIGINT + SIGTERM handlers. Returns a cleanup function that
 * removes both listeners (idempotent).
 */
export function installSignalHandlers(
  auditLog: AuditLog,
  options: SignalHandlerOptions = {},
): () => void {
  const onSignal = options.onSignal ?? defaultOnSignal;
  const context = options.context ?? 'kind=signal';
  const listeners: Array<[NodeJS.Signals, NodeJS.SignalsListener]> = [];

  for (const signal of HANDLED_SIGNALS) {
    const listener: NodeJS.SignalsListener = (sig) => {
      auditLog.record({
        kind: 'fatal-signal',
        timestamp: Date.now(),
        payload: { signal: sig, context },
      });
      void onSignal(sig);
    };
    process.on(signal, listener);
    listeners.push([signal, listener]);
  }

  let cleaned = false;
  return function cleanup() {
    if (cleaned) return;
    cleaned = true;
    for (const [signal, listener] of listeners) {
      process.removeListener(signal, listener);
    }
  };
}

/**
 * Default onSignal: exit the process with code 0 (graceful).
 */
function defaultOnSignal(_signal: NodeJS.Signals): void {
  process.exit(0);
}
