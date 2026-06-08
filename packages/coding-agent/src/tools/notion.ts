/**
 * notion 工具 — Notion REST API 5 action (D-31.3.1, 2026-06-08).
 *
 * 拍板: 走 Notion public API (`api.notion.com/v1`), bearer token 走
 *   `NOTION_TOKEN` env, fetcher 注入 (默认 stub). 不引 @notionhq/client (省
 *   native dep), 走 hand-rolled HTTP.
 * - search:       POST /v1/search
 * - getPage:      GET /v1/pages/{id}
 * - createPage:   POST /v1/pages
 * - updatePage:   PATCH /v1/pages/{id}
 * - queryDatabase: POST /v1/databases/{id}/query
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写 Notion 文档).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type NotionFetcher = (url: string, opts?: { method?: string; body?: string }) => Promise<string>;
const defaultFetcher: NotionFetcher = async () => { throw new Error('notion: no fetcher injected'); };

const BASE = 'https://api.notion.com/v1';

export class NotionTool implements Tool {
  readonly name = 'notion' as ToolName;
  readonly description = 'Read/write Notion pages + databases via REST: search / getPage / createPage / updatePage / queryDatabase. Medium risk (writes remote).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'notion action', enum: ['search', 'getPage', 'createPage', 'updatePage', 'queryDatabase'] },
      query: { type: 'string', description: 'search query (search action)' },
      pageId: { type: 'string', description: 'page id (getPage / updatePage)' },
      parent: { type: 'string', description: 'parent database id (createPage)' },
      databaseId: { type: 'string', description: 'database id (queryDatabase)' },
      title: { type: 'string', description: 'page title (createPage)' },
    },
    required: ['action'],
  };

  private readonly fetcher: NotionFetcher;
  constructor(opts: { fetcher?: NotionFetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'search': {
          const q = typeof input['query'] === 'string' ? input['query'] : '';
          const out = await this.fetcher(`${BASE}/search`, { method: 'POST', body: JSON.stringify({ query: q }) });
          return { success: true, content: out };
        }
        case 'getPage': {
          const id = input['pageId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: pageId required' };
          const out = await this.fetcher(`${BASE}/pages/${id}`, { method: 'GET' });
          return { success: true, content: out };
        }
        case 'createPage': {
          const parent = input['parent'], title = input['title'];
          if (typeof parent !== 'string' || typeof title !== 'string') {
            return { success: false, content: '', error: 'invalid-input: parent + title required' };
          }
          const body = JSON.stringify({
            parent: { database_id: parent },
            properties: { title: [{ text: { content: title } }] },
          });
          const out = await this.fetcher(`${BASE}/pages`, { method: 'POST', body });
          return { success: true, content: out, meta: { parent } };
        }
        case 'updatePage': {
          const id = input['pageId'], props = input['properties'];
          if (typeof id !== 'string' || typeof props !== 'object' || props === null) {
            return { success: false, content: '', error: 'invalid-input: pageId + properties required' };
          }
          const out = await this.fetcher(`${BASE}/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ properties: props }) });
          return { success: true, content: out, meta: { pageId: id } };
        }
        case 'queryDatabase': {
          const id = input['databaseId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: databaseId required' };
          const out = await this.fetcher(`${BASE}/databases/${id}/query`, { method: 'POST', body: '{}' });
          return { success: true, content: out };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `notion error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const notion = new NotionTool();
