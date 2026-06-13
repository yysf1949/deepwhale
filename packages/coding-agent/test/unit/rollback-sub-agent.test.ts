/**
 * rollbackSubAgent unit test -- D-109 v6.0 multi-agent safety seed part 3.
 *
 * After D-107 (foundational types) and D-108 (enforceSubAgentPolicy
 * enforcement), D-109 adds the rollback side. The function identifies
 * all audit events owned by a given sub-agent (matched via
 * event.payload.subAgentId) and marks them as rolled-back by adding
 * 'rolledBackAt' and 'rollbackReason' to the payload. It also
 * produces a new 'sub-agent-rollback' event to emit to the audit log.
 *
 * The function is PURE: it does not write to PersistingAuditLog (D-89)
 * or any external store. The caller (a future CLI / D-NN) handles
 * persistence based on the SubAgentRollbackResult.
 *
 * D-109 does NOT modify the v5.0 AuditEvent interface (D-87) to
 * keep 5 红线 empty; sub-agent ownership is encoded in the existing
 * payload field.
 */

import { describe, expect, it } from 'vitest';
import { rollbackSubAgent } from '../../src/multi-agent/rollback-sub-agent.js';
import { asSubAgentId } from '../../src/multi-agent/sub-agent.js';
import type { AuditEvent } from '../../src/observability/audit-log.js';

function makeEvent(timestamp: number, kind: string, subAgentId?: string, extra?: Record<string, unknown>): AuditEvent {
  return {
    kind,
    timestamp,
    payload: subAgentId !== undefined ? { subAgentId, ...extra } : extra,
  };
}

const SA_A = 'sa-summarizer';
const SA_B = 'sa-coder';

describe('rollbackSubAgent (D-109 v6.0 multi-agent safety seed part 3)', () => {
  it('rolls back 3 sub-agent events and emits a sub-agent-rollback event (D-109)', () => {
    const events: AuditEvent[] = [
      makeEvent(1_000, 'tool-call', SA_A, { name: 'Read' }),
      makeEvent(1_001, 'tool-call', SA_A, { name: 'Edit' }),
      makeEvent(1_002, 'tool-call', SA_A, { name: 'Write' }),
      makeEvent(1_003, 'tool-call', SA_B, { name: 'Bash' }),
    ];
    const now = 2_000;
    const result = rollbackSubAgent(events, asSubAgentId(SA_A), {
      reason: 'sub-agent denied policy',
      clock: () => now,
    });
    expect(result.outcome).toBe('rolled-back');
    expect(result.eventsRolledBack).toBe(3);
    expect(result.eventsKept).toBe(1);
    expect(result.rolledBackAt).toBe(now);
    expect(result.subAgentId).toBe(SA_A);
    // Each marked event has rolledBackAt + rollbackReason added to payload.
    expect(result.markedEvents).toHaveLength(3);
    for (const ev of result.markedEvents) {
      expect(ev.payload?.rolledBackAt).toBe(now);
      expect(ev.payload?.rollbackReason).toBe('sub-agent denied policy');
    }
    // The new event is 'sub-agent-rollback' with the right payload.
    expect(result.newEvent.kind).toBe('sub-agent-rollback');
    expect(result.newEvent.timestamp).toBe(now);
    expect(result.newEvent.payload?.subAgentId).toBe(SA_A);
    expect(result.newEvent.payload?.eventCount).toBe(3);
    expect(result.newEvent.payload?.reason).toBe('sub-agent denied policy');
    expect(result.summary).toContain('rolled back 3 events');
    expect(result.summary).toContain(SA_A);
  });

  it('dryRun returns dry-run outcome with no marked events but still emits new event (D-109)', () => {
    const events: AuditEvent[] = [
      makeEvent(1_000, 'tool-call', SA_A),
      makeEvent(1_001, 'tool-call', SA_A),
      makeEvent(1_002, 'tool-call', SA_B),  // not a sub-agent-A event -> kept
    ];
    const result = rollbackSubAgent(events, asSubAgentId(SA_A), {
      dryRun: true,
      reason: 'preview only',
    });
    expect(result.outcome).toBe('dry-run');
    expect(result.eventsRolledBack).toBe(0);
    expect(result.eventsKept).toBe(1);  // the SA_B event is kept
    expect(result.markedEvents).toEqual([]);
    expect(result.newEvent.kind).toBe('sub-agent-rollback');
    expect(result.newEvent.payload?.dryRun).toBe(true);
    expect(result.summary).toContain('dry-run');
  });

  it('returns no-events when sub-agent has no events in the list (D-109)', () => {
    const events: AuditEvent[] = [
      makeEvent(1_000, 'tool-call', SA_B),
      makeEvent(1_001, 'tool-call'),
    ];
    const result = rollbackSubAgent(events, asSubAgentId(SA_A), { reason: 'cleanup' });
    expect(result.outcome).toBe('no-events');
    expect(result.eventsRolledBack).toBe(0);
    expect(result.eventsKept).toBe(2);
    expect(result.markedEvents).toEqual([]);
    // Still emits a 'sub-agent-rollback' event so the audit log records the intent.
    expect(result.newEvent.kind).toBe('sub-agent-rollback');
    expect(result.newEvent.payload?.eventCount).toBe(0);
  });

  it('handles empty events array gracefully (D-109)', () => {
    const result = rollbackSubAgent([], asSubAgentId(SA_A), { reason: 'no events at all' });
    expect(result.outcome).toBe('no-events');
    expect(result.eventsRolledBack).toBe(0);
    expect(result.eventsKept).toBe(0);
    expect(result.markedEvents).toEqual([]);
    expect(result.newEvent.kind).toBe('sub-agent-rollback');
    expect(result.newEvent.payload?.eventCount).toBe(0);
    expect(result.summary).toContain('no events');
  });
});
