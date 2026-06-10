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
 * Scope of THIS sub-sprint: minimal in-memory seed + 1 unit test.
 */

export interface AuditEvent {
  readonly kind: string;
  readonly timestamp: number;
  readonly payload?: Record<string, unknown>;
}

export type RecordAuditEventInput = {
  kind: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
};

export class AuditLog {
  private readonly events: AuditEvent[] = [];

  constructor(private readonly clock: () => number = Date.now) {}

  record(input: RecordAuditEventInput): AuditEvent {
    const event: AuditEvent =
      input.payload !== undefined
        ? { kind: input.kind, timestamp: input.timestamp ?? this.clock(), payload: input.payload }
        : { kind: input.kind, timestamp: input.timestamp ?? this.clock() };
    this.events.push(event);
    return event;
  }

  getEvents(): ReadonlyArray<AuditEvent> {
    // Return a frozen view; mutations should not be possible.
    return Object.freeze([...this.events]) as ReadonlyArray<AuditEvent>;
  }
}
