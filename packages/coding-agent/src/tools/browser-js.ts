/**
 * browser_js 工具 — D-137 Browser JS 渲染
 *
 * Uses puppeteer-core for real browser automation with JS execution.
 * Requires a Chrome/Chromium binary to be available.
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export interface BrowserJsInput {
  action: 'evaluate' | 'screenshot' | 'pdf';
  url?: string;
  script?: string;
  selector?: string;
  outputPath?: string;
}

export class BrowserJsTool implements Tool {
  readonly name = 'browser_js' as ToolName;
  readonly description =
    'Execute JavaScript in a real browser, take screenshots, or generate PDFs. Requires Chrome/Chromium.';
  readonly risk: 'medium' | 'high' = 'medium';
  readonly capabilities: readonly ToolCapability[] = ['network', 'code-execute'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['evaluate', 'screenshot', 'pdf'],
        description: 'Action to perform',
      },
      url: { type: 'string', description: 'URL to navigate to' },
      script: { type: 'string', description: 'JavaScript code to evaluate' },
      selector: { type: 'string', description: 'CSS selector for element operations' },
      outputPath: { type: 'string', description: 'Output file path for screenshot/pdf' },
    },
    required: ['action'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    if (typeof action !== 'string' || !['evaluate', 'screenshot', 'pdf'].includes(action)) {
      return { success: false, content: '', error: 'invalid-input: action must be evaluate/screenshot/pdf' };
    }

    const url = input['url'];
    const script = input['script'];
    const selector = input['selector'];
    const outputPath = input['outputPath'];

    try {
      // Dynamic import to avoid loading puppeteer-core when not needed
      const puppeteer = await import('puppeteer-core');
      
      // Find Chrome/Chromium binary
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const page = await browser.newPage();

        switch (action) {
          case 'evaluate':
            return this.handleEvaluate(page, url, script);
          case 'screenshot':
            return this.handleScreenshot(page, url, selector, outputPath);
          case 'pdf':
            return this.handlePdf(page, url, outputPath);
          default:
            return { success: false, content: '', error: `unknown action: ${action}` };
        }
      } finally {
        await browser.close();
      }
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `browser-js error: ${e instanceof Error ? e.message : String(e)}`,
        meta: { action, url },
      };
    }
  }

  private async handleEvaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    url: unknown,
    script: unknown,
  ): Promise<ToolResult> {
    if (typeof url !== 'string' || typeof script !== 'string') {
      return { success: false, content: '', error: 'evaluate requires url and script' };
    }

    await page.goto(url);
    const result = await page.evaluate(script);

    return {
      success: true,
      content: `Evaluation result:\n${JSON.stringify(result, null, 2)}`,
      meta: { action: 'evaluate', url, resultType: typeof result },
    };
  }

  private async handleScreenshot(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    url: unknown,
    _selector: unknown,
    outputPath: unknown,
  ): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'screenshot requires url' };
    }

    await page.goto(url);
    const screenshotOpts: { path?: string; fullPage?: boolean } = { fullPage: true };
    if (typeof outputPath === 'string') {
      screenshotOpts.path = outputPath;
    }
    const buffer = await page.screenshot(screenshotOpts);

    return {
      success: true,
      content: `Screenshot captured (${buffer.length} bytes)${typeof outputPath === 'string' ? ` saved to ${outputPath}` : ''}`,
      meta: { action: 'screenshot', url, size: buffer.length },
    };
  }

  private async handlePdf(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    url: unknown,
    outputPath: unknown,
  ): Promise<ToolResult> {
    if (typeof url !== 'string') {
      return { success: false, content: '', error: 'pdf requires url' };
    }

    await page.goto(url);
    const pdfOpts: { path?: string } = {};
    if (typeof outputPath === 'string') {
      pdfOpts.path = outputPath;
    }
    const buffer = await page.pdf(pdfOpts);

    return {
      success: true,
      content: `PDF generated (${buffer.length} bytes)${typeof outputPath === 'string' ? ` saved to ${outputPath}` : ''}`,
      meta: { action: 'pdf', url, size: buffer.length },
    };
  }
}
