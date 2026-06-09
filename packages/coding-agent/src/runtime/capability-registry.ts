export type CapabilitySource = 'core' | 'tool' | 'mcp' | 'extension';
export type CapabilityRisk = 'low' | 'medium' | 'high';

export interface Capability {
  id: string;
  source: CapabilitySource;
  riskLevel: CapabilityRisk;
  profiles: ReadonlyArray<string>;
  description?: string;
  sideEffects?: ReadonlyArray<string>;
}

export interface CapabilityRegistry {
  register(capability: Capability): void;
  list(filter?: { profiles?: ReadonlyArray<string> }): Capability[];
}

export function createCapabilityRegistry(): CapabilityRegistry {
  const items: Capability[] = [];

  return {
    register(capability) {
      items.push({ ...capability });
    },
    list(filter) {
      if (!filter?.profiles || filter.profiles.length === 0) return [...items];
      const wanted = new Set(filter.profiles);
      return items.filter((c) => c.profiles.some((p) => wanted.has(p)));
    },
  };
}
