/**
 * @deepwhale/coding-agent — Session index FTS5 升级 (D-30.3.2, 2026-06-07).
 *                                  D-31.2.5 加 index(entry, content) (2026-06-08).
 *
 * 拍板 (D-30.3): JSON 兜底 (D-30.1δ.10) → FTS5 sql.js (纯 JS, 0 native dep).
 *   1:1 API 兼容 (list/add/remove/search), schema 跟 better-sqlite3 一致.
 *   search 走 FTS5 MATCH 表达式, 支持多 token AND.
 * - 文件: ~/.deepwhale/sessions.db (FTS5 virtual table sessions)
 * - 列: id UNINDEXED, path UNINDEXED, first_user UNINDEXED,
 *        message_count UNINDEXED, created_at UNINDEXED, content (FTS5 indexed)
 * 拍板 (D-31.2.5, 2026-06-08): 加 init() + index(entry, content) 跟 D-31.2 llm-wiki
 *   1:1 协议.  add() 保持原 firstUser-stuff 入 content 行为 (D-30.3.2 backward
 *   compat), index() 走新语义: firstUser 只填 first_user 列, content 走真 message
 *   body.  0 改业务, 5 红线 0 触碰.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js-fts5';

export interface SessionEntry {
  id: string;
  path: string;
  messageCount: number;
  firstUser: string;
  createdAt: number;
}

type SqlDatabase = {
  exec(sql: string): void;
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
      // sql.js-fts5 走 Emscripten, 启动时 fetch WASM. Node 24 上 fetch 不吃
      // Windows 路径 / file:// URL, 最稳的办法: 启动前读 WASM 进
      // `wasmBinary` (Uint8Array), Emscripten 看到预加载就跳过 fetch 走 jb().
      const wasmPath = require.resolve(`sql.js-fts5/dist/sql-wasm.wasm`);
      const wasmBytes = await fs.readFile(wasmPath);
      // Emscripten wasmBinary 类型声明是 ArrayBuffer, 但实际接受 Uint8Array
      // (Emscripten runtime 内部 ArrayBuffer.isView 检查). cast 走类型.
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

export class SessionIndex {
  private db: SqlDatabase | null = null;

  constructor(private readonly rootDir: string) {}

  private get dbPath(): string {
    return join(this.rootDir, 'sessions.db');
  }

  /**
   * D-31.2.5 (2026-06-08): 显式 init — 跟 llm-wiki 1:1 协议. 预热 sql.js
   * WASM, 打开 sessions.db (无则创建 + 建 schema). 业务调用 index() 之前必
   * 须先 await init().  D-30.3.2 隐式 lazy init (ensureDb) 保留以维持 add()
   *   1:1 backward compat.
   */
  async init(): Promise<void> {
    await this.ensureDb();
  }

  private async ensureDb(): Promise<SqlDatabase> {
    if (this.db) return this.db;
    const SQL = await getSQL();
    let data: Uint8Array | undefined;
    try {
      const buf = await fs.readFile(this.dbPath);
      data = new Uint8Array(buf);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await fs.mkdir(this.rootDir, { recursive: true });
    this.db = data ? new SQL.Database(data) : new SQL.Database();
    this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS sessions USING fts5(
      id UNINDEXED,
      path UNINDEXED,
      first_user UNINDEXED,
      message_count UNINDEXED,
      created_at UNINDEXED,
      content
    )`);
    return this.db;
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    await fs.writeFile(this.dbPath, Buffer.from(data));
  }

  async list(): Promise<SessionEntry[]> {
    const db = await this.ensureDb();
    const stmt = db.prepare(
      `SELECT id, path, first_user, message_count, created_at FROM sessions ORDER BY created_at DESC`,
    );
    const results: SessionEntry[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: String(row['id'] ?? ''),
        path: String(row['path'] ?? ''),
        firstUser: String(row['first_user'] ?? ''),
        messageCount: Number(row['message_count'] ?? 0),
        createdAt: Number(row['created_at'] ?? 0),
      });
    }
    stmt.free();
    return results;
  }

  async add(entry: SessionEntry): Promise<void> {
    const db = await this.ensureDb();
    // remove existing same-id row, then insert (upsert 语义)
    const del = db.prepare(`DELETE FROM sessions WHERE id = ?`);
    del.bind([entry.id]);
    while (del.step()) {
      /* drain */
    }
    del.free();
    db.run(
      `INSERT INTO sessions (id, path, first_user, message_count, created_at, content) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.path,
        entry.firstUser,
        entry.messageCount,
        entry.createdAt,
        entry.firstUser,
      ],
    );
    await this.persist();
  }

  /**
   * D-31.2.5 (2026-06-08): 显式 content column 索引. 跟 add() 1:1 协议但
   *   content 走真 message body (add() 走 firstUser, backward compat).
   *   用途: caller 已读 session JSONL 拿到 message[].text, 直接传进 content
   *   让 search 跨 message 全文命中.  firstUser + content 拼一起入 FTS5 列
   *   维持 D-30.3.2 backward compat (title 仍能命中).
   */
  async index(entry: SessionEntry, content: string): Promise<void> {
    const db = await this.ensureDb();
    const del = db.prepare(`DELETE FROM sessions WHERE id = ?`);
    del.bind([entry.id]);
    while (del.step()) {
      /* drain */
    }
    del.free();
    db.run(
      `INSERT INTO sessions (id, path, first_user, message_count, created_at, content) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.path,
        entry.firstUser,
        entry.messageCount,
        entry.createdAt,
        `${entry.firstUser}\n${content}`,
      ],
    );
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    const db = await this.ensureDb();
    db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
    await this.persist();
  }

  async search(query: string): Promise<SessionEntry[]> {
    const db = await this.ensureDb();
    const trimmed = query.trim();
    if (trimmed.length === 0) return this.list();
    // FTS5 MATCH 表达式 — token 之间 AND (FTS5 默认 OR, 但 user 期望 AND).
    // 简化: 把 query 按空格拆, 每个 token 单独 match, 取交集.
    const tokens = trimmed
      .split(/\s+/)
      .map((t) => t.replace(/["']/g, ''))
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return this.list();

    const conds = tokens.map(() => 'content MATCH ?').join(' AND ');
    const stmt = db.prepare(
      `SELECT id, path, first_user, message_count, created_at FROM sessions WHERE ${conds} ORDER BY created_at DESC`,
    );
    stmt.bind(tokens);
    const results: SessionEntry[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: String(row['id'] ?? ''),
        path: String(row['path'] ?? ''),
        firstUser: String(row['first_user'] ?? ''),
        messageCount: Number(row['message_count'] ?? 0),
        createdAt: Number(row['created_at'] ?? 0),
      });
    }
    stmt.free();
    return results;
  }
}
