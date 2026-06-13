/**
 * Explicit opt-in registry profiles.
 *
 * This module intentionally owns non-default tool imports. The default
 * registry module dynamically imports this file only when a caller explicitly
 * asks for an opt-in profile.
 */

import type { OptInToolRegistryProfile, ToolRegistry } from './registry.js';
import { WebSearchTool } from './web-search.js';
import { WebExtractTool } from './web-extract.js';
import { BrowserNavigateTool } from './browser-navigate.js';
import { DelegateTaskTool } from './delegate-task.js';
import { VisionAnalyzeTool } from './vision-analyze.js';
import { TextToSpeechTool } from './text-to-speech.js';
import { GitHubPrWorkflowTool } from './github-pr-workflow.js';
import { GitHubIssuesTool } from './github-issues.js';
import { GitHubCodeReviewTool } from './github-code-review.js';
import { kanbanOrchestrator } from './kanban-orchestrator.js';
import { CloudflarePagesDeployTool } from './cloudflare-pages-deploy.js';
import { webhookSubscriptions } from './webhook-subscriptions.js';
import { ArxivTool } from './arxiv.js';
import { BlogwatcherTool } from './blogwatcher.js';
import { llmWiki } from './llm-wiki.js';
import { PolymarketTool } from './polymarket.js';
import { NotionTool } from './notion.js';
import { LinearTool } from './linear.js';
import { AirtableTool } from './airtable.js';
import { OcrAndDocumentsTool } from './ocr-and-documents.js';
import { SpotifyTool } from './spotify.js';
import { YoutubeContentTool } from './youtube-content.js';
import { deepwhaleRoot } from '../util/deepwhale-paths.js';

export function registerOptInProfile(reg: ToolRegistry, profile: OptInToolRegistryProfile): void {
  if (profile === 'web') {
    registerWeb(reg);
  } else if (profile === 'engineering') {
    registerEngineering(reg);
  } else if (profile === 'research') {
    registerResearch(reg);
  } else if (profile === 'productivity') {
    registerProductivity(reg);
  } else if (profile === 'media') {
    registerMedia(reg);
  } else if (profile === 'all') {
    registerAllOptInTools(reg);
  } else {
    const exhaustive: never = profile;
    throw new Error(`unknown opt-in registry profile: ${String(exhaustive)}`);
  }
}

export function registerAllOptInTools(reg: ToolRegistry): void {
  registerWeb(reg);
  registerLegacyExpansionOnlyInAll(reg);
  registerEngineering(reg);
  registerResearch(reg);
  registerProductivity(reg);
  registerMedia(reg);
}

function registerWeb(reg: ToolRegistry): void {
  reg.register(new WebSearchTool());
  reg.register(new WebExtractTool());
  reg.register(new BrowserNavigateTool());
}

function registerLegacyExpansionOnlyInAll(reg: ToolRegistry): void {
  reg.register(new DelegateTaskTool());
  reg.register(new VisionAnalyzeTool());
  reg.register(new TextToSpeechTool());
}

function registerEngineering(reg: ToolRegistry): void {
  reg.register(new GitHubPrWorkflowTool());
  reg.register(new GitHubIssuesTool());
  reg.register(new GitHubCodeReviewTool());
  reg.register(kanbanOrchestrator);
  reg.register(new CloudflarePagesDeployTool());
  reg.register(webhookSubscriptions);
}

function registerResearch(reg: ToolRegistry): void {
  reg.register(new ArxivTool());
  reg.register(new BlogwatcherTool({ rootDir: deepwhaleRoot() }));
  reg.register(llmWiki);
  reg.register(new PolymarketTool());
}

function registerProductivity(reg: ToolRegistry): void {
  reg.register(new NotionTool());
  reg.register(new LinearTool());
  reg.register(new AirtableTool());
  reg.register(new OcrAndDocumentsTool());
}

function registerMedia(reg: ToolRegistry): void {
  reg.register(new SpotifyTool());
  reg.register(new YoutubeContentTool());
}
