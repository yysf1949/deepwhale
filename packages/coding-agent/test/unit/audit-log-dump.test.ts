/**
 * dumpAuditLog unit test -- D-102 v5.0 observability+auditability 2nd cycle.
 *
 * After D-87 (in-memory AuditLog seed), D-88 (tool-loop integration),
 * D-89 (PersistingAuditLog file-backed), and D-90 (readAuditLog query
 * side), D-102 adds the CLI dump function that ties the lifecycle
 * together: "give me a human-or-machine-readable render of a
 * persisted audit log".
 *
 * The function is async (because readAuditLog is async) but does
 * NOT write to stdout itself; it returns a Promise<AuditDumpResult>
 * containing the filtered events AND the rendered dump string.
 * Future CLI wrappers can stream the dump to process.stdout.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dumpAuditLog } from '../../src/observability/audit-log-dump.js';
import type { AuditEvent } from '../../src/observability/audit-log.js';

let auditPath: string;

beforeEach(async () => {
  auditPath = join(tmpdir(), `audit-dump-test-${Date.now()}-${Math.random()}.jsonl`);
  await fsp.writeFile(auditPath, '', 'utf8');
});

afterEach(async () => {
  try { await fsp.unlink(auditPath); } catch { /* ok */ }
});

async function appendEvent(event: AuditEvent): Promise<void> {
  await fsp.appendFile(auditPath, JSON.stringify(event) + '\n', 'utf8');
}

describe('dumpAuditLog (D-102 v5.0 observability+auditability 2nd cycle)', () => {
  it('returns isEmpty=true for a non-existent file (D-102)', async () => {
    const missingPath = join(tmpdir(), `audit-dump-missing-${Date.now()}-${Math.random()}.jsonl`);
    const result = await dumpAuditLog(missingPath);
    expect(result.isEmpty).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(result.totalEvents).toBe(0);
    expect(result.format).toBe('text');  // default
  });

  it('renders text format with header, per-event lines, and ISO timestamps (D-102)', async () => {
    await appendEvent({
      timestamp: 1718000000000,
      kind: 'tool-call',
      payload: { name: 'Read', args: { file: '/a.txt' } },
    });
    await appendEvent({
      timestamp: 1718000001000,
      kind: 'tool-result',
      payload: { name: 'Read', result: 'ok' },
    });
    const result = await dumpAuditLog(auditPath, { format: 'text' });
    expect(result.format).toBe('text');
    expect(result.totalEvents).toBe(2);
    expect(result.isEmpty).toBe(false);
    expect(result.dump).toContain('=== AuditLog dump ===');
    expect(result.dump).toContain('tool-call');
    expect(result.dump).toContain('tool-result');
    expect(result.dump).toContain('2024-06-10');  // ISO date for 1718000000000
    expect(result.dump).toContain('Read');
  });

  it('renders JSON format that round-trips through JSON.parse (D-102)', async () => {
    await appendEvent({
      timestamp: 1718000002000,
      kind: 'fatal-error',
      payload: { message: 'disk full' },
    });
    const result = await dumpAuditLog(auditPath, { format: 'json' });
    expect(result.format).toBe('json');
    const parsed = JSON.parse(result.dump) as { filePath: string; totalEvents: number; events: AuditEvent[] };
    expect(parsed.filePath).toBe(auditPath);
    expect(parsed.totalEvents).toBe(1);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]!.kind).toBe('fatal-error');
  });

  it('applies eventKinds and sinceTimestamp filters (D-102)', async () => {
    await appendEvent({ timestamp: 100, kind: 'tool-call', payload: { n: 1 } });
    await appendEvent({ timestamp: 200, kind: 'tool-result', payload: { n: 2 } });
    await appendEvent({ timestamp: 300, kind: 'tool-call', payload: { n: 3 } });
    await appendEvent({ timestamp: 400, kind: 'loop-end', payload: { n: 4 } });

    // Filter: only tool-call events with timestamp >= 250.
    const result = await dumpAuditLog(auditPath, {
      eventKinds: ['tool-call'],
      sinceTimestamp: 250,
    });
    expect(result.totalEvents).toBe(4);  // total read is 4
    expect(result.events).toHaveLength(1);  // only 1 matches the filter
    expect(result.events[0]!.payload).toEqual({ n: 3 });
    expect(result.dump).toContain('"n":3');
    expect(result.dump).not.toContain('"n":1');
  });
});
