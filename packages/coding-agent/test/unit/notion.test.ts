import { describe, it, expect, beforeEach } from 'vitest';
import { NotionTool } from '../../src/tools/notion.js';

const mockSearch = JSON.stringify({
  results: [
    { id: 'p1', properties: { title: [{ plain_text: 'Daily Notes' }] } },
  ],
});
const mockPage = JSON.stringify({
  id: 'p1', properties: { title: [{ plain_text: 'Daily Notes' }] },
  last_edited_time: '2026-06-08T00:00:00.000Z',
});

describe('notion', () => {
  let tool: NotionTool;
  beforeEach(() => {
    tool = new NotionTool({ fetcher: async (url, opts) => {
      if (url.includes('/search') && opts?.method === 'POST') return mockSearch;
      if (url.endsWith('/pages/p1') && opts?.method === 'GET') return mockPage;
      if (url.endsWith('/pages') && opts?.method === 'POST') return mockPage;
      if (url.endsWith('/pages/p1') && opts?.method === 'PATCH') return mockPage;
      if (url.includes('/databases/')) return mockPage;
      return '{}';
    }});
  });

  it('search returns matching pages', async () => {
    const r = await tool.execute({ action: 'search', query: 'notes' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Daily Notes');
  });

  it('getPage returns page properties', async () => {
    const r = await tool.execute({ action: 'getPage', pageId: 'p1' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Daily Notes');
  });

  it('createPage returns new page id', async () => {
    const r = await tool.execute({ action: 'createPage', parent: 'db1', title: 'New' });
    expect(r.success).toBe(true);
  });

  it('updatePage patches properties', async () => {
    const r = await tool.execute({ action: 'updatePage', pageId: 'p1', properties: { status: 'done' } });
    expect(r.success).toBe(true);
  });

  it('queryDatabase lists entries', async () => {
    const r = await tool.execute({ action: 'queryDatabase', databaseId: 'db1' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown action', async () => {
    const r = await tool.execute({ action: 'wat' });
    expect(r.success).toBe(false);
  });
});
