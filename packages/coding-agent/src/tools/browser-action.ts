/**
 * browser_action 工具 — D-132 Browser interaction enhancement.
 *
 * Lightweight browser interaction without puppeteer/playwright.
 * Supports click, type, submit, scroll, extract, and wait actions.
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type BrowserActionType = 'click' | 'type' | 'submit' | 'scroll' | 'extract' | 'wait';

export interface BrowserActionInput {
  action: BrowserActionType;
  url?: string;
  selector?: string;
  value?: string;
  timeout?: number;
}

export class BrowserActionTool implements Tool {
  readonly name = 'browser_action' as ToolName;
  readonly description =
    'Interact with web pages: click, type, submit, scroll, extract content, wait for elements. Lightweight HTTP-based.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['click', 'type', 'submit', 'scroll', 'extract', 'wait'],
        description: 'Action to perform',
      },
      url: { type: 'string', description: 'URL to interact with' },
      selector: {
        type: 'string',
        description: 'CSS-like selector for element (e.g., "a[href=/login]", "input[name=q]", "h1")',
      },
      value: { type: 'string', description: 'Value to type (for type action) or text to wait for' },
      timeout: { type: 'number', description: 'Timeout in ms (for wait action, default 5000)' },
    },
    required: ['action'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    if (typeof action !== 'string' || !['click', 'type', 'submit', 'scroll', 'extract', 'wait'].includes(action)) {
      return { success: false, content: '', error: 'invalid-input: action must be click/type/submit/scroll/extract/wait' };
    }

    const url = input['url'];
    const selector = input['selector'];
    const value = input['value'];
    const timeout = typeof input['timeout'] === 'number' ? input['timeout'] : 5000;

    try {
      switch (action) {
        case 'click':
          return this.handleClick(url, selector);
        case 'type':
          return this.handleType(url, selector, value);
        case 'submit':
          return this.handleSubmit(url, selector, value);
        case 'scroll':
          return this.handleScroll(url);
        case 'extract':
          return this.handleExtract(url, selector);
        case 'wait':
          return this.handleWait(url, selector, value, timeout);
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

  private async handleSubmit(url: unknown, selector: unknown, value: unknown): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'submit requires url' };
    }

    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
    }

    const html = await res.text();
    
    // Extract form data if provided
    const formData = typeof value === 'string' ? value : '';
    const formFields = formData.split('&').map(pair => {
      const [key, val] = pair.split('=');
      return { key: key?.trim() ?? '', value: val?.trim() ?? '' };
    }).filter(f => f.key);

    // Find form action
    const formMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*>/i);
    
    if (formMatch && formMatch[1]) {
      const actionUrl = formMatch[1].startsWith('http')
        ? formMatch[1]
        : new URL(formMatch[1], url).href;
      
      // If form data provided, submit via POST
      if (formFields.length > 0) {
        const postRes = await fetch(actionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formFields.map(f => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`).join('&'),
        });
        
        if (!postRes.ok) {
          return { success: false, content: '', error: `form submission failed: HTTP ${postRes.status}` };
        }
        
        const resultHtml = await postRes.text();
        const resultTitle = resultHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(no title)';
        return {
          success: true,
          content: `Form submitted to: ${actionUrl}\nResult page: ${resultTitle}`,
          meta: { action: 'submit', url: actionUrl, fields: formFields.length },
        };
      }
      
      return {
        success: true,
        content: `Form action URL: ${actionUrl}. Use with form data to submit.`,
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

  private async handleExtract(url: unknown, selector: unknown): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'extract requires url' };
    }

    const res = await fetch(url);
    if (!res.ok) {
      return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
    }

    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '(no title)';
    
    // Extract content based on selector
    let content = '';
    if (typeof selector === 'string' && selector) {
      // Try to extract specific element
      const tagMatch = selector.match(/^(\w+)/);
      const tag = tagMatch?.[1] ?? 'div';
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const match = html.match(regex);
      content = match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? `(no ${tag} found)`;
    } else {
    // Extract all text content
    content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000);
    }

    return {
      success: true,
      content: `Title: ${title}\n\nContent:\n${content}`,
      meta: { action: 'extract', url, title, contentLength: content.length },
    };
  }

  private async handleWait(url: unknown, selector: unknown, value: unknown, timeout: number): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'wait requires url' };
    }

    const startTime = Date.now();
    const maxAttempts = Math.ceil(timeout / 1000);
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          return { success: false, content: '', error: `fetch failed: HTTP ${res.status}` };
        }

        const html = await res.text();
        
        // Check if selector/text exists
        if (typeof selector === 'string' && selector) {
          if (html.includes(selector)) {
            return {
              success: true,
              content: `Element/text found after ${Date.now() - startTime}ms`,
              meta: { action: 'wait', url, selector, durationMs: Date.now() - startTime },
            };
          }
        } else if (typeof value === 'string' && value) {
          if (html.includes(value)) {
            return {
              success: true,
              content: `Text "${value}" found after ${Date.now() - startTime}ms`,
              meta: { action: 'wait', url, value, durationMs: Date.now() - startTime },
            };
          }
        } else {
          // Just wait for page load
          return {
            success: true,
            content: `Page loaded after ${Date.now() - startTime}ms`,
            meta: { action: 'wait', url, durationMs: Date.now() - startTime },
          };
        }
      } catch {
        // Continue retrying
      }
      
      if (Date.now() - startTime >= timeout) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      success: false,
      content: '',
      error: `wait timed out after ${timeout}ms`,
      meta: { action: 'wait', url, selector, timeout },
    };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
