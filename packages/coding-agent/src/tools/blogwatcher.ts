/**
 * blogwatcher 工具 — RSS/Atom 订阅 (D-31.2.2, 2026-06-08).
 *
 * 拍板: persist `~/.deepwhale/blogwatcher/subs.json` + `entries/`. parser 走
 *   hand-rolled RSS 2.0 子集 (跟 arxiv 1:1 XML 协议, 不引 cheerio 省 dep).
 * - add: feedUrl
 * - list: 列所有 subs
 * - fetchNew: 走 fetcher 拉每条 feed, 写 entries/<host>/<id>.md
 * - read: entryId → 返 body
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读网络 + 写本地).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type Fetcher = (url: string) => Promise<string>;
const defaultFetcher: Fetcher = async () => { throw new Error('blogwatcher: no fetcher'); };

export interface BlogSub {
  feedUrl: string;
  host: string;
  addedAt: number;
}

export interface BlogwatcherOptions {
  rootDir: string;
  fetcher?: Fetcher;
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return 'unknown'; }
}

function parseRss(xml: string): Array<{ id: string; title: string; link: string; body: string }> {
  const items = xml.split(/<item>/).slice(1);
  return items.map(block => {
    const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '').trim();
    const body = (block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '').trim();
    const rawSlug = link.split('/').filter(Boolean).pop() ?? Math.random().toString(36).slice(2, 8);
    const slug = String(rawSlug).replace(/[^\w-]/g, '_');
    return { id: slug, title, link, body };
  });
}

export class BlogwatcherTool implements Tool {
  readonly name = 'blogwatcher' as ToolName;
  readonly description = 'Watch RSS/Atom feeds: add / list / fetchNew / read. Persists to subs.json + entries/. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'blogwatcher action', enum: ['add', 'list', 'fetchNew', 'read'] },
      feedUrl: { type: 'string', description: 'RSS/Atom feed URL (add action)' },
      entryId: { type: 'string', description: 'host/slug (read action)' },
    },
    required: ['action'],
  };

  private readonly rootDir: string;
  private readonly fetcher: Fetcher;
  constructor(opts: BlogwatcherOptions) {
    this.rootDir = opts.rootDir;
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  private get subsPath() { return join(this.rootDir, 'blogwatcher', 'subs.json'); }
  private get entriesDir() { return join(this.rootDir, 'blogwatcher', 'entries'); }

  private async loadSubs(): Promise<BlogSub[]> {
    try {
      return JSON.parse(await fs.readFile(this.subsPath, 'utf8')) as BlogSub[];
    } catch { return []; }
  }
  private async saveSubs(subs: BlogSub[]): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'blogwatcher'), { recursive: true });
    await fs.writeFile(this.subsPath, JSON.stringify(subs, null, 2), 'utf8');
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'add': {
          const url = input['feedUrl'];
          if (typeof url !== 'string') return { success: false, content: '', error: 'invalid-input: feedUrl required' };
          const subs = await this.loadSubs();
          if (subs.some(s => s.feedUrl === url)) return { success: true, content: `already subscribed: ${url}` };
          subs.push({ feedUrl: url, host: hostOf(url), addedAt: Date.now() });
          await this.saveSubs(subs);
          return { success: true, content: `added ${url}` };
        }
        case 'list': {
          const subs = await this.loadSubs();
          return { success: true, content: subs.map(s => `${s.host.padEnd(24)} ${s.feedUrl}`).join('\n') || '(no subs)' };
        }
        case 'fetchNew': {
          const subs = await this.loadSubs();
          let count = 0;
          for (const s of subs) {
            const xml = await this.fetcher(s.feedUrl);
            const items = parseRss(xml);
            const hostDir = join(this.entriesDir, s.host);
            await fs.mkdir(hostDir, { recursive: true });
            for (const it of items) {
              const file = join(hostDir, `${it.id}.md`);
              await fs.writeFile(file, `# ${it.title}\n\n${it.body}\n\n[link](${it.link})\n`, 'utf8');
              count++;
            }
          }
          return { success: true, content: `fetched ${count} entries`, meta: { count } };
        }
        case 'read': {
          const id = input['entryId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: entryId required' };
          const parts = id.split('/');
          const host = parts[0] ?? '';
          const slug = parts[1] ?? id;
          const file = join(this.entriesDir, host, `${slug}.md`);
          const body = await fs.readFile(file, 'utf8');
          return { success: true, content: body };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `blogwatcher error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const blogwatcher = new BlogwatcherTool({
  rootDir: process.env.HOME || process.env.USERPROFILE || '.',
});
