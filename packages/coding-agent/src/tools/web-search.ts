/**
 * web_search 工具 — D-30.1γ.1 (2026-06-07).
 *
 * 拍板 (D-30.1γ): 用 node:fetch (Node 20+ 内置) 调 search API.
 * Sprint 1 范围: 占位 URL (api.search.example.com), 接入真后端 (Brave/DDG/SerpAPI) 留 D-30.4.
 * 复用 1:1 跟 6 工具同形态: class-based, name + risk + schema + execute.
 * Risk: 'low' (只读网络, 不写本地).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchTool implements Tool {
  readonly name = 'web_search' as ToolName;
  readonly description =
    'Search the web and return top N results (title + url + snippet). Lightweight HTTP fetch.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string' },
      limit: { type: 'number', description: 'Max results (default 5)', minimum: 1, maximum: 20 },
    },
    required: ['query'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const query = input['query'];
    if (typeof query !== 'string' || query.length === 0) {
      return { success: false, content: '', error: 'invalid-input: query is required' };
    }
    const limit = typeof input['limit'] === 'number' ? input['limit'] : 5;

    const url = `https://api.search.example.com/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return {
          success: false,
          content: '',
          error: `search failed: HTTP ${res.status}`,
          meta: { url, status: res.status },
        };
      }
      const data = (await res.json()) as { results: WebSearchResult[] };
      const lines = (data.results ?? []).map(
        (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`,
      );
      return {
        success: true,
        content: lines.join('\n\n') || '(no results)',
        meta: { count: data.results?.length ?? 0, query },
      };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `search error: ${e instanceof Error ? e.message : String(e)}`,
        meta: { url },
      };
    }
  }
}
