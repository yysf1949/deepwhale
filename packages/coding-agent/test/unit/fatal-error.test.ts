/**
 * Fatal-error formatter unit test — D-96 v5.0 production hardening 1st evidence.
 *
 * The 4th and final v5.0 theme (production hardening) starts here with a
 * minimal seed: formatFatalError + recordFatalEvent. After D-96, the
 * project has a single source of truth for how to format any uncaught
 * error into a structured event, and a bridge that records fatal
 * events into the v5.0 audit log (D-87/88/89/90).
 *
 * Future D-97+ can build on this: SIGINT/SIGTERM handler, uncaught
 * exception process-level hook, graceful shutdown sequence.
 */

import { describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/observability/audit-log.js';
import { formatFatalError, recordFatalEvent } from '../../src/hardening/fatal-error.js';

describe('formatFatalError + recordFatalEvent (D-96 v5.0 production hardening 1st evidence)', () => {
  it('formats an Error instance with name, message, stack, and context (D-96)', () => {
    const err = new TypeError('boom');
    const ev = formatFatalError(err, 'phase=startup');
    expect(ev.kind).toBe('fatal-error');
    expect(ev.payload.name).toBe('TypeError');
    expect(ev.payload.message).toBe('boom');
    expect(ev.payload.stack).toContain('TypeError: boom');
    expect(ev.payload.context).toBe('phase=startup');
    expect(ev.payload.originalType).toBe('Error');
  });

  it('formats a thrown string defensively (D-96)', () => {
    const ev = formatFatalError('plain string error');
    expect(ev.kind).toBe('fatal-error');
    expect(ev.payload.name).toBe('string');
    expect(ev.payload.message).toBe('plain string error');
    expect(ev.payload.originalType).toBe('string');
    expect(ev.payload.stack).toBeUndefined();
  });

  it('formats a thrown object defensively (D-96)', () => {
    const ev = formatFatalError({ code: 'E_NOPE', detail: 'no' });
    expect(ev.payload.name).toBe('object');
    expect(ev.payload.message).toBe('{"code":"E_NOPE","detail":"no"}');
    expect(ev.payload.originalType).toBe('object');
  });

  it('recordFatalEvent writes the event into the AuditLog (D-96 cross-theme bridge)', () => {
    const log = new AuditLog();
    const ev = formatFatalError(new Error('disk full'), 'phase=write');
    recordFatalEvent(log, ev);
    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'fatal-error',
      payload: { name: 'Error', message: 'disk full', context: 'phase=write' },
    });
  });
});
