/**
 * AuditLog — D-87 v5.0 observability + auditability minimal seed.
 *
 * The v5.0 plan doc lists "observability and auditability" as one of the
 * 4 production-hardening themes. This module is the minimal seed: an
 * in-memory, append-only event log with deterministic timestamps (via
 * an injected clock) and a read-only view of recorded events.
 *
 * Future v5 sub-sprints will build on this seed:
 *   - File-backed persistence (mirrors the D-78 memory-store pattern).
 *   - Integration with runToolLoopWithReview (record tool-call + tool-result + goal + plan events).
 *   - CLI dump command (`deepwhale audit tail` etc.).
 *
 * D-129 v5.0 3rd-cycle depth extension: added optional `correlationId`
 * on every recorded event plus a `queryByCorrelationId` helper. This
 * lets a future CLI / TUI / REPL group events that belong to the same
 * logical operation (a single tool call, a single sub-agent run, a
 * single plan step) across multiple `record()` calls without changing
 * the existing payload shape.
 *
 * Scope of THIS sub-sprint: minimal in-memory seed + 1 unit test,
 * plus the D-129 correlation-id extension + 2 unit tests.
 */

export interface AuditEvent {
  readonly kind: string;
  readonly timestamp: number;
  readonly payload?: Record<string, unknown>;
  /**
   * Optional correlation id grouping events that belong to the same
   * logical operation. Two events with the same correlationId came
   * from the same call chain (e.g. a tool-call and its tool-result).
   * Undefined when no caller-supplied correlation applies.
   */
  readonly correlationId?: string;
}

export type RecordAuditEventInput = {
  kind: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
  /** Optional correlation id; see AuditEvent.correlationId. */
  correlationId?: string;
};

export class AuditLog {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly clock: () => number = Date.now) {}

  record(input: RecordAuditEventInput): AuditEvent {
    const timestamp = input.timestamp ?? this.clock();
    const event: AuditEvent = {
      kind: input.kind,
      timestamp,
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    };
    this.events.push(event);
    return event;
  }

  getEvents(): ReadonlyArray<AuditEvent> {
    // Return a frozen view; mutations should not be possible.
    return Object.freeze([...this.events]) as ReadonlyArray<AuditEvent>;
  }

  /**
   * Return all events whose `correlationId` exactly matches `id`,
   * in insertion order. Events without a correlationId are NOT
   * returned (an empty match). An unknown `id` returns an empty
   * array. The returned array is a fresh copy; mutating it does
   * NOT affect the underlying log.
   */
  queryByCorrelationId(id: string): ReadonlyArray<AuditEvent> {
    return this.events.filter((e) => e.correlationId === id);
  }
}
