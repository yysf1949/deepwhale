/**
 * D-30.1γ.3: browser_navigate 工具 stub — 拉 URL, 提 title + 链接列表.
 *
 * 拍板 (D-30.1γ): 真 browser (puppeteer/playwright) 是 heavy dep, Sprint 1 走
 * 简化版 (HTTP fetch + HTML 解析), 不做 JS 渲染. 真 browser 留 D-30.4.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BrowserNavigateTool } from '../../src/tools/browser-navigate.js';

describe('browser_navigate tool stub (D-30.1γ.3)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('navigates to URL and returns page snapshot', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><head><title>Test Page</title></head><body><a href="/foo">link</a></body></html>',
    }) as unknown as typeof fetch;

    const tool = new BrowserNavigateTool();
    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toContain('Test Page');
      expect(result.content).toContain('https://example.com');
      expect(result.content).toContain('Links:');
    }
  });

  it('handles no-title page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body>no title here</body></html>',
    }) as unknown as typeof fetch;

    const tool = new BrowserNavigateTool();
    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toContain('(no title)');
    }
  });

  it('returns error on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const tool = new BrowserNavigateTool();
    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('500');
    }
  });
});
