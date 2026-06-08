/**
 * llm-wiki 工具 — Karpathy LLM Wiki 协议 (D-31.2.3, 2026-06-08).
 *
 * 拍板: 走 sql.js-fts5 (跟 D-30.3.2 session-index 1:1 协议, 0 native dep, FTS5).
 *   persist `~/.deepwhale/wiki.db`. Schema:
 *     pages(id PK, title, content)
 *     pages_fts (FTS5 virtual table on title + content)
 *     links(from_id, to_id)
 * - addPage: title + content
 * - link: from + to
 * - query: full-text search → 命中 pages
 * - list: 列所有 pages
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (本地 IO).
 */

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js-fts5';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

type SqlDatabase = {
  exec(sql: string, params?: unknown[]): { columns: string[]; values: unknown[][] }[];
  run(sql: string, params?: unknown[]): void;
  prepare(sql: string): SqlStatement;
  export(): Uint8Array;
  close(): void;
};

type SqlStatement = {
  bind(params?: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
};

type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => SqlDatabase;
};

let SQL_PROMISE: Promise<SqlJsStatic> | null = null;

async function getSQL(): Promise<SqlJsStatic> {
  if (!SQL_PROMISE) {
    SQL_PROMISE = (async () => {
      const require = createRequire(import.meta.url);
      const initFn = (initSqlJs as unknown as { default?: typeof initSqlJs }).default ?? initSqlJs;
      const wasmPath = require.resolve(`sql.js-fts5/dist/sql-wasm.wasm`);
      const wasmBytes = await fs.readFile(wasmPath);
      const wasmBinary = wasmBytes.buffer.slice(
        wasmBytes.byteOffset,
        wasmBytes.byteOffset + wasmBytes.byteLength,
      ) as ArrayBuffer;
      return (await initFn({
        wasmBinary,
        locateFile: (file: string) => file,
      })) as SqlJsStatic;
    })();
  }
  return SQL_PROMISE;
}

export interface LlmWikiOptions {
  dbPath: string;
}

export class LlmWikiTool implements Tool {
  readonly name = 'llm_wiki' as ToolName;
  readonly description = 'Local LLM-wiki (Karpathy protocol): addPage / link / query / list. sql.js-fts5 full-text. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'wiki action', enum: ['addPage', 'link', 'query', 'list'] },
      title: { type: 'string', description: 'page title (addPage action)' },
      content: { type: 'string', description: 'page content (addPage action)' },
      from: { type: 'string', description: 'source page title (link action)' },
      to: { type: 'string', description: 'target page title (link action)' },
      query: { type: 'string', description: 'full-text search query (query action)' },
    },
    required: ['action'],
  };

  private readonly dbPath: string;
  private db: SqlDatabase | null = null;

  constructor(opts: LlmWikiOptions) {
    this.dbPath = opts.dbPath;
  }

  async init(): Promise<void> {
    if (this.db) return;
    const SQL = await getSQL();
    let data: Uint8Array | undefined;
    try {
      const buf = await fs.readFile(this.dbPath);
      data = new Uint8Array(buf);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await fs.mkdir(dirname(this.dbPath), { recursive: true });
    this.db = data ? new SQL.Database(data) : new SQL.Database();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(title, content, content='pages', content_rowid='id');
      CREATE TABLE IF NOT EXISTS links (from_id INTEGER, to_id INTEGER, PRIMARY KEY(from_id, to_id));
      CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN INSERT INTO pages_fts(rowid, title, content) VALUES (new.id, new.title, new.content); END;
      CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content); END;
    `);
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    await fs.writeFile(this.dbPath, Buffer.from(data));
  }

  private pageId(title: string): number | null {
    if (!this.db) return null;
    const r = this.db.exec(`SELECT id FROM pages WHERE title = ?`, [title]);
    if (r.length === 0 || r[0]!.values.length === 0) return null;
    return r[0]!.values[0]![0] as number;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    await this.init();
    const action = input['action'];
    try {
      switch (action) {
        case 'addPage': {
          const title = input['title'], content = input['content'];
          if (typeof title !== 'string' || typeof content !== 'string') {
            return { success: false, content: '', error: 'invalid-input: title/content required' };
          }
          this.db!.run(`INSERT INTO pages (title, content) VALUES (?, ?)`, [title, content]);
          await this.persist();
          return { success: true, content: `added page: ${title}`, meta: { id: this.pageId(title) } };
        }
        case 'link': {
          const from = input['from'], to = input['to'];
          if (typeof from !== 'string' || typeof to !== 'string') {
            return { success: false, content: '', error: 'invalid-input: from/to required' };
          }
          const fromId = this.pageId(from), toId = this.pageId(to);
          if (fromId === null || toId === null) return { success: false, content: '', error: 'not-found: one or both pages missing' };
          this.db!.run(`INSERT OR IGNORE INTO links (from_id, to_id) VALUES (?, ?)`, [fromId, toId]);
          await this.persist();
          return { success: true, content: `linked ${from} → ${to}` };
        }
        case 'query': {
          const q = input['query'];
          if (typeof q !== 'string' || q.length === 0) return { success: false, content: '', error: 'invalid-input: query required' };
          const r = this.db!.exec(`SELECT title, content FROM pages_fts WHERE pages_fts MATCH ?`, [q]);
          if (r.length === 0 || !r[0] || r[0].values.length === 0) return { success: true, content: '(no match)' };
          const lines = r[0].values.map((row) => `# ${row[0] ?? ''}\n${row[1] ?? ''}`);
          return { success: true, content: lines.join('\n\n'), meta: { count: r[0].values.length } };
        }
        case 'list': {
          const r = this.db!.exec(`SELECT title FROM pages ORDER BY id`);
          if (r.length === 0 || !r[0] || r[0].values.length === 0) return { success: true, content: '(empty wiki)' };
          return { success: true, content: r[0].values.map((row) => `- ${row[0] ?? ''}`).join('\n') };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `wiki error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const llmWiki = new LlmWikiTool({
  dbPath: join(process.env.HOME || process.env.USERPROFILE || '.', '.deepwhale', 'wiki.db'),
});
