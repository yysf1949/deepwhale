/**
 * D-30.1γ.2: web_extract 工具 — 拉 URL HTML, 转 markdown.
 *
 * 拍板 (D-30.1γ): 用 node:fetch 拉 HTML, 简单 regex 解析 h1/h2/p/script/style.
 * Sprint 1 范围: 不引 'turndown' (heavy dep), 简化 regex 够 demo / 测试用.
 * 真 turndown 接入留 D-30.4.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebExtractTool } from '../../src/tools/web-extract.js';

describe('web_extract tool (D-30.1γ.2)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('extracts markdown from URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><body><h1>Title</h1><p>Content here</p></body></html>',
    }) as unknown as typeof fetch;

    const tool = new WebExtractTool();
    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toContain('Title');
      expect(result.content).toContain('Content here');
      expect(result.content).toContain('# Title');
    }
  });

  it('strips script and style tags', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><head><style>body{}</style><script>alert(1)</script></head><body><p>visible</p></body></html>',
    }) as unknown as typeof fetch;

    const tool = new WebExtractTool();
    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).not.toContain('alert(1)');
      expect(result.content).not.toContain('body{}');
      expect(result.content).toContain('visible');
    }
  });

  it('returns error on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    const tool = new WebExtractTool();
    const result = await tool.execute({ url: 'https://example.com' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('404');
    }
  });
});
