import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LlmWikiTool } from '../../src/tools/llm-wiki.js';

describe('llm_wiki', () => {
  let dir = '';
  let tool: LlmWikiTool;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'wiki-'));
    tool = new LlmWikiTool({ dbPath: join(dir, 'wiki.db') });
    await tool.init();
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('addPage + query returns page', async () => {
    await tool.execute({ action: 'addPage', title: 'LLM Agents', content: 'agents are autonomous LLM systems' });
    const r = await tool.execute({ action: 'query', query: 'autonomous' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('LLM Agents');
  });

  it('link creates edge between pages', async () => {
    await tool.execute({ action: 'addPage', title: 'A', content: 'a' });
    await tool.execute({ action: 'addPage', title: 'B', content: 'b' });
    const r = await tool.execute({ action: 'link', from: 'A', to: 'B' });
    expect(r.success).toBe(true);
  });

  it('list returns all pages', async () => {
    await tool.execute({ action: 'addPage', title: 'X', content: 'x' });
    await tool.execute({ action: 'addPage', title: 'Y', content: 'y' });
    const r = await tool.execute({ action: 'list' });
    expect(r.content).toContain('X');
    expect(r.content).toContain('Y');
  });

  it('query on empty wiki returns not-found', async () => {
    const r = await tool.execute({ action: 'query', query: 'whatever' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('(no match)');
  });
});
