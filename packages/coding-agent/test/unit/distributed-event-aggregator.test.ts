import { describe, expect, it, beforeEach } from 'vitest';

import {
  DistributedEventAggregator,
  asInstanceId,
} from '../../src/distributed/event-aggregator.js';

describe('DistributedEventAggregator (D-138 v6.0 distributed coordination seed)', () => {
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
  });

  function makeEvent(eventId: string, instanceId: string, kind: string, ts: number) {
    return {
      eventId,
      instanceId: asInstanceId(instanceId),
      kind,
      timestampMs: ts,
      payload: null,
    };
  }

  it('addEvent stores events per instance (D-138)', () => {
    const agg = new DistributedEventAggregator();
    const ev1 = makeEvent('e1', 'inst-A', 'task.start', now);
    const ev2 = makeEvent('e2', 'inst-B', 'task.start', now);

    agg.addEvent(ev1.instanceId, ev1);
    agg.addEvent(ev2.instanceId, ev2);

    expect(agg.size()).toBe(2);
    expect(agg.list()).toHaveLength(2);
  });

  it('merge deduplicates and sorts by timestamp (D-138)', () => {
    const agg = new DistributedEventAggregator();
    const ev1 = makeEvent('e1', 'inst-A', 'task.start', now + 20_000);
    const ev2 = makeEvent('e2', 'inst-A', 'task.end', now);
    const ev3 = makeEvent('e1', 'inst-A', 'task.start', now + 10_000);

    agg.addEvent(ev1.instanceId, ev1);
    agg.addEvent(ev2.instanceId, ev2);
    agg.addEvent(ev3.instanceId, ev3);

    const result = agg.merge();
    expect(result.merged).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged[0].eventId).toBe('e2');
    expect(result.merged[1].eventId).toBe('e1');
    expect(result.merged[1].timestampMs).toBe(now + 10_000);
  });

  it('merge identifies conflicts: same eventId from different instances (D-138)', () => {
    const agg = new DistributedEventAggregator();
    const ev1 = makeEvent('e1', 'inst-A', 'task.start', now);
    const ev2 = makeEvent('e1', 'inst-B', 'task.start', now + 1_000);

    agg.addEvent(ev1.instanceId, ev1);
    agg.addEvent(ev2.instanceId, ev2);

    const result = agg.merge();
    expect(result.merged).toHaveLength(0);
    expect(result.conflicts).toHaveLength(2);
    expect(result.summary).toContain('2 conflicts');
  });

  it('clear resets all state (D-138)', () => {
    const agg = new DistributedEventAggregator();
    agg.addEvent(asInstanceId('inst-A'), makeEvent('e1', 'inst-A', 'task.start', now));
    agg.addEvent(asInstanceId('inst-B'), makeEvent('e2', 'inst-B', 'task.end', now));
    expect(agg.size()).toBe(2);

    agg.clear();
    expect(agg.size()).toBe(0);
    expect(agg.list()).toHaveLength(0);
    expect(agg.merge().merged).toHaveLength(0);
  });
});
