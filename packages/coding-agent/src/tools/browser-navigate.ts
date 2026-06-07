/**
 * browser_navigate 工具 stub — D-30.1γ.3 (2026-06-07).
 *
 * 拍板 (D-30.1γ): 真 browser (puppeteer/playwright) 是 heavy dep, Sprint 1 走
 * 简化版 (HTTP fetch + HTML 解析), 不做 JS 渲染. 真 browser 留 D-30.4.
 * Risk: 'low' (只读网络, 不写本地).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export class BrowserNavigateTool implements Tool {
  readonly name = 'browser_navigate' as ToolName;
  readonly description =
    'Navigate to URL and return page snapshot (title + link list). Lightweight, no JS rendering.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate' },
    },
    required: ['url'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input['url'];
    if (typeof url !== 'string' || url.length === 0) {
      return { success: false, content: '', error: 'invalid-input: url is required' };
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        return {
          success: false,
          content: '',
          error: `navigate failed: HTTP ${res.status}`,
          meta: { url, status: res.status },
        };
      }
      const html = await res.text();
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(no title)';
      const links = Array.from(html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))
        .map((m) => {
          const href = m[1] ?? '';
          const text = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
          return `  - ${href}: ${text}`;
        })
        .slice(0, 20)
        .join('\n');
      return {
        success: true,
        content: `URL: ${url}\nTitle: ${title}\nLinks:\n${links || '(none)'}`,
        meta: { url, title, linkCount: links ? links.split('\n').length : 0 },
      };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `navigate error: ${e instanceof Error ? e.message : String(e)}`,
        meta: { url },
      };
    }
  }
}
