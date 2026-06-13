import { describe, expect, it } from 'vitest';
import {
  asTraceSpanId,
  TraceSpanStore,
} from '../../src/observability/trace-span.js';

describe('TraceSpanStore (D-137 v5.0 trace span seed)', () => {
  it('startSpan creates a span with correct fields and status=unset', () => {
    let t = 1000;
    const store = new TraceSpanStore(() => t++);
    const traceId = asTraceSpanId('trace-1');
    const span = store.startSpan({
      traceId,
      name: 'http-request',
      kind: 'server',
      attributes: { 'http.method': 'GET' },
    });
    expect(span.traceId).toBe(traceId);
    expect(span.name).toBe('http-request');
    expect(span.kind).toBe('server');
    expect(span.startTimeMs).toBe(1000);
    expect(span.status).toBe('unset');
    expect(span.endTimeMs).toBeUndefined();
    expect(span.attributes).toEqual({ 'http.method': 'GET' });
    expect(store.size()).toBe(1);
  });

  it('endSpan updates endTimeMs and status', () => {
    let t = 2000;
    const store = new TraceSpanStore(() => t++);
    const traceId = asTraceSpanId('trace-2');
    const span = store.startSpan({ traceId, name: 'db-query', kind: 'client' });
    const ended = store.endSpan(span.spanId, 'ok');
    expect(ended.endTimeMs).toBe(2001);
    expect(ended.status).toBe('ok');
  });

  it('getSpansByTrace returns all spans for a trace', () => {
    const store = new TraceSpanStore(() => 0);
    const traceId = asTraceSpanId('trace-3');
    const otherTraceId = asTraceSpanId('trace-other');
    store.startSpan({ traceId, name: 'a', kind: 'internal' });
    store.startSpan({ traceId, name: 'b', kind: 'internal' });
    store.startSpan({ traceId: otherTraceId, name: 'c', kind: 'internal' });
    const spans = store.getSpansByTrace(traceId);
    expect(spans).toHaveLength(2);
    expect(spans.map((s) => s.name)).toEqual(['a', 'b']);
  });

  it('getSpansByParent returns child spans correctly', () => {
    const store = new TraceSpanStore(() => 0);
    const traceId = asTraceSpanId('trace-4');
    const parent = store.startSpan({ traceId, name: 'parent', kind: 'internal' });
    store.startSpan({ traceId, name: 'child-a', kind: 'internal', parentSpanId: parent.spanId });
    store.startSpan({ traceId, name: 'child-b', kind: 'internal', parentSpanId: parent.spanId });
    store.startSpan({ traceId, name: 'root', kind: 'internal' });
    const children = store.getSpansByParent(parent.spanId);
    expect(children).toHaveLength(2);
    expect(children.map((s) => s.name)).toEqual(['child-a', 'child-b']);
  });
});
