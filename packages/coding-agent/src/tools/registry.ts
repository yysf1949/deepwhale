/**
 * Tool Registry.
 *
 * The synchronous default registry is intentionally narrow: coding tools plus
 * Code Intel essentials. Non-coding surfaces are explicit opt-in and are
 * loaded through `createRegistryForProfile()` so the default module graph does
 * not pull in Browser, productivity, media, research, or channel tools.
 */

import type { Tool, ToolName } from '../types.js';
import type { SandboxRunner } from '../sandbox/types.js';
import { LocalSandboxRunner } from '../sandbox/local-runner.js';
import { toolCapabilities, type ToolCapability } from '../governance/tool-capabilities.js';
import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { EditFileTool } from './edit-file.js';
import { BashTool } from './bash.js';
import { FindTool } from './find.js';
import { GrepTool } from './grep.js';
import { PatchTool } from './patch.js';
import { SearchFilesTool } from './search-files.js';
import { ExecuteCodeTool } from './execute-code.js';
import { TodoTool } from './todo.js';
import { PlanTool } from './plan.js';
import { ParseFileTool } from './parse-file.js';
import { GetSymbolsTool } from './get-symbols.js';
import { AnalyzeRepoTool } from './analyze-repo.js';
import { FindDefinitionTool } from './find-definition.js';
import { FindReferencesTool } from './find-references.js';
import { CallGraphTool } from './call-graph.js';
import { RenameSymbolTool } from './rename-symbol.js';
import { SmartSearchTool } from './smart-search.js';
import { BrowserActionTool } from './browser-action.js';

export class ToolRegistry {
  private tools = new Map<ToolName, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool name collision: '${tool.name}' already registered. ` +
          'Extension tool collision detected during startup.',
      );
    }
    this.tools.set(tool.name, tool);
  }

  get(name: ToolName | string): Tool | undefined {
    return this.tools.get(name as ToolName);
  }

  require(name: ToolName | string): Tool {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: '${name}'`);
    }
    return tool;
  }

  list(): ReadonlyArray<Tool> {
    return Array.from(this.tools.values());
  }

  /**
   * D-93 v5.0 plugin governance: return the tools that declare the given
   * capability. Composes the D-91 toolCapabilities() helper with list().
   * The helper returns [] for tools that don't declare capabilities
   * (backward-compatible), so the filter correctly excludes such tools.
   */
  listByCapability(cap: ToolCapability): Tool[] {
    return this.list().filter((t) => toolCapabilities(t).includes(cap));
  }

  size(): number {
    return this.tools.size;
  }
}

export const STABLE_REGISTRY_PROFILES = ['core', 'coding', 'code-intel', 'productivity', 'media', 'all'] as const;
export type StableToolRegistryProfile = (typeof STABLE_REGISTRY_PROFILES)[number];

export const LEGACY_OPT_IN_REGISTRY_PROFILES = ['web', 'engineering', 'research'] as const;
export type LegacyOptInToolRegistryProfile = (typeof LEGACY_OPT_IN_REGISTRY_PROFILES)[number];

export const TOOL_REGISTRY_PROFILES = [
  'default',
  ...STABLE_REGISTRY_PROFILES,
  ...LEGACY_OPT_IN_REGISTRY_PROFILES,
] as const;
export type ToolRegistryProfile = (typeof TOOL_REGISTRY_PROFILES)[number];
export type SynchronousToolRegistryProfile = 'default' | 'core' | 'coding' | 'code-intel';
export type OptInToolRegistryProfile = Exclude<ToolRegistryProfile, SynchronousToolRegistryProfile>;

export interface RegistryProfilePolicy {
  readonly profile: ToolRegistryProfile;
  readonly kind: 'default' | 'stable' | 'legacy-opt-in';
  readonly defaultEnabled: boolean;
  readonly explicitOptInRequired: boolean;
}

export function isToolRegistryProfile(value: unknown): value is ToolRegistryProfile {
  return typeof value === 'string' && (TOOL_REGISTRY_PROFILES as readonly string[]).includes(value);
}

export function registryProfilePolicy(profile: ToolRegistryProfile): RegistryProfilePolicy {
  if (profile === 'default') {
    return { profile, kind: 'default', defaultEnabled: true, explicitOptInRequired: false };
  }
  if ((LEGACY_OPT_IN_REGISTRY_PROFILES as readonly string[]).includes(profile)) {
    return { profile, kind: 'legacy-opt-in', defaultEnabled: false, explicitOptInRequired: true };
  }
  return { profile, kind: 'stable', defaultEnabled: false, explicitOptInRequired: true };
}

export interface CreateDefaultRegistryOptions {
  /** Inject BashTool's sandbox runner. Defaults to LocalSandboxRunner. */
  readonly sandboxRunner?: SandboxRunner;
  /** Synchronous profile. Opt-in profiles require createRegistryForProfile(). */
  readonly profile?: ToolRegistryProfile;
}

export type CreateRegistryForProfileOptions = CreateDefaultRegistryOptions;

/**
 * Synchronous registry factory for the stabilization surface.
 *
 * Use `createRegistryForProfile()` for explicit opt-in profiles. Keeping this
 * factory narrow prevents default callers from loading non-coding tool modules.
 */
export function createDefaultRegistry(options: CreateDefaultRegistryOptions = {}): ToolRegistry {
  const profile = options.profile ?? 'default';
  if (!isSynchronousRegistryProfile(profile)) {
    throw new Error(
      `profile '${profile}' is explicit opt-in; use createRegistryForProfile({ profile: '${profile}' }) instead`,
    );
  }

  const reg = new ToolRegistry();
  const runner = options.sandboxRunner ?? new LocalSandboxRunner();

  if (profile === 'default') {
    registerCodingTools(reg, runner);
    registerCodeIntelTools(reg);
  } else if (profile === 'core') {
    registerCoreTools(reg, runner);
  } else if (profile === 'coding') {
    registerCodingTools(reg, runner);
  } else {
    registerCodeIntelTools(reg);
  }

  return reg;
}

/**
 * Explicit opt-in registry factory.
 *
 * This async boundary is intentional: non-default profile modules are loaded
 * only after a caller explicitly requests them.
 */
export async function createRegistryForProfile(
  options: CreateRegistryForProfileOptions = {},
): Promise<ToolRegistry> {
  const profile = options.profile ?? 'default';
  if (isSynchronousRegistryProfile(profile)) {
    return createDefaultRegistry(options);
  }

  const reg = new ToolRegistry();
  const runner = options.sandboxRunner ?? new LocalSandboxRunner();
  const optIn = await import('./registry-opt-in.js');

  if (profile === 'all') {
    registerCodingTools(reg, runner);
    optIn.registerAllOptInTools(reg);
    registerCodeIntelTools(reg);
  } else {
    optIn.registerOptInProfile(reg, profile);
  }

  return reg;
}

export function isSynchronousRegistryProfile(profile: ToolRegistryProfile): profile is SynchronousToolRegistryProfile {
  return profile === 'default' || profile === 'core' || profile === 'coding' || profile === 'code-intel';
}

function registerCoreTools(reg: ToolRegistry, runner: SandboxRunner): void {
  reg.register(new ReadFileTool());
  reg.register(new WriteFileTool());
  reg.register(new EditFileTool());
  reg.register(new BashTool(runner));
  reg.register(new FindTool());
  reg.register(new GrepTool());
}

function registerCodingTools(reg: ToolRegistry, runner: SandboxRunner): void {
  registerCoreTools(reg, runner);
  reg.register(new PatchTool());
  reg.register(new SearchFilesTool());
  reg.register(new ExecuteCodeTool());
  reg.register(new TodoTool());
  reg.register(new PlanTool());
  reg.register(new BrowserActionTool());
}

function registerCodeIntelTools(reg: ToolRegistry): void {
  reg.register(new ParseFileTool());
  reg.register(new GetSymbolsTool());
  reg.register(new AnalyzeRepoTool());
  reg.register(new FindDefinitionTool());
  reg.register(new FindReferencesTool());
  reg.register(new CallGraphTool());
  reg.register(new RenameSymbolTool());
  reg.register(new SmartSearchTool());
}
