/**
 * SubAgentId + SubAgentRegistry -- D-107 v6.0 multi-agent safety seed.
 *
 * Part 1 of 3 of the multi-agent safety seed. Foundational
 * types only: SubAgentId (branded string), SubAgent (interface),
 * SubAgentRegistry (in-memory class). D-108 will add
 * enforceSubAgentPolicy; D-109 will add rollbackSubAgent.
 *
 * Branded-type pattern mirrors ToolCapability (D-91) and ToolName
 * (@deepwhale/core). asSubAgentId does runtime validation
 * (rejects empty + oversize strings). isSubAgentId is a type
 * guard.
 *
 * The registry is single-instance, in-memory only. Distributed
 * sub-agent coordination (cross-instance shared registry) is
 * deferred to v6.0 Theme 3 (D-NN).
 */

import type { ToolCapability } from '../governance/tool-capabilities.js';
import type { ToolName } from '@deepwhale/core';

const MAX_ID_LEN = 256;

export type SubAgentId = string & { readonly __brand: 'SubAgentId' };

export function isSubAgentId(s: unknown): s is SubAgentId {
  return typeof s === 'string' && s.length > 0 && s.length <= MAX_ID_LEN;
}

export function asSubAgentId(s: string): SubAgentId {
  if (s.length === 0) {
    throw new Error('SubAgentId must be non-empty');
  }
  if (s.length > MAX_ID_LEN) {
    throw new Error(`SubAgentId must be <= ${MAX_ID_LEN} chars (got ${s.length})`);
  }
  return s as SubAgentId;
}

export interface SubAgent {
  readonly id: SubAgentId;
  readonly parentAgentId: string;
  readonly description: string;
  readonly capabilities: readonly ToolCapability[];
  readonly toolNames: readonly ToolName[];
  readonly createdAt: number;
}

export class SubAgentRegistry {
  private readonly map: Map<SubAgentId, SubAgent> = new Map();

  register(subAgent: SubAgent): SubAgent {
    if (this.map.has(subAgent.id)) {
      throw new Error(`SubAgent already registered: ${subAgent.id}`);
    }
    this.map.set(subAgent.id, subAgent);
    return subAgent;
  }

  unregister(id: SubAgentId): SubAgent | null {
    const existing = this.map.get(id);
    if (existing === undefined) {
      return null;
    }
    this.map.delete(id);
    return existing;
  }

  get(id: SubAgentId): SubAgent | undefined {
    return this.map.get(id);
  }

  list(): readonly SubAgent[] {
    return Array.from(this.map.values());
  }

  listByParent(parentAgentId: string): readonly SubAgent[] {
    return this.list().filter((s) => s.parentAgentId === parentAgentId);
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
