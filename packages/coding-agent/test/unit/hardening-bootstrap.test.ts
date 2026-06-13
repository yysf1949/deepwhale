import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/observability/audit-log.js';
import {
  bootstrapHardening,
  _resetHardeningStateForTesting,
} from '../../src/hardening/bootstrap.js';

describe('bootstrapHardening (D-139 v5 production hardening bootstrap)', () => {
  let added: Array<[string, (...args: unknown[]) => void]>;

  beforeEach(() => {
    _resetHardeningStateForTesting();
    added = [];
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      added.push([event as string, listener as (...args: unknown[]) => void]);
      return process;
    });
    vi.spyOn(process, 'removeListener').mockImplementation(() => process);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs all handlers and returns true for all flags', () => {
    const result = bootstrapHardening({ auditLog: new AuditLog() });
    expect(result.signalHandlersInstalled).toBe(true);
    expect(result.uncaughtHandlersInstalled).toBe(true);
    expect(result.shutdownRegistered).toBe(true);
  });

  it('installs handlers without options', () => {
    const result = bootstrapHardening();
    expect(result.signalHandlersInstalled).toBe(true);
    expect(result.uncaughtHandlersInstalled).toBe(true);
    expect(result.shutdownRegistered).toBe(true);
  });

  it('registers beforeExit listener for graceful shutdown', () => {
    bootstrapHardening({ auditLog: new AuditLog() });
    const beforeExitEntry = added.find(([e]) => e === 'beforeExit');
    expect(beforeExitEntry).toBeDefined();
  });

  it('is idempotent — calling twice does not double-install', () => {
    const log = new AuditLog();
    bootstrapHardening({ auditLog: log });
    const countAfterFirst = added.length;
    bootstrapHardening({ auditLog: log });
    expect(added.length).toBe(countAfterFirst);
  });
});
