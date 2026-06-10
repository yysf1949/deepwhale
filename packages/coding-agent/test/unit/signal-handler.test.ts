/**
 * installSignalHandlers unit test — D-97 v5.0 production hardening 2nd evidence.
 *
 * After D-96 added the fatal-error formatter (formatting), D-97 adds
 * the signal handler (handling). Together they form the v5.0 production
 * hardening 1st cycle: format fatal errors + handle process signals.
 *
 * The handler wires SIGINT + SIGTERM. On signal, it:
 *   1. Records a 'fatal-signal' event into the AuditLog (D-87).
 *   2. Calls the optional onSignal callback (defaults to process.exit).
 *   3. Returns a cleanup function that removes both listeners.
 *
 * For testability, the handler does NOT call process.exit directly;
 * it calls the optional onSignal callback. Tests inject a stub
 * onSignal to capture the call without killing the test process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/observability/audit-log.js';
import { installSignalHandlers } from '../../src/hardening/signal-handler.js';

describe('installSignalHandlers (D-97 v5.0 production hardening 2nd evidence)', () => {
  let added: Array<[string, (...args: unknown[]) => void]>;
  let removed: Array<[string, (...args: unknown[]) => void]>;

  beforeEach(() => {
    added = [];
    removed = [];
    // Spy on process.on to capture listeners added by installSignalHandlers.
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

  it('registers handlers for SIGINT and SIGTERM (D-97)', () => {
    const cleanup = installSignalHandlers(new AuditLog());
    expect(added.map(([e]) => e)).toEqual(expect.arrayContaining(['SIGINT', 'SIGTERM']));
    expect(added).toHaveLength(2);
    cleanup();
  });

  it('cleanup function removes both listeners (D-97)', () => {
    const cleanup = installSignalHandlers(new AuditLog());
    cleanup();
    expect(removed.map(([e]) => e)).toEqual(expect.arrayContaining(['SIGINT', 'SIGTERM']));
    expect(removed).toHaveLength(2);
  });

  it('cleanup is idempotent (D-97)', () => {
    const cleanup = installSignalHandlers(new AuditLog());
    cleanup();
    cleanup();
    // Only one removeListener call per signal, not 2.
    expect(removed).toHaveLength(2);
  });

  it('on signal, handler records fatal-signal event into AuditLog + calls onSignal (D-97)', () => {
    const log = new AuditLog();
    const onSignal = vi.fn();
    installSignalHandlers(log, { onSignal });
    // Find the registered SIGINT handler and call it directly.
    const sigintEntry = added.find(([e]) => e === 'SIGINT');
    expect(sigintEntry).toBeDefined();
    const sigintHandler = sigintEntry![1];
    sigintHandler('SIGINT');
    // AuditLog has the fatal-signal event.
    const events = log.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'fatal-signal',
      payload: { signal: 'SIGINT' },
    });
    // onSignal was called.
    expect(onSignal).toHaveBeenCalledWith('SIGINT');
  });
});
