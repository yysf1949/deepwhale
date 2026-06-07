/**
 * web_extract 工具 — D-30.1γ.2 (2026-06-07).
 *
 * 拍板 (D-30.1γ): 用 node:fetch 拉 HTML, regex 简单解析 h1/h2/h3/p/code/pre.
 * Sprint 1 范围: 不引 'turndown' (heavy dep), 简化 regex 够 demo / 测试用.
 * 真 turndown 接入留 D-30.4.
 * Risk: 'low' (只读网络).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export class WebExtractTool implements Tool {
  readonly name = 'web_extract' as ToolName;
  readonly description =
    'Fetch a URL and convert HTML to markdown. Lightweight regex-based, no JS rendering.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      selector: { type: 'string', description: 'CSS selector hint (optional, not yet implemented)' },
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
          error: `fetch failed: HTTP ${res.status}`,
          meta: { url, status: res.status },
        };
      }
      const html = await res.text();
      const md = htmlToMarkdown(html);
      return {
        success: true,
        content: md,
        meta: { url, byteLength: html.length },
      };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `extract error: ${e instanceof Error ? e.message : String(e)}`,
        meta: { url },
      };
    }
  }
}

/**
 * 简化 HTML→markdown 转换. 跟 plan 1:1 行为:
 * - 删 <script> / <style> 内容
 * - h1/h2/h3 → "# "/"## "/"### "
 * - p → 段尾换行
 * - 删残余 tags
 * - 实体替换 &nbsp; &amp;
 * 真 turndown 接入留 D-30.4.
 */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
