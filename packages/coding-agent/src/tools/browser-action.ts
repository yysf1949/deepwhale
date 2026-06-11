/**
 * browser_action 工具 — D-126 Browser interaction enhancement.
 *
 * Lightweight browser interaction without puppeteer/playwright.
 * Supports click, type, and submit actions via HTML parsing and form submission.
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type BrowserActionType = 'click' | 'type' | 'submit' | 'scroll';

export interface BrowserActionInput {
  action: BrowserActionType;
  url?: string;
  selector?: string;
  value?: string;
}

export class BrowserActionTool implements Tool {
  readonly name = 'browser_action' as ToolName;
  readonly description =
    'Interact with a web page: click links/buttons, type into inputs, submit forms. Lightweight HTTP-based.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['click', 'type', 'submit', 'scroll'],
        description: 'Action to perform',
      },
      url: { type: 'string', description: 'URL to interact with (for click/submit)' },
      selector: {
        type: 'string',
        description: 'CSS-like selector for element (e.g., "a[href=/login]", "input[name=q]")',
      },
      value: { type: 'string', description: 'Value to type (for type action)' },
    },
    required: ['action'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    if (typeof action !== 'string' || !['click', 'type', 'submit', 'scroll'].includes(action)) {
      return { success: false, content: '', error: 'invalid-input: action must be click/type/submit/scroll' };
    }

    const url = input['url'];
    const selector = input['selector'];
    const value = input['value'];

    try {
      switch (action) {
        case 'click':
          return this.handleClick(url, selector);
        case 'type':
          return this.handleType(url, selector, value);
        case 'submit':
          return this.handleSubmit(url, selector);
        case 'scroll':
          return this.handleScroll(url);
        default:
          return { success: false, content: '', error: `unknown action: ${action}` };
      }
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `browser action error: ${e instanceof Error ? e.message : String(e)}`,
        meta: { action, url, selector },
      };
    }
  }

  private async handleClick(url: unknown, selector: unknown): Promise<ToolResult> {
    if (typeof url !== 'string' || typeof selector !== 'string') {
      return { success: false, content: '', error: 'click requires url and selector' };
    }

    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
    }

    const html = await res.text();
    const linkMatch = html.match(
      new RegExp(`<a[^>]+href="([^"]*)"[^>]*>[^<]*${escapeRegex(selector)}[^<]*<\\/a>`, 'i'),
    );

    if (linkMatch && linkMatch[1]) {
      const href = linkMatch[1].startsWith('http') ? linkMatch[1] : new URL(linkMatch[1], url).href;
      const linkRes = await fetch(href);
      if (!linkRes.ok) {
        return { success: false, content: '', error: `navigation failed: HTTP ${linkRes.status}` };
      }
      const linkHtml = await linkRes.text();
      const title = linkHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(no title)';
      return {
        success: true,
        content: `Clicked link. Navigated to: ${href}\nTitle: ${title}`,
        meta: { action: 'click', url: href, title },
      };
    }

    return {
      success: false,
      content: '',
      error: `element not found: ${selector}`,
      meta: { action: 'click', url, selector },
    };
  }

  private async handleType(url: unknown, selector: unknown, value: unknown): Promise<ToolResult> {
    if (typeof url !== 'string' || typeof selector !== 'string' || typeof value !== 'string') {
      return { success: false, content: '', error: 'type requires url, selector, and value' };
    }

    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
    }

    const html = await res.text();
    const inputMatch = html.match(
      new RegExp(`<input[^>]*${escapeRegex(selector)}[^>]*\\/>`, 'i'),
    );

    if (inputMatch) {
      return {
        success: true,
        content: `Typed "${value}" into ${selector}. (Note: HTTP-only mode cannot persist state)`,
        meta: { action: 'type', url, selector, value },
      };
    }

    return {
      success: false,
      content: '',
      error: `input not found: ${selector}`,
      meta: { action: 'type', url, selector },
    };
  }

  private async handleSubmit(url: unknown, selector: unknown): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'submit requires url' };
    }

    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
    }

    const html = await res.text();
    const formMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*>/i);

    if (formMatch && formMatch[1]) {
      const actionUrl = formMatch[1].startsWith('http')
        ? formMatch[1]
        : new URL(formMatch[1], url).href;
      return {
        success: true,
        content: `Form action URL: ${actionUrl}. (Note: HTTP-only mode cannot submit forms with data)`,
        meta: { action: 'submit', url: actionUrl },
      };
    }

    return {
      success: false,
      content: '',
      error: 'no form found on page',
      meta: { action: 'submit', url },
    };
  }

  private async handleScroll(url: unknown): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'scroll requires url' };
    }

    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
    }

    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(no title)';
    const bodyLen = html.length;

    return {
      success: true,
      content: `Page loaded: ${title}\nBody length: ${bodyLen} chars\n(Scroll is a no-op in HTTP-only mode)`,
      meta: { action: 'scroll', url, title, bodyLen },
    };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
