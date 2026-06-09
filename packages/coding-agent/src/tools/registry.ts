/**
 * Tool Registry.
 *
 * The default profile is intentionally narrow: coding tools plus Code Intel
 * essentials. Non-coding surfaces remain explicit opt-in profiles.
 */

import type { Tool, ToolName } from '../types.js';
import type { SandboxRunner } from '../sandbox/types.js';
import { ReadFileTool } from './read-file.js';
import { WriteFileTool } from './write-file.js';
import { EditFileTool } from './edit-file.js';
import { BashTool } from './bash.js';
import { FindTool } from './find.js';
import { GrepTool } from './grep.js';
import { LocalSandboxRunner } from '../sandbox/local-runner.js';
import { WebSearchTool } from './web-search.js'; // D-30.1γ.4 (2026-06-07): web tool
import { WebExtractTool } from './web-extract.js'; // D-30.1γ.4
import { BrowserNavigateTool } from './browser-navigate.js'; // D-30.1γ.4
import { PatchTool } from './patch.js'; // D-30.2.3 (2026-06-07): find/replace unique string
import { SearchFilesTool } from './search-files.js'; // D-30.2.4: ripgrep 搜索
import { ExecuteCodeTool } from './execute-code.js'; // D-30.2.5: python/node sandbox
import { TodoTool } from './todo.js'; // D-30.2.6: todo store
import { PlanTool } from './plan.js'; // D-30.2.7: plan mode
import { DelegateTaskTool } from './delegate-task.js'; // D-30.3.1: subagent 并行 max 5
import { VisionAnalyzeTool } from './vision-analyze.js'; // D-30.4.1: 本地 base64 + URL
import { TextToSpeechTool } from './text-to-speech.js'; // D-30.4.2: text stub -> ~/.deepwhale/tts/
import { GitHubPrWorkflowTool } from './github-pr-workflow.js'; // D-31.1.1
import { GitHubIssuesTool } from './github-issues.js'; // D-31.1.2
import { GitHubCodeReviewTool } from './github-code-review.js'; // D-31.1.3
import { kanbanOrchestrator } from './kanban-orchestrator.js'; // D-31.1.4
import { CloudflarePagesDeployTool } from './cloudflare-pages-deploy.js'; // D-31.1.5
import { webhookSubscriptions } from './webhook-subscriptions.js'; // D-31.1.6
import { ArxivTool } from './arxiv.js'; // D-31.2.1 (2026-06-08): arxiv paper search
import { BlogwatcherTool } from './blogwatcher.js'; // D-31.2.2: RSS/Atom 订阅
import { llmWiki } from './llm-wiki.js'; // D-31.2.3: Karpathy LLM Wiki
import { PolymarketTool } from './polymarket.js'; // D-31.2.4: prediction market
import { NotionTool } from './notion.js'; // D-31.3.1 (2026-06-08): notion REST
import { LinearTool } from './linear.js'; // D-31.3.2: linear GraphQL
import { AirtableTool } from './airtable.js'; // D-31.3.3: airtable REST
import { OcrAndDocumentsTool } from './ocr-and-documents.js'; // D-31.3.4: tesseract + pdf-parse
import { SpotifyTool } from './spotify.js'; // D-31.4.1 (2026-06-08): spotify Web API
import { YoutubeContentTool } from './youtube-content.js'; // D-31.4.2: youtube data + transcript
import { ParseFileTool } from './parse-file.js'; // D-32.1.1 (2026-06-08): parse file via web-tree-sitter
import { GetSymbolsTool } from './get-symbols.js'; // D-32.1.2: extract symbols from file
import { AnalyzeRepoTool } from './analyze-repo.js'; // D-32.1.3: walk repo + lang stats
import { FindDefinitionTool } from './find-definition.js'; // D-32.1.4: single-file symbol search
import { FindReferencesTool } from './find-references.js'; // D-32.2.2: cross-file find references
import { CallGraphTool } from './call-graph.js'; // D-32.2.3: cross-file call chain
import { RenameSymbolTool } from './rename-symbol.js'; // D-32.2.4: cross-file rename (word-boundary)
import { SmartSearchTool } from './smart-search.js'; // D-32.3.1: symbol-aware + gh CLI remote search
import { deepwhaleRoot } from '../util/deepwhale-paths.js';

export class ToolRegistry {
  private tools = new Map<ToolName, Tool>();

  /** 注册工具，重名抛错（pi #5316 教训） */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(
        `Tool name collision: '${tool.name}' already registered. ` +
          `Extension tool 重名启动时检测（pi #5316 教训）`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  get(name: ToolName | string): Tool | undefined {
    return this.tools.get(name as ToolName);
  }

  /** 严格获取 — 不存在抛错（v1.0 tool 路由用） */
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
  /** Tool exposure profile. Default intentionally exposes only coding + code-intel essentials. */
  readonly profile?: ToolRegistryProfile;
}

/**
 * Registry factory.
 *
 * The default profile is the stabilization surface. Other profiles require
 * explicit opt-in from task config or caller code. `sandboxRunner` remains
 * injectable so mode layers can pass the runner resolved from environment.
 */
export function createDefaultRegistry(options: CreateDefaultRegistryOptions = {}): ToolRegistry {
  const reg = new ToolRegistry();
  const runner = options.sandboxRunner ?? new LocalSandboxRunner();
  const profile = options.profile ?? 'default';
  // D-33.2.3 (2026-06-09): tool-to-capability wiring is a future Stage 2.4 / Stage 3.4 task.
  // This note marks the boundary: each tool instance can later be mirrored
  // as a Capability in @deepwhale/coding-agent/runtime/capability-registry.ts.
  // We intentionally do NOT mutate behavior here.

  const registerCore = (): void => {
    reg.register(new ReadFileTool());
    reg.register(new WriteFileTool());
    reg.register(new EditFileTool());
    reg.register(new BashTool(runner));
    reg.register(new FindTool());
    reg.register(new GrepTool());
  };

  const registerCoding = (): void => {
    registerCore();
    reg.register(new PatchTool());
    reg.register(new SearchFilesTool());
    reg.register(new ExecuteCodeTool());
    reg.register(new TodoTool());
    reg.register(new PlanTool());
  };

  const registerWeb = (): void => {
    reg.register(new WebSearchTool());
    reg.register(new WebExtractTool());
    reg.register(new BrowserNavigateTool());
  };

  const registerEngineering = (): void => {
    reg.register(new GitHubPrWorkflowTool());
    reg.register(new GitHubIssuesTool());
    reg.register(new GitHubCodeReviewTool());
    reg.register(kanbanOrchestrator);
    reg.register(new CloudflarePagesDeployTool());
    reg.register(webhookSubscriptions);
  };

  const registerResearch = (): void => {
    reg.register(new ArxivTool());
    reg.register(new BlogwatcherTool({ rootDir: deepwhaleRoot() }));
    reg.register(llmWiki);
    reg.register(new PolymarketTool());
  };

  const registerProductivity = (): void => {
    reg.register(new NotionTool());
    reg.register(new LinearTool());
    reg.register(new AirtableTool());
    reg.register(new OcrAndDocumentsTool());
  };

  const registerMedia = (): void => {
    reg.register(new SpotifyTool());
    reg.register(new YoutubeContentTool());
  };

  const registerCodeIntel = (): void => {
    reg.register(new ParseFileTool());
    reg.register(new GetSymbolsTool());
    reg.register(new AnalyzeRepoTool());
    reg.register(new FindDefinitionTool());
    reg.register(new FindReferencesTool());
    reg.register(new CallGraphTool());
    reg.register(new RenameSymbolTool());
    reg.register(new SmartSearchTool());
  };

  const registerLegacyExpansionOnlyInAll = (): void => {
    reg.register(new DelegateTaskTool());
    reg.register(new VisionAnalyzeTool());
    reg.register(new TextToSpeechTool());
  };

  // `web`, `engineering`, and `research` are legacy opt-in profiles retained
  // for compatibility. They are not part of the stabilization default surface.
  // Browser runtime profiles are separate capability profiles, not
  // ToolRegistryProfile values.
  if (profile === 'default') {
    registerCoding();
    registerCodeIntel();
  } else if (profile === 'core') {
    registerCore();
  } else if (profile === 'coding') {
    registerCoding();
  } else if (profile === 'code-intel') {
    registerCodeIntel();
  } else if (profile === 'web') {
    registerWeb();
  } else if (profile === 'engineering') {
    registerEngineering();
  } else if (profile === 'research') {
    registerResearch();
  } else if (profile === 'productivity') {
    registerProductivity();
  } else if (profile === 'media') {
    registerMedia();
  } else {
    registerCoding();
    registerWeb();
    registerLegacyExpansionOnlyInAll();
    registerEngineering();
    registerResearch();
    registerProductivity();
    registerMedia();
    registerCodeIntel();
  }

  return reg;
}
