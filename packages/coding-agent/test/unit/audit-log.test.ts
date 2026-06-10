/**
 * AuditLog unit test — D-87 v5.0 observability + auditability minimal seed.
 *
 * The test verifies the smallest possible v5.0 audit log behavior:
 *   - events are recorded in insertion order
 *   - timestamps come from the injected clock (deterministic)
 *   - getEvents() returns a read-only view
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
});
