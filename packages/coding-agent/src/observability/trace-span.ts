const MAX_ID_LEN = 256;

export type TraceSpanId = string & { readonly __brand: 'TraceSpanId' };

export function isTraceSpanId(s: unknown): s is TraceSpanId {
  return typeof s === 'string' && s.length > 0 && s.length <= MAX_ID_LEN;
}

export function asTraceSpanId(s: string): TraceSpanId {
  if (s.length === 0) {
    throw new Error('TraceSpanId must be non-empty');
  }
  if (s.length > MAX_ID_LEN) {
    throw new Error(`TraceSpanId must be <= ${MAX_ID_LEN} chars (got ${s.length})`);
  }
  return s as TraceSpanId;
}

export type TraceSpanKind = 'internal' | 'producer' | 'consumer' | 'client' | 'server';

export type TraceSpanStatus = 'ok' | 'error' | 'unset';

export interface TraceSpan {
  readonly spanId: TraceSpanId;
  readonly traceId: TraceSpanId;
  readonly parentSpanId?: TraceSpanId;
  readonly name: string;
  readonly kind: TraceSpanKind;
  readonly startTimeMs: number;
  readonly endTimeMs?: number;
  readonly status: TraceSpanStatus;
  readonly attributes?: Record<string, string | number | boolean>;
}

export class TraceSpanStore {
  private readonly map: Map<TraceSpanId, TraceSpan> = new Map();

  constructor(private readonly clock: () => number = Date.now) {}

  startSpan(input: {
    traceId: TraceSpanId;
    parentSpanId?: TraceSpanId;
    name: string;
    kind: TraceSpanKind;
    attributes?: Record<string, string | number | boolean>;
  }): TraceSpan {
    const now = this.clock();
    const spanId = asTraceSpanId(`span-${this.map.size}-${now}`);
    const span: TraceSpan = {
      spanId,
      traceId: input.traceId,
      ...(input.parentSpanId !== undefined ? { parentSpanId: input.parentSpanId } : {}),
      name: input.name,
      kind: input.kind,
      startTimeMs: now,
      status: 'unset',
      ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
    };
    this.map.set(spanId, span);
    return span;
  }

  endSpan(spanId: TraceSpanId, status: TraceSpanStatus = 'ok'): TraceSpan {
    const existing = this.map.get(spanId);
    if (existing === undefined) {
      throw new Error(`TraceSpan not found: ${spanId}`);
    }
    const ended: TraceSpan = {
      ...existing,
      endTimeMs: this.clock(),
      status,
    };
    this.map.set(spanId, ended);
    return ended;
  }

  getSpan(spanId: TraceSpanId): TraceSpan | undefined {
    return this.map.get(spanId);
  }

  getSpansByTrace(traceId: TraceSpanId): readonly TraceSpan[] {
    return Array.from(this.map.values()).filter((s) => s.traceId === traceId);
  }

  getSpansByParent(parentSpanId: TraceSpanId): readonly TraceSpan[] {
    return Array.from(this.map.values()).filter((s) => s.parentSpanId === parentSpanId);
  }

  list(): readonly TraceSpan[] {
    return Array.from(this.map.values());
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
