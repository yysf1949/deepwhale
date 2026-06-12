/**
 * smart_search 工具 — 3 action (D-32.3.1, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel 智能 search (symbol-aware) + 显式 gh CLI 远端
 *   search (公开 repo code search). 3 action:
 *     local  — 只走 code-intel findReferences (symbol-like query)
 *     remote — 只走 gh search code (公开 GitHub code search)
 *     all    — local aggregate search only; never invokes gh
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (read-only).
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { buildSymbolGraph, createSemanticIndex, findReferences } from '@deepwhale/code-intel';
import type { SymbolGraph } from '@deepwhale/code-intel';
import type { ToolCapability } from '../governance/tool-capabilities.js';

const execFile = promisify(execFileCb);
const REMOTE_SEARCH_TIMEOUT_MS = 2_000;

export class SmartSearchTool implements Tool {
  readonly name = 'smart_search' as ToolName;
  readonly description = 'Heuristic code search with symbol-aware local matches. Remote GitHub search is explicit opt-in via action=remote; local/all results are not IDE-grade/type-aware. Low risk (read-only).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = ['file-read'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'search action', enum: ['local', 'remote', 'all'] },
      query: { type: 'string', description: 'search query (symbol name or free text)' },
      path: { type: 'string', description: 'repo root path (default: current working directory)' },
      maxResults: { type: 'number', description: 'max results to return (default 20, max 50)' },
    },
    required: ['action', 'query'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const query = input['query'];
    if (typeof query !== 'string' || query.length === 0) {
      return { success: false, content: '', error: 'invalid-input: query required' };
    }
    const maxResults = typeof input['maxResults'] === 'number' ? Math.min(input['maxResults'], 50) : 20;
    const repoPath = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    try {
      const results: SearchResult[] = [];
      if (action === 'local' || action === 'all') {
        const local = await localSearch(query, repoPath, maxResults);
        results.push(...local);
      }
      const remoteEnabled = action === 'remote';
      if (remoteEnabled) {
        const remote = await remoteSearch(query, maxResults);
        results.push(...remote);
      }
      const content = formatResults(results, query, action as string, remoteEnabled);
      return {
        success: true,
        content,
        meta: {
          query,
          action,
          count: results.length,
          localCount: results.filter((r) => r.source === 'local').length,
          remoteCount: results.filter((r) => r.source === 'remote').length,
          semanticCount: results.filter((r) => r.matchMode === 'semantic_fallback').length,
          matchModes: [...new Set(results.map((r) => r.matchMode))],
          remoteEnabled,
          heuristic: true,
        },
      };
    } catch (e) {
      return { success: false, content: '', error: `smart_search error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

interface SearchResult {
  source: 'local' | 'remote';
  file: string;
  line: number;
  col: number;
  snippet: string;
  kind?: string;
  score: number;
  matchMode: 'symbol_reference' | 'semantic_fallback' | 'remote';
  reason?: string;
}

async function localSearch(query: string, repoPath: string, maxResults: number): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  try {
    const graph = await buildSymbolGraph(repoPath);
    const refs = findReferences(graph, query);
    for (const r of refs) {
      out.push({
        source: 'local',
        file: r.file,
        line: r.line,
        col: r.col,
        snippet: `${r.kind}\t${r.file}:${r.line}:${r.col}${r.scope ? ` (scope=${r.scope})` : ''}`,
        kind: r.kind,
        score: 100, // exact symbol match, high score
        matchMode: 'symbol_reference',
      });
    }
    out.push(...await semanticFallbackSearch(graph, query, maxResults));
  } catch {
    // ignore — local search is best-effort
  }
  return dedupeAndRank(out).slice(0, maxResults);
}

async function remoteSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  try {
    const { stdout } = await execFile('gh', [
      'search', 'code', query,
      '--limit', String(maxResults),
      '--json', 'path,repository,textMatches',
    ], { timeout: REMOTE_SEARCH_TIMEOUT_MS });
    const parsed = JSON.parse(stdout) as Array<{ path: string; repository: { nameWithOwner: string }; textMatches?: Array<{ fragment: string; matches: Array<{ line: number; col: number }> }> }>;
    for (const item of parsed) {
      const firstMatch = item.textMatches?.[0];
      const line = firstMatch?.matches?.[0]?.line ?? 1;
      const col = firstMatch?.matches?.[0]?.col ?? 1;
      out.push({
        source: 'remote',
        file: `${item.repository.nameWithOwner}/${item.path}`,
        line,
        col,
        snippet: firstMatch?.fragment?.slice(0, 120) ?? '(no fragment)',
        score: 50, // remote match, medium score
        matchMode: 'remote',
      });
    }
  } catch {
    // gh not available or auth missing — return empty
  }
  return out;
}

interface SemanticChunkDetail {
  file: string;
  line: number;
  col: number;
  kind: string;
  snippet: string;
}

async function semanticFallbackSearch(
  graph: SymbolGraph,
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const index = createSemanticIndex({ embeddingProvider: null });
  const details = new Map<string, SemanticChunkDetail>();

  for (const [filePath, fileSymbols] of graph.files) {
    for (const symbol of fileSymbols.symbols) {
      if (symbol.name.length === 0) continue;
      const symbolId = `${filePath}:${symbol.scope ? `${symbol.scope}.` : ''}${symbol.name}`;
      const expandedName = splitIdentifier(symbol.name).join(' ');
      const expandedScope = symbol.scope ? splitIdentifier(symbol.scope).join(' ') : '';
      const content = [
        symbol.name,
        expandedName,
        symbol.kind,
        filePath,
        symbol.scope,
        expandedScope,
      ].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
      await index.addChunk({ id: symbolId, content, symbolId });
      details.set(symbolId, {
        file: filePath,
        line: symbol.line,
        col: symbol.col,
        kind: symbol.kind,
        snippet: `${symbol.kind}\t${symbol.name}${symbol.scope ? ` (scope=${symbol.scope})` : ''}`,
      });
    }
  }

  const semantic = await index.search(query, { maxResults });
  return semantic.flatMap((match) => {
    const detail = details.get(match.id);
    if (!detail) return [];
    const result: SearchResult = {
      source: 'local',
      file: detail.file,
      line: detail.line,
      col: detail.col,
      snippet: detail.snippet,
      kind: detail.kind,
      score: 40 + match.score,
      matchMode: 'semantic_fallback',
    };
    if (match.reason !== undefined) result.reason = match.reason;
    return [result];
  });
}

function splitIdentifier(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/u)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
}

function dedupeAndRank(results: SearchResult[]): SearchResult[] {
  const byKey = new Map<string, SearchResult>();
  for (const result of results) {
    const key = `${result.file}:${result.line}:${result.col}:${result.matchMode}`;
    const existing = byKey.get(key);
    if (!existing || result.score > existing.score) byKey.set(key, result);
  }
  return [...byKey.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const fileCompare = a.file.localeCompare(b.file);
    if (fileCompare !== 0) return fileCompare;
    if (a.line !== b.line) return a.line - b.line;
    if (a.col !== b.col) return a.col - b.col;
    return a.matchMode.localeCompare(b.matchMode);
  });
}

function formatResults(results: SearchResult[], query: string, action: string, remoteEnabled: boolean): string {
  if (results.length === 0) {
    const mode = remoteEnabled ? action : `${action} local-only`;
    return `(no results for '${query}' in ${mode} search)`;
  }
  const lines = results.map((r) => {
    const src = r.source === 'local' ? 'L' : 'R';
    const reason = r.reason ? `  ${r.reason}` : '';
    return `[${src}] ${r.matchMode} score=${String(r.score).padStart(3)}  ${r.file}:${r.line}:${r.col}  ${r.snippet}${reason}`;
  });
  return `Found ${results.length} results for '${query}':\n${lines.join('\n')}`;
}

export const smartSearchTool = new SmartSearchTool();
