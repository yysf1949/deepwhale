/**
 * readAuditLog — D-90 v5.0 observability + auditability query side.
 *
 * Standalone async function that reads a JSONL audit log file and returns
 * the events. Mirrors the partial-line recovery logic in
 * PersistingAuditLog.load() (D-89). After D-90, the v5 audit log has a
 * complete lifecycle: write (D-87 in-memory, D-88 in-tool-loop, D-89 to-file)
 * AND read (D-90 from-file).
 *
 * Scope of THIS sub-sprint: 1 function + 3 unit tests (round-trip, ENOENT,
 * partial-line recovery). Future v5 sub-sprints may add a CLI surface
 * (e.g. `deepwhale audit tail`) or a streaming variant.
 */

import { promises as fsp } from 'node:fs';
import type { AuditEvent } from './audit-log.js';

export async function readAuditLog(filePath: string): Promise<AuditEvent[]> {
  let raw: string;
  try {
    raw = await fsp.readFile(filePath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const events: AuditEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      events.push(JSON.parse(trimmed) as AuditEvent);
    } catch {
      // Skip malformed lines (e.g. partial last line from a crash).
      continue;
    }
  }
  return events;
}
