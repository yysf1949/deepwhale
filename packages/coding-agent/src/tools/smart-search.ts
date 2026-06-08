/**
 * smart_search 工具 — 3 action (D-32.3.1, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel 智能 search (symbol-aware) + gh CLI 远端
 *   search (公开 repo code search). 3 action:
 *     local  — 只走 code-intel findReferences (symbol-like query)
 *     remote — 只走 gh search code (公开 GitHub code search)
 *     all    — try local first, fall back to remote (default)
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (read-only).
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { buildSymbolGraph, findReferences } from '@deepwhale/code-intel';

const execFile = promisify(execFileCb);

export class SmartSearchTool implements Tool {
  readonly name = 'smart_search' as ToolName;
  readonly description = 'Smart code search with symbol-awareness. 3 actions: local (code-intel findReferences), remote (gh search code), all (try local first). Low risk (read-only).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

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
      if ((action === 'remote' || action === 'all') && results.length === 0) {
        const remote = await remoteSearch(query, maxResults);
        results.push(...remote);
      }
      const content = formatResults(results, query, action as string);
      return {
        success: true,
        content,
        meta: { query, action, count: results.length, localCount: results.filter((r) => r.source === 'local').length, remoteCount: results.filter((r) => r.source === 'remote').length },
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
      });
    }
  } catch {
    // ignore — local search is best-effort
  }
  return out.slice(0, maxResults);
}

async function remoteSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  try {
    const { stdout } = await execFile('gh', [
      'search', 'code', query,
      '--limit', String(maxResults),
      '--json', 'path,repository,textMatches',
    ], { timeout: 15_000 });
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
      });
    }
  } catch {
    // gh not available or auth missing — return empty
  }
  return out;
}

function formatResults(results: SearchResult[], query: string, action: string): string {
  if (results.length === 0) {
    return `(no results for '${query}' in ${action} search)`;
  }
  const lines = results.map((r) => {
    const src = r.source === 'local' ? 'L' : 'R';
    return `[${src}] score=${String(r.score).padStart(3)}  ${r.file}:${r.line}:${r.col}  ${r.snippet}`;
  });
  return `Found ${results.length} results for '${query}':\n${lines.join('\n')}`;
}

export const smartSearchTool = new SmartSearchTool();
