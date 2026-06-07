/**
 * D-30.1γ.1: web_search 工具 — 调 fetch, 返 top N 结果.
 *
 * 拍板 (D-30.1γ): 用 node 内置 fetch (Node 20+), stub URL 是 api.search.example.com.
 * Sprint 1 范围: 占位 URL (没真接入 Brave/DDG); 接后端留 D-30.4.
 *
 * 注意: 跟现有 6 工具 1:1 同形态 (class-based, name + risk + schema + execute),
 * 不引入 defineTool 工厂.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebSearchTool } from '../../src/tools/web-search.js';

describe('web_search tool (D-30.1γ.1)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns search results formatted as numbered list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Result 1', url: 'https://example.com/1', snippet: 'snippet 1' },
          { title: 'Result 2', url: 'https://example.com/2', snippet: 'snippet 2' },
        ],
      }),
    }) as unknown as typeof fetch;

    const tool = new WebSearchTool();
    const result = await tool.execute({ query: 'test', limit: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toContain('Result 1');
      expect(result.content).toContain('Result 2');
      expect(result.content).toContain('https://example.com/1');
      expect(result.content).toContain('1.');
      expect(result.content).toContain('2.');
    }
  });

  it('returns error on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    const tool = new WebSearchTool();
    const result = await tool.execute({ query: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('503');
    }
  });

  it('returns error on fetch exception', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network fail')) as unknown as typeof fetch;

    const tool = new WebSearchTool();
    const result = await tool.execute({ query: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('network fail');
    }
  });
});
