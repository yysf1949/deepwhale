import { createCapabilityRegistry, type CapabilityRegistry } from '../runtime/capability-registry.js';

export interface McpToolManifest {
  name: string;
  inputSchema: Record<string, unknown>;
  description?: string;
}

export interface McpServerManifest {
  server: string;
  tools: ReadonlyArray<McpToolManifest>;
}

export function registerMcpManifest(
  registry: CapabilityRegistry,
  manifest: McpServerManifest,
): void {
  for (const tool of manifest.tools) {
    const cap: import('../runtime/capability-registry.js').Capability = {
      id: `mcp.${manifest.server}.${tool.name}`,
      source: 'mcp',
      riskLevel: 'medium',
      profiles: ['mcp', 'all'],
      sideEffects: ['network', 'execute'],
    };
    if (tool.description) cap.description = tool.description;
    registry.register(cap);
  }
}

export function createMcpRegistry(): { capabilityRegistry: CapabilityRegistry } {
  return { capabilityRegistry: createCapabilityRegistry() };
}
