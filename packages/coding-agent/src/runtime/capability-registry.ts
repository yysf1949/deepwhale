/**
 * CapabilityRegistry (D-33.2.3, 2026-06-09).
 *
 * Lightweight in-memory registry mirroring the Tool interface shape (id,
 * source, riskLevel, profiles) but used for capability-level checks
 * (e.g. "is the user allowed to use this capability via this profile").
 *
 * Two registries coexist: ToolRegistry (the 41 tools, unchanged) and
 * CapabilityRegistry (NEW). They can be wired together in a future sprint
 * (D-33.2.4 / Stage 3.4) without changing the Tool interface.
 */

import type { Capability, CapabilitySource, RiskLevel } from './capability.js';
import type { ToolRegistryProfile } from '../tools/registry.js';

export interface RegisterCapabilityInput {
  id: string;
  source: CapabilitySource;
  riskLevel: RiskLevel;
  profiles: ReadonlyArray<Capability['profiles'][number]>;
  description?: string;
  sideEffects?: ReadonlyArray<string>;
}

export class CapabilityRegistry {
  private capabilities = new Map<string, Capability>();

  register(input: RegisterCapabilityInput): void {
    if (this.capabilities.has(input.id)) {
      throw new Error(`duplicate capability id: ${input.id}`);
    }
    this.capabilities.set(input.id, Object.freeze({ ...input }));
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  list(filter?: { profiles?: ReadonlyArray<ToolRegistryProfile | 'mcp' | 'browser' | 'computer' | 'channel'> }): ReadonlyArray<Capability> {
    const all = Array.from(this.capabilities.values());
    if (!filter?.profiles) return all;
    const wanted = new Set<ToolRegistryProfile | 'mcp' | 'browser' | 'computer' | 'channel'>(filter.profiles);
    return all.filter((c) => c.profiles.some((p) => wanted.has(p as ToolRegistryProfile | 'mcp' | 'browser' | 'computer' | 'channel')));
  }

  size(): number {
    return this.capabilities.size;
  }
}

export function createCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry();
}

// Re-export types so callers (e.g. mcp/runtime.ts) can import Capability from one place.
export type { Capability, CapabilitySource, RiskLevel } from './capability.js';
