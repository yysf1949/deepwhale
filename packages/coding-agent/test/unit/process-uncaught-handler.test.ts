/**
 * installProcessUncaughtHandlers unit test -- D-98 v5.0 production hardening 3rd evidence.
 *
 * After D-96 added the fatal-error formatter (formatting) and D-97 added
 * the signal handler (operator signals), D-98 adds the process-level
 * catchall handler (uncaught exceptions and unhandled promise rejections).
 * Together D-96 + D-97 + D-98 form a 3-event taxonomy for fatal
 * conditions: format + operator-signal + unhandled-async-or-sync.
 *
 * The handler wires 'uncaughtException' and 'unhandledRejection'. On
 * uncaught, it:
 *   1. Normalizes the input (Error -> message+stack; non-Error -> string).
 *   2. Records a 'fatal-uncaught' event into the AuditLog (D-87).
 *   3. Calls the optional onUncaught callback (defaults to process.exit(1)).
 *   4. Returns a cleanup function that removes both listeners.
 *
 * For testability, the handler does NOT call process.exit directly;
 * it calls the optional onUncaught callback. Tests inject a stub
 * onUncaught to capture the call without killing the test process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/observability/audit-log.js';
import { installProcessUncaughtHandlers } from '../../src/hardening/process-uncaught-handler.js';

describe('installProcessUncaughtHandlers (D-98 v5.0 production hardening 3rd evidence)', () => {
  let added: Array<[string, (...args: unknown[]) => void]>;
  let removed: Array<[string, (...args: unknown[]) => void]>;

  beforeEach(() => {
    added = [];
    removed = [];
    // Spy on process.on to capture listeners added by installProcessUncaughtHandlers.
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      added.push([event as string, listener as (...args: unknown[]) => void]);
      return process;
    });
    // Spy on process.removeListener to capture cleanup.
    vi.spyOn(process, 'removeListener').mockImplementation((event, listener) => {
      removed.push([event as string, listener as (...args: unknown[]) => void]);
      return process;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers handlers for uncaughtException and unhandledRejection (D-98)', () => {
    const cleanup = installProcessUncaughtHandlers(new AuditLog());
    expect(added.map(([e]) => e)).toEqual(
      expect.arrayContaining(['uncaughtException', 'unhandledRejection']),
    );
    expect(added).toHaveLength(2);
    cleanup();
  });

  it('cleanup function removes both listeners (D-98)', () => {
    const cleanup = installProcessUncaughtHandlers(new AuditLog());
    cleanup();
    expect(removed.map(([e]) => e)).toEqual(
      expect.arrayContaining(['uncaughtException', 'unhandledRejection']),
    );
    expect(removed).toHaveLength(2);
  });

  it('cleanup is idempotent (D-98)', () => {
    const cleanup = installProcessUncaughtHandlers(new AuditLog());
    cleanup();
    cleanup();
    // Only one removeListener call per event, not 2.
    expect(removed).toHaveLength(2);
  });

  it('on uncaughtException with Error, handler normalizes payload and records fatal-uncaught + calls onUncaught (D-98)', () => {
    const log = new AuditLog();
    const onUncaught = vi.fn();
    installProcessUncaughtHandlers(log, { onUncaught });
    // Find the registered uncaughtException handler and call it directly.
    const entry = added.find(([e]) => e === 'uncaughtException');
    expect(entry).toBeDefined();
    const handler = entry![1];
    const err = new Error('boom');
    handler(err);
    // AuditLog has the fatal-uncaught event with normalized payload.
    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'fatal-uncaught',
      payload: {
        kind: 'uncaughtException',
        message: 'boom',
      },
    });
    // Stack is preserved when present.
    expect((events[0]!.payload as { stack?: string }).stack).toContain('boom');
    // onUncaught was called with the normalized payload.
    expect(onUncaught).toHaveBeenCalledWith('uncaughtException', {
      kind: 'uncaughtException',
      message: 'boom',
      stack: expect.stringContaining('boom'),
    });
  });
});
