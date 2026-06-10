/**
 * dumpAuditLog -- D-102 v5.0 observability+auditability 2nd cycle.
 *
 * Reads a JSONL audit log file (via the D-90 readAuditLog query
 * side) and renders a human-or-machine-friendly dump. Together
 * with D-87 (in-memory seed), D-88 (tool-loop integration),
 * D-89 (file-backed persistence), and D-90 (read side), D-102
 * completes the v5 observability+auditability 2nd cycle: the
 * 5th and final piece of the audit-log lifecycle (read + render).
 *
 * The function does NOT write to stdout; it returns a
 * Promise<AuditDumpResult> containing both the filtered events
 * AND the rendered dump string. Future CLI wrappers can stream
 * the dump to process.stdout.
 *
 * Supports two formats:
 *   - 'text' (default): header + per-event lines with ISO timestamps
 *     and JSON-encoded payloads; suitable for human eyes / tail -f.
 *   - 'json': pretty-printed JSON object with metadata + events array;
 *     suitable for `jq` / downstream tooling.
 *
 * Optional filters: eventKinds (only include these kinds) and
 * sinceTimestamp (only include events >= this epoch ms). Filters
 * apply AFTER readAuditLog returns, so `totalEvents` reflects
 * raw count and `events.length` reflects post-filter count.
 *
 * The function is DEFENSIVE: missing file -> empty result
 * (relying on D-90's ENOENT handling); filter results in zero
 * events -> empty dump; no throws on empty input.
 */

import { readAuditLog } from './audit-log-reader.js';
import type { AuditEvent } from './audit-log.js';

export type AuditDumpFormat = 'text' | 'json';

export interface AuditDumpOptions {
  /** Optional: only include events with these kinds (string match on AuditEvent.kind). */
  readonly eventKinds?: readonly string[];
  /** Optional: only include events with timestamp >= this (epoch ms). */
  readonly sinceTimestamp?: number;
  /** Output format; default 'text'. */
  readonly format?: AuditDumpFormat;
}

export interface AuditDumpResult {
  readonly filePath: string;
  readonly format: AuditDumpFormat;
  readonly totalEvents: number;
  /** Events actually rendered (after filters applied). */
  readonly events: readonly AuditEvent[];
  /** The rendered output (text or JSON string). */
  readonly dump: string;
  /** Convenience: true iff `events` is empty. */
  readonly isEmpty: boolean;
}

function applyFilters(
  events: readonly AuditEvent[],
  options: AuditDumpOptions,
): AuditEvent[] {
  let filtered: AuditEvent[] = events.slice();
  if (options.eventKinds !== undefined) {
    // Dict-based dedup (avoids Set<string> for-of needing downlevelIteration).
    const allowed: Record<string, true> = {};
    for (const k of options.eventKinds) {
      allowed[k] = true;
    }
    filtered = filtered.filter((e) => allowed[e.kind] === true);
  }
  if (options.sinceTimestamp !== undefined) {
    const threshold = options.sinceTimestamp;
    filtered = filtered.filter((e) => e.timestamp >= threshold);
  }
  // Sort by timestamp ascending so text output is chronological.
  filtered.sort((a, b) => a.timestamp - b.timestamp);
  return filtered;
}

function renderText(filePath: string, events: readonly AuditEvent[]): string {
  const lines: string[] = [];
  lines.push('=== AuditLog dump ===');
  lines.push(`File: ${filePath}`);
  lines.push('Format: text');
  lines.push(`Total events: ${events.length}`);
  if (events.length === 0) {
    lines.push('');
    lines.push('(no events)');
    lines.push('=== end ===');
    return lines.join('\n');
  }
  const pad = String(events.length).length;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    const ts = new Date(ev.timestamp).toISOString();
    const idx = String(i + 1).padStart(pad, '0');
    const payload = JSON.stringify(ev.payload);
    lines.push(`[${idx}] ${ts}  ${ev.kind}  ${payload}`);
  }
  lines.push('=== end ===');
  return lines.join('\n');
}

function renderJson(
  filePath: string,
  totalEvents: number,
  events: readonly AuditEvent[],
): string {
  return JSON.stringify(
    { filePath, format: 'json', totalEvents, events },
    null,
    2,
  );
}

/**
 * Render a persisted audit log as text or JSON. Reads via D-90
 * readAuditLog and applies optional filters.
 */
export async function dumpAuditLog(
  filePath: string,
  options: AuditDumpOptions = {},
): Promise<AuditDumpResult> {
  const format: AuditDumpFormat = options.format ?? 'text';
  const raw = await readAuditLog(filePath);
  const totalEvents = raw.length;
  const events = applyFilters(raw, options);
  const dump =
    format === 'json'
      ? renderJson(filePath, totalEvents, events)
      : renderText(filePath, events);
  return {
    filePath,
    format,
    totalEvents,
    events,
    dump,
    isEmpty: events.length === 0,
  };
}
