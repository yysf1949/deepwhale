/**
 * rollbackSubAgent -- D-109 v6.0 multi-agent safety seed part 3.
 *
 * Identifies all audit events owned by a given sub-agent
 * (matched via event.payload.subAgentId) and marks them as
 * rolled-back by adding 'rolledBackAt' + 'rollbackReason' to
 * the payload. Also produces a new 'sub-agent-rollback' event
 * to emit to the audit log.
 *
 * The function is PURE: it does not write to PersistingAuditLog
 * (D-89) or any external store. The caller (a future CLI / D-NN)
 * handles persistence based on the SubAgentRollbackResult.
 *
 * D-109 does NOT modify the v5.0 AuditEvent interface (D-87)
 * to keep 5 红线 empty; sub-agent ownership is encoded in the
 * existing payload field.
 *
 * DEFENSIVE: never throws. Empty event list, missing subAgentId
 * in any event, or dryRun mode are all handled gracefully.
 */

import type { AuditEvent } from '../observability/audit-log.js';
import type { SubAgentId } from './sub-agent.js';

export type SubAgentRollbackOutcome = 'rolled-back' | 'no-events' | 'dry-run';

export interface SubAgentRollbackOptions {
  readonly reason?: string;
  readonly dryRun?: boolean;
  readonly clock?: () => number;
}

export interface SubAgentRollbackResult {
  readonly subAgentId: SubAgentId;
  readonly outcome: SubAgentRollbackOutcome;
  readonly eventsRolledBack: number;
  readonly eventsKept: number;
  readonly rolledBackAt: number;
  readonly reason: string;
  readonly summary: string;
  readonly markedEvents: readonly AuditEvent[];
  readonly newEvent: AuditEvent;
}

function findSubAgentEvents(
  events: readonly AuditEvent[],
  subAgentId: SubAgentId,
): AuditEvent[] {
  return events.filter((e) => e.payload?.subAgentId === subAgentId);
}

function buildSummary(
  subAgentId: SubAgentId,
  outcome: SubAgentRollbackOutcome,
  eventCount: number,
  reason: string,
): string {
  if (outcome === 'dry-run') {
    return `dry-run: would roll back ${eventCount} events for ${subAgentId} (reason: ${reason})`;
  }
  if (outcome === 'no-events') {
    return `no events to roll back for ${subAgentId} (reason: ${reason})`;
  }
  return `rolled back ${eventCount} events for ${subAgentId} (reason: ${reason})`;
}

/**
 * Roll back all audit events owned by the given sub-agent.
 *
 * Identifies sub-agent-owned events by matching
 * `event.payload.subAgentId === subAgentId`. Marks each by
 * adding `rolledBackAt` (timestamp) and `rollbackReason`
 * (string from options) to the payload. Produces a new
 * 'sub-agent-rollback' event for the audit log.
 *
 * In dryRun mode, the function still emits a 'sub-agent-rollback'
 * event (with `dryRun: true` in the payload) but does NOT mark
 * any existing events. This lets callers preview the rollback
 * without committing to it.
 *
 * The function is PURE: callers must persist `markedEvents` and
 * `newEvent` themselves (e.g. via D-89 PersistingAuditLog).
 */
export function rollbackSubAgent(
  events: readonly AuditEvent[],
  subAgentId: SubAgentId,
  options?: SubAgentRollbackOptions,
): SubAgentRollbackResult {
  const subAgentEvents = findSubAgentEvents(events, subAgentId);
  const rolledBackAt = (options?.clock ?? Date.now)();
  const reason = options?.reason ?? 'unspecified';
  const eventsKept = events.length - subAgentEvents.length;

  if (options?.dryRun === true) {
    const newEvent: AuditEvent = {
      kind: 'sub-agent-rollback',
      timestamp: rolledBackAt,
      payload: {
        subAgentId,
        eventCount: subAgentEvents.length,
        reason,
        dryRun: true,
      },
    };
    return {
      subAgentId,
      outcome: 'dry-run',
      eventsRolledBack: 0,
      eventsKept,
      rolledBackAt,
      reason,
      summary: buildSummary(subAgentId, 'dry-run', subAgentEvents.length, reason),
      markedEvents: [],
      newEvent,
    };
  }

  const outcome: SubAgentRollbackOutcome =
    subAgentEvents.length > 0 ? 'rolled-back' : 'no-events';
  const markedEvents: AuditEvent[] = subAgentEvents.map((e) => ({
    ...e,
    payload: {
      ...(e.payload ?? {}),
      rolledBackAt,
      rollbackReason: reason,
    },
  }));
  const newEvent: AuditEvent = {
    kind: 'sub-agent-rollback',
    timestamp: rolledBackAt,
    payload: {
      subAgentId,
      eventCount: subAgentEvents.length,
      reason,
    },
  };
  return {
    subAgentId,
    outcome,
    eventsRolledBack: subAgentEvents.length,
    eventsKept,
    rolledBackAt,
    reason,
    summary: buildSummary(subAgentId, outcome, subAgentEvents.length, reason),
    markedEvents,
    newEvent,
  };
}
