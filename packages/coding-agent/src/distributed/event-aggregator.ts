export type InstanceId = string & { readonly __brand: 'InstanceId' };

export function asInstanceId(value: string): InstanceId {
  if (value.length === 0) {
    throw new Error('InstanceId must be non-empty');
  }
  return value as InstanceId;
}

export function isInstanceId(value: unknown): value is InstanceId {
  return typeof value === 'string' && value.length > 0;
}

export interface AggregatedEvent {
  readonly eventId: string;
  readonly instanceId: InstanceId;
  readonly kind: string;
  readonly timestampMs: number;
  readonly payload: unknown;
}

export interface MergeResult {
  readonly merged: AggregatedEvent[];
  readonly conflicts: AggregatedEvent[];
  readonly summary: string;
}

export class DistributedEventAggregator {
  private readonly events: AggregatedEvent[] = [];

  addEvent(instanceId: InstanceId, event: AggregatedEvent): void {
    this.events.push({ ...event, instanceId });
  }

  merge(): MergeResult {
    const byEventId = new Map<string, AggregatedEvent[]>();
    for (const event of this.events) {
      const existing = byEventId.get(event.eventId);
      if (existing === undefined) {
        byEventId.set(event.eventId, [event]);
      } else {
        existing.push(event);
      }
    }

    const merged: AggregatedEvent[] = [];
    const conflicts: AggregatedEvent[] = [];

    for (const group of byEventId.values()) {
      if (group.length === 1) {
        const first = group[0];
        if (first !== undefined) merged.push(first);
      } else {
        const uniqueInstances = new Set(group.map((e) => e.instanceId));
        if (uniqueInstances.size > 1) {
          conflicts.push(...group);
        } else {
          const last = group[group.length - 1];
          if (last !== undefined) merged.push(last);
        }
      }
    }

    merged.sort((a, b) => a.timestampMs - b.timestampMs);

    return {
      merged,
      conflicts,
      summary: `merged ${merged.length} events, ${conflicts.length} conflicts`,
    };
  }

  list(): readonly AggregatedEvent[] {
    return Array.from(this.events);
  }

  size(): number {
    return this.events.length;
  }

  clear(): void {
    this.events.length = 0;
  }
}
