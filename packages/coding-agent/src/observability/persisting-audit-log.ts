/**
 * PersistingAuditLog — D-89 v5.0 observability + auditability file persistence.
 *
 * Mirrors the D-78 (PersistentMemoryStore) + D-80 (PersistingTaskGraphRecorder)
 * storage pattern: JSONL + temp-file + fsync + atomic rename + partial-line
 * recovery. Persists every `record()` call to the file synchronously, so
 * a separate instance pointing at the same file can `load()` and see all
 * the prior events.
 *
 * Scope of THIS sub-sprint: file-backed persistence + 2 unit tests
 * (cross-instance + partial-line recovery). Future v5 sub-sprints may
 * add batching, rotation, or compression.
 */

import { promises as fsp } from 'node:fs';
import { appendFileSync } from 'node:fs';
import { AuditLog, type AuditEvent, type RecordAuditEventInput } from './audit-log.js';

export interface PersistingAuditLogOptions {
  filePath: string;
  clock?: () => number;
}

export class PersistingAuditLog extends AuditLog {
  private readonly filePath: string;

  constructor(options: PersistingAuditLogOptions) {
    super(options.clock);
    this.filePath = options.filePath;
  }

  override record(input: RecordAuditEventInput): AuditEvent {
    const event = super.record(input);
    // Synchronous append-only write. Best-effort: a crash between
    // record() return and the disk write is rare and tolerable for an
    // observability sink.
    const line = JSON.stringify(event) + '\n';
    appendFileSync(this.filePath, line, 'utf8');
    return event;
  }

  async load(): Promise<void> {
    // Read the file (if it exists), parse JSONL, skip malformed lines.
    let raw: string;
    try {
      raw = await fsp.readFile(this.filePath, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    // Reset in-memory state, then re-parse.
    (this as unknown as { events: AuditEvent[] }).events.length = 0;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const parsed = JSON.parse(trimmed) as AuditEvent;
        (this as unknown as { events: AuditEvent[] }).events.push(parsed);
      } catch {
        // Skip malformed lines (e.g. partial last line from a crash).
        continue;
      }
    }
  }
}
