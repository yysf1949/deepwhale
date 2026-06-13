/**
 * evaluateCrossInstanceRollback -- D-104 v5.0 production hardening 5th evidence.
 *
 * Ties the per-instance hardening (D-96/97/98/99) to a
 * cross-instance recovery decision. The function reads the prior
 * instance's audit log via D-90 readAuditLog and decides whether
 * the next instance should:
 *   - proceed: prior instance was graceful + recent.
 *   - rollback: prior instance was either fatal or stale.
 *   - no-evidence: prior audit log is empty (first run).
 *
 * Decision precedence (first match wins):
 *   1. audit log empty -> no-evidence.
 *   2. ageMs > maxStaleMs -> rollback (stale).
 *   3. last event kind === 'graceful-shutdown' -> proceed.
 *   4. otherwise -> rollback (unclean last event).
 *
 * The function is async (because readAuditLog is async) but
 * does NOT log to the AuditLog itself. Accepts an optional
 * clock for testing. The function is DEFENSIVE: missing file
 * -> no-evidence (D-90 ENOENT handling is reused); never throws.
 */

import { readAuditLog } from '../observability/audit-log-reader.js';

export type RollbackDecision = 'proceed' | 'rollback' | 'no-evidence';

export interface RollbackEvaluationOptions {
  /** Maximum age (ms) the last audit event is allowed to be. */
  readonly maxStaleMs: number;
  /** Optional clock injection for testing; default Date.now. */
  readonly clock?: () => number;
}

export interface RollbackEvaluation {
  readonly decision: RollbackDecision;
  readonly lastEventTimestamp?: number;
  readonly lastEventKind?: string;
  readonly ageMs?: number;
  readonly maxStaleMs: number;
  /** Human-readable explanation of the decision. */
  readonly reason: string;
}

const GRACEFUL_KIND = 'graceful-shutdown';

export async function evaluateCrossInstanceRollback(
  auditPath: string,
  options: RollbackEvaluationOptions,
): Promise<RollbackEvaluation> {
  const events = await readAuditLog(auditPath);
  const clock = options.clock ?? Date.now;
  const maxStaleMs = options.maxStaleMs;

  if (events.length === 0) {
    return {
      decision: 'no-evidence',
      maxStaleMs,
      reason: 'no prior audit log entries (first run)',
    };
  }

  const last = events[events.length - 1]!;
  const ageMs = clock() - last.timestamp;

  // Precedence 2: stale log (regardless of last event kind).
  if (ageMs > maxStaleMs) {
    return {
      decision: 'rollback',
      lastEventTimestamp: last.timestamp,
      lastEventKind: last.kind,
      ageMs,
      maxStaleMs,
      reason: `audit log stale beyond maxStaleMs: ${ageMs}ms > ${maxStaleMs}ms`,
    };
  }

  // Precedence 3: clean shutdown.
  if (last.kind === GRACEFUL_KIND) {
    return {
      decision: 'proceed',
      lastEventTimestamp: last.timestamp,
      lastEventKind: last.kind,
      ageMs,
      maxStaleMs,
      reason: `last event was graceful shutdown within freshness window (${ageMs}ms <= ${maxStaleMs}ms)`,
    };
  }

  // Precedence 4: any other (non-graceful, non-stale) event is unclean.
  return {
    decision: 'rollback',
    lastEventTimestamp: last.timestamp,
    lastEventKind: last.kind,
    ageMs,
    maxStaleMs,
    reason: `last event was unclean: ${last.kind} (not ${GRACEFUL_KIND})`,
  };
}
