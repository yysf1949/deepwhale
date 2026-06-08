import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlogwatcherTool } from '../../src/tools/blogwatcher.js';

const mockRss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Blog</title>
  <item>
    <title>Hello</title>
    <link>https://example.com/p/1</link>
    <pubDate>Mon, 08 Jun 2026 00:00:00 GMT</pubDate>
    <description>First post body</description>
  </item>
</channel></rss>`;

describe('blogwatcher', () => {
  let dir = '';
  let tool: BlogwatcherTool;
  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'bw-'));
    tool = new BlogwatcherTool({ rootDir: dir, fetcher: async () => mockRss });
  });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('add subscription writes subs.json', async () => {
    const r = await tool.execute({ action: 'add', feedUrl: 'https://example.com/feed.xml' });
    expect(r.success).toBe(true);
    const stat = await fs.stat(join(dir, 'blogwatcher', 'subs.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('list returns active subs', async () => {
    await tool.execute({ action: 'add', feedUrl: 'https://a.com/feed' });
    const r = await tool.execute({ action: 'list' });
    expect(r.content).toContain('a.com');
  });

  it('fetchNew stores entries', async () => {
    await tool.execute({ action: 'add', feedUrl: 'https://a.com/feed' });
    const r = await tool.execute({ action: 'fetchNew' });
    expect(r.success).toBe(true);
    const entries = await fs.readdir(join(dir, 'blogwatcher', 'entries'));
    expect(entries.length).toBeGreaterThan(0);
  });

  it('read returns entry body', async () => {
    await tool.execute({ action: 'add', feedUrl: 'https://a.com/feed' });
    await tool.execute({ action: 'fetchNew' });
    const r = await tool.execute({ action: 'read', entryId: 'a.com/1' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('First post body');
  });
});
