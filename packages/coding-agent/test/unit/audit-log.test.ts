/**
 * AuditLog unit test — D-87 v5.0 observability + auditability minimal seed.
 *
 * The test verifies the smallest possible v5.0 audit log behavior:
 *   - events are recorded in insertion order
 *   - timestamps come from the injected clock (deterministic)
 *   - getEvents() returns a read-only view
 *
 * D-129 v5.0 3rd-cycle depth extension tests:
 *   - correlationId is preserved on recorded events
 *   - queryByCorrelationId groups events by correlation id
 *   - events without a correlationId are NOT returned by the query
 *
 * Future D-88+ sub-sprints will add file persistence, integration
 * with ToolLoopPolicy, and a CLI dump command. The seed test here
 * is the v5.0 starting line.
 */

import { describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/observability/audit-log.js';

describe('AuditLog (D-87 v5.0 observability+auditability seed)', () => {
  it('records events in insertion order with deterministic timestamps from the injected clock (D-87 v5.0 audit log seed)', () => {
    let t = 1000;
    const log = new AuditLog(() => t++);
    log.record({ kind: 'tool-call', payload: { tool: 'read_file' } });
    log.record({ kind: 'goal', payload: { goal: 'fix bug' } });
    log.record({ kind: 'tool-result', payload: { tool: 'read_file', ok: true } });

    const events = log.getEvents();
    expect(events).toHaveLength(3);

    // Insertion order preserved.
    expect(events[0]).toMatchObject({ kind: 'tool-call', payload: { tool: 'read_file' } });
    expect(events[1]).toMatchObject({ kind: 'goal', payload: { goal: 'fix bug' } });
    expect(events[2]).toMatchObject({ kind: 'tool-result', payload: { tool: 'read_file', ok: true } });

    // Deterministic timestamps from the injected clock.
    expect(events[0]?.timestamp).toBe(1000);
    expect(events[1]?.timestamp).toBe(1001);
    expect(events[2]?.timestamp).toBe(1002);

    // getEvents() returns a read-only view (frozen array).
    expect(Object.isFrozen(events)).toBe(true);
  });

  it('preserves an explicit correlationId on the recorded event (D-129 v5.0 3rd cycle)', () => {
    let t = 2000;
    const log = new AuditLog(() => t++);
    const ev = log.record({
      kind: 'tool-call',
      payload: { tool: 'read_file' },
      correlationId: 'corr-abc',
    });
    expect(ev.correlationId).toBe('corr-abc');
    expect(log.getEvents()[0]?.correlationId).toBe('corr-abc');
  });

  it('omits correlationId from the event when none is supplied (D-129 v5.0 3rd cycle)', () => {
    const log = new AuditLog(() => 1);
    const ev = log.record({ kind: 'tool-call', payload: { tool: 'read_file' } });
    expect(ev.correlationId).toBeUndefined();
    // The key must NOT appear on the recorded event.
    expect('correlationId' in ev).toBe(false);
  });

  it('queryByCorrelationId groups events by correlation id in insertion order (D-129 v5.0 3rd cycle)', () => {
    let t = 3000;
    const log = new AuditLog(() => t++);
    log.record({ kind: 'tool-call', payload: { n: 1 }, correlationId: 'corr-A' });
    log.record({ kind: 'tool-result', payload: { n: 2 }, correlationId: 'corr-A' });
    log.record({ kind: 'tool-call', payload: { n: 3 } });  // no correlation
    log.record({ kind: 'tool-result', payload: { n: 4 }, correlationId: 'corr-B' });
    log.record({ kind: 'loop-end', payload: { n: 5 }, correlationId: 'corr-A' });

    const a = log.queryByCorrelationId('corr-A');
    expect(a).toHaveLength(3);
    expect(a.map((e) => e.kind)).toEqual(['tool-call', 'tool-result', 'loop-end']);
    expect(a[0]?.payload).toEqual({ n: 1 });
    expect(a[2]?.payload).toEqual({ n: 5 });

    const b = log.queryByCorrelationId('corr-B');
    expect(b).toHaveLength(1);
    expect(b[0]?.kind).toBe('tool-result');

    // Unknown id -> empty.
    expect(log.queryByCorrelationId('corr-Z')).toHaveLength(0);
    // Events without a correlationId are NOT returned by the query.
    expect(log.queryByCorrelationId('')).toHaveLength(0);
  });
});
