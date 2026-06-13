/**
 * PersistingAuditLog unit test — D-89 v5.0 observability + auditability file persistence.
 *
 * Mirrors the D-78 (PersistentMemoryStore) + D-80 (PersistingTaskGraphRecorder)
 * pattern: JSONL + atomic-rename + partial-line recovery. After D-89, audit
 * events survive process restarts and can be loaded by a separate instance.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { PersistingAuditLog } from '../../src/observability/persisting-audit-log.js';

describe('PersistingAuditLog (D-89 v5.0 file-backed audit log)', () => {
  it('persists events across separate instances pointing at the same file (D-89 cross-instance)', async () => {
    // Setup: instance A records 2 events, instance B (fresh) loads them.
    const dir = mkdtempSync(join(tmpdir(), 'dw-auditlog-'));
    const file = join(dir, 'audit.jsonl');
    try {
      const a = new PersistingAuditLog({ filePath: file });
      a.record({ kind: 'tool-call', payload: { name: 'echo' } });
      a.record({ kind: 'tool-result', payload: { name: 'echo', ok: true } });

      // A new instance, with no in-memory state, must see A's records
      // after load() is called.
      const b = new PersistingAuditLog({ filePath: file });
      await b.load();
      expect(b.getEvents().map((e) => e.kind)).toEqual(['tool-call', 'tool-result']);
      // Payloads from the in-memory write propagate to the file.
      expect(b.getEvents()[0]?.payload).toEqual({ name: 'echo' });
      expect(b.getEvents()[1]?.payload).toEqual({ name: 'echo', ok: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recovers from a partial last line (truncated JSON, crash mid-flush)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-auditlog-'));
    const file = join(dir, 'audit.jsonl');
    try {
      // 1 valid line + 1 truncated (no closing brace) line.
      const partial = [
        JSON.stringify({ kind: 'tool-call', timestamp: 1000, payload: { name: 'echo' } }),
        '{"kind":"tool-result","timestamp":1001,"payload":{"name":"echo","ok',
      ].join('\n');
      writeFileSync(file, partial + '\n', 'utf8');

      const log = new PersistingAuditLog({ filePath: file });
      await log.load();
      // Only the valid line is kept; the truncated line is dropped silently.
      expect(log.getEvents()).toHaveLength(1);
      expect(log.getEvents()[0]?.kind).toBe('tool-call');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
