/**
 * AuditLog reader unit test — D-90 v5.0 observability + auditability query side.
 *
 * After D-87 (seed) + D-88 (integration) + D-89 (persistence), D-90 completes
 * the quartet with a query-side reader. The reader is a standalone function
 * (no instance required) that reads a JSONL file and returns the events.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { PersistingAuditLog } from '../../src/observability/persisting-audit-log.js';
import { readAuditLog } from '../../src/observability/audit-log-reader.js';

describe('readAuditLog (D-90 v5.0 observability+auditability query side)', () => {
  it('round-trips events written by PersistingAuditLog (D-90 file-backed reader)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-auditlog-read-'));
    const file = join(dir, 'audit.jsonl');
    try {
      // Write 2 events via PersistingAuditLog (D-89).
      const a = new PersistingAuditLog({ filePath: file });
      a.record({ kind: 'tool-call', payload: { name: 'echo' } });
      a.record({ kind: 'tool-result', payload: { name: 'echo', ok: true } });

      // Read them back via the D-90 reader.
      const events = await readAuditLog(file);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ kind: 'tool-call', payload: { name: 'echo' } });
      expect(events[1]).toMatchObject({ kind: 'tool-result', payload: { name: 'echo', ok: true } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty array for a non-existent file (D-90 reader ENOENT handling)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-auditlog-read-'));
    try {
      const events = await readAuditLog(join(dir, 'does-not-exist.jsonl'));
      expect(events).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips malformed lines (partial-line recovery, mirror D-89 pattern)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-auditlog-read-'));
    const file = join(dir, 'audit.jsonl');
    try {
      // 1 valid line + 1 truncated line.
      const partial = [
        JSON.stringify({ kind: 'tool-call', timestamp: 1000, payload: { name: 'echo' } }),
        '{"kind":"tool-result","timestamp":1001,"payload":{"name":"echo","ok',
      ].join('\n');
      writeFileSync(file, partial + '\n', 'utf8');

      const events = await readAuditLog(file);
      expect(events).toHaveLength(1);
      expect(events[0]?.kind).toBe('tool-call');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
