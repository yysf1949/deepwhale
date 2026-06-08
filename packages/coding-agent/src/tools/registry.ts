/**
 * Tool Registry — 33 工具的注册中心 (D-31.4.4, 2026-06-08).
 *
 * Sprint 0.2 范围：
 * - register / get / list 基础 API
 * - 默认注册全部 6 工具
 * - name 重名启动时检测（pi #5316 教训）
 *
 * Sprint 1+ 扩展：
 * - MCP / Plugin / Skill 注册入口（v1.5/v2.0）
 * - 风险评级聚合（StormBreaker 用）
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

export type ToolRegistryProfile =
  | 'default'
  | 'core'
  | 'coding'
  | 'code-intel'
  | 'web'
  | 'engineering'
  | 'research'
  | 'productivity'
  | 'media'
  | 'all';

/** Sprint 1c-revive-3-D-12 review P1 修复: 显式注入 sandboxRunner. */
export interface CreateDefaultRegistryOptions {
  /** 注入 BashTool 的 SandboxRunner. 不传 = LocalSandboxRunner (v1.0 行为). */
  readonly sandboxRunner?: SandboxRunner;
  /** Tool exposure profile. Default intentionally exposes only coding + code-intel essentials. */
  readonly profile?: ToolRegistryProfile;
}

/**
 * 默认 6 工具的 registry 工厂
 *
 * Sprint 1c-revive-3-D-12 review P1 修复 (2026-06-05): 加 `sandboxRunner` 显式参数.
 * 之前 `new BashTool()` 走默认 LocalSandboxRunner, `DEEPWHALE_SANDBOX=docker` 解析
 * 出的 DockerSandboxRunner 不会进 tool loop. 修法: mode 调用点从 env 解析 runner 后
 * 显式传入, 工具注册表跟 env 状态对齐.
 */
export function createDefaultRegistry(options: CreateDefaultRegistryOptions = {}): ToolRegistry {
  const reg = new ToolRegistry();
  const runner = options.sandboxRunner ?? new LocalSandboxRunner();
  const profile = options.profile ?? 'default';

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
    reg.register(new BlogwatcherTool({ rootDir: process.env.HOME || process.env.USERPROFILE || '.' }));
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
