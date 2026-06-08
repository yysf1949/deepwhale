/**
 * arxiv 工具 — 调 arXiv API 3 action (D-31.2.1, 2026-06-08).
 *
 * 拍板: 走 arXiv public API `export.arxiv.org/api/query` (无 auth, 0 token).
 *   parser 走 hand-rolled XML 子集 (only <entry>/<title>/<summary>/<author>/<link>),
 *   不引 xml2js (省 native dep). 跟 web-search 1:1 runner 协议.
 * - search: query + maxResults (default 5)
 * - get: arxivId
 * - downloadPdf: 返 pdfUrl (实际下载留 D-32+)
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读网络).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type Fetcher = (url: string) => Promise<string>;
const defaultFetcher: Fetcher = async () => { throw new Error('arxiv: no fetcher injected'); };

function parseEntry(xml: string): { title: string; summary: string; authors: string[]; pdfUrl: string; id: string } | null {
  const m = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!m || !m[1]) return null;
  const block = m[1];
  const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
  const summary = (block.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '').trim();
  const authors = Array.from(block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)).map(x => (x[1] ?? '').trim());
  const pdfUrl = block.match(/<link[^>]*href="([^"]*\.pdf)"/)?.[1] ?? '';
  const id = (block.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '').trim();
  return { title, summary, authors, pdfUrl, id };
}

function parseFeed(xml: string): Array<{ title: string; summary: string; authors: string[]; pdfUrl: string; id: string }> {
  const blocks = xml.split(/<entry>/).slice(1);
  const out: Array<{ title: string; summary: string; authors: string[]; pdfUrl: string; id: string }> = [];
  for (const b of blocks) {
    const entry = parseEntry('<entry>' + b);
    if (entry) out.push(entry);
  }
  return out;
}

export class ArxivTool implements Tool {
  readonly name = 'arxiv' as ToolName;
  readonly description = 'Search / get / downloadPdf from arXiv (export.arxiv.org/api/query). Low risk (read-only).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'arxiv action', enum: ['search', 'get', 'downloadPdf'] },
      query: { type: 'string', description: 'search query (search action)' },
      arxivId: { type: 'string', description: 'arxiv id like 2406.00001 (get/downloadPdf action)' },
      maxResults: { type: 'number', description: 'max results (default 5)' },
    },
    required: ['action'],
  };

  private readonly fetcher: Fetcher;
  constructor(opts: { fetcher?: Fetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'search': {
          const q = input['query'];
          if (typeof q !== 'string' || q.length === 0) {
            return { success: false, content: '', error: 'invalid-input: query required' };
          }
          const max = typeof input['maxResults'] === 'number' ? input['maxResults'] : 5;
          const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${q}`)}&max_results=${max}`;
          const xml = await this.fetcher(url);
          const entries = parseFeed(xml);
          const lines = entries.map(e => `${e.id}\n  ${e.title}\n  ${e.authors.join(', ')}\n  ${e.pdfUrl}\n  ${e.summary}`);
          return { success: true, content: lines.join('\n\n') || '(no results)', meta: { count: entries.length } };
        }
        case 'get': {
          const id = input['arxivId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: arxivId required' };
          const url = `http://export.arxiv.org/api/query?id_list=${id}`;
          const xml = await this.fetcher(url);
          const e = parseFeed(xml)[0];
          if (!e) return { success: false, content: '', error: `not-found: ${id}` };
          return { success: true, content: `${e.id}\n${e.title}\n${e.authors.join(', ')}\n${e.summary}` };
        }
        case 'downloadPdf': {
          const id = input['arxivId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: arxivId required' };
          const url = `http://export.arxiv.org/pdf/${id}v1`;
          return { success: true, content: `pdf url: ${url} (real download留 D-32+)`, meta: { pdfUrl: url } };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `arxiv error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const arxiv = new ArxivTool();
