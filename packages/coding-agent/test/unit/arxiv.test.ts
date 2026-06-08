import { describe, it, expect, beforeEach } from 'vitest';
import { ArxivTool } from '../../src/tools/arxiv.js';

const mockFeed = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2406.00001v1</id>
    <title>Test Paper</title>
    <summary>An abstract.</summary>
    <author><name>Alice</name></author>
    <link href="http://arxiv.org/pdf/2406.00001v1" rel="related"/>
  </entry>
</feed>`;

describe('arxiv', () => {
  let tool: ArxivTool;
  beforeEach(() => {
    tool = new ArxivTool({ fetcher: async (url) => {
      if (url.includes('search_query') || url.includes('id_list=')) return mockFeed;
      return '';
    }});
  });

  it('search returns title/abstract/authors/pdfUrl', async () => {
    const r = await tool.execute({ action: 'search', query: 'llm agents', maxResults: 1 });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Test Paper');
    expect(r.content).toContain('Alice');
  });

  it('get returns single paper', async () => {
    const r = await tool.execute({ action: 'get', arxivId: '2406.00001' });
    expect(r.success).toBe(true);
  });

  it('downloadPdf returns pdfUrl', async () => {
    const r = await tool.execute({ action: 'downloadPdf', arxivId: '2406.00001' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('pdf');
  });

  it('rejects empty query', async () => {
    const r = await tool.execute({ action: 'search', query: '' });
    expect(r.success).toBe(false);
  });
});
