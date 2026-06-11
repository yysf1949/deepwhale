/**
 * browser_navigate 工具 — D-131 Browser 增强
 *
 * 拍板 (D-30.1γ): 真 browser (puppeteer/playwright) 是 heavy dep, 走
 * 简化版 (HTTP fetch + HTML 解析), 不做 JS 渲染.
 * D-131 增强: Cookie 支持、重定向跟随、更好的错误处理.
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

// Simple cookie jar for session persistence
const cookieJar = new Map<string, string>();

export class BrowserNavigateTool implements Tool {
  readonly name = 'browser_navigate' as ToolName;
  readonly description =
    'Navigate to URL and return page snapshot (title + links + forms). Supports cookies and redirects.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate' },
      followRedirects: { type: 'boolean', description: 'Follow HTTP redirects (default: true)' },
      clearCookies: { type: 'boolean', description: 'Clear cookie jar before request' },
    },
    required: ['url'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input['url'];
    if (typeof url !== 'string' || url.length === 0) {
      return { success: false, content: '', error: 'invalid-input: url is required' };
    }

    const followRedirects = input['followRedirects'] !== false;
    const clearCookies = input['clearCookies'] === true;

    if (clearCookies) {
      cookieJar.clear();
    }

    try {
      const headers: Record<string, string> = {};
      
      // Add cookies from jar
      const domain = new URL(url).hostname;
      const cookies = Array.from(cookieJar.entries())
        .filter(([key]) => key.startsWith(domain))
        .map(([, value]) => value)
        .join('; ');
      if (cookies) {
        headers['Cookie'] = cookies;
      }

      const res = await fetch(url, {
        redirect: followRedirects ? 'follow' : 'manual',
        headers,
      });

      // Store cookies from response (handle missing getSetCookie gracefully)
      const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      for (const cookie of setCookies) {
        const [pair] = cookie.split(';');
        if (pair) {
          const [name, ...valueParts] = pair.split('=');
          if (name) {
            cookieJar.set(`${domain}:${name.trim()}`, `${name.trim()}=${valueParts.join('=')}`);
          }
        }
      }

      if (!res.ok) {
        return {
          success: false,
          content: '',
          error: `navigate failed: HTTP ${res.status} ${res.statusText}`,
          meta: { url, status: res.status, statusText: res.statusText },
        };
      }

      const html = await res.text();
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(no title)';
      
      // Extract links
      const links = Array.from(html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi))
        .map((m) => {
          const href = m[1] ?? '';
          const text = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
          return `  - ${href}: ${text}`;
        })
        .slice(0, 20)
        .join('\n');

      // Extract forms
      const forms = Array.from(html.matchAll(/<form[^>]*action="([^"]*)"[^>]*>/gi))
        .map((m) => `  - ${m[1] ?? '(no action)'}`)
        .slice(0, 5)
        .join('\n');

      // Extract meta description
      const metaDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"[^>]*>/i)?.[1]?.trim();

      return {
        success: true,
        content: [
          `URL: ${res.url}`,
          `Title: ${title}`,
          metaDesc ? `Description: ${metaDesc}` : null,
          `Status: ${res.status}`,
          `Links (${links ? links.split('\n').length : 0}):`,
          links || '  (none)',
          forms ? `\nForms (${forms.split('\n').length}):` : null,
          forms || null,
          `\nCookies: ${cookieJar.size} stored`,
        ].filter(Boolean).join('\n'),
        meta: { 
          url: res.url, 
          title, 
          status: res.status,
          linkCount: links ? links.split('\n').length : 0,
          formCount: forms ? forms.split('\n').length : 0,
          cookieCount: cookieJar.size,
        },
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
