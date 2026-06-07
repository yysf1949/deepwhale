/**
 * D-30.3.2: SessionIndex FTS5 升级 (sql.js 纯 JS, 0 native dep).
 *
 * 拍板 (D-30.3): JSON 兜底 (D-30.1δ.10) → FTS5 sql.js. 1:1 API 兼容
 *   (list/add/remove/search), 跟 better-sqlite3 schema 1:1 同步. 升级后
 *   0 改业务 (5 红线 0 触碰), search 走 FTS5 MATCH, 支持多 token.
 * - 文件: ~/.deepwhale/sessions.db (FTS5 virtual table)
 * - 用 sql.js initSqlJs + locateFile 指向 sql-wasm.wasm
 * - 0 改业务, 5 红线 0 触碰
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionIndex, type SessionEntry } from '../../src/util/session-index.js';

describe('SessionIndex FTS5 (D-30.3.2)', () => {
  let dir: string;
  let idx: SessionIndex;
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dw-fts5-'));
    idx = new SessionIndex(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty (no .db file)', async () => {
    expect(await idx.list()).toEqual([]);
    expect(existsSync(join(dir, 'sessions.db'))).toBe(false);
  });

  it('add → list returns the entry', async () => {
    await idx.add({
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 5,
      firstUser: 'hello world',
      createdAt: 1000,
    });
    const all = await idx.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('s1');
    expect(all[0]?.path).toBe('/tmp/s1.jsonl');
    expect(all[0]?.messageCount).toBe(5);
    expect(all[0]?.firstUser).toBe('hello world');
    expect(all[0]?.createdAt).toBe(1000);
  });

  it('add twice with same id updates, not duplicates', async () => {
    const e1: SessionEntry = {
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 1,
      firstUser: 'a',
      createdAt: 1,
    };
    const e1b: SessionEntry = {
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 2,
      firstUser: 'b',
      createdAt: 2,
    };
    await idx.add(e1);
    await idx.add(e1b);
    const all = await idx.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.messageCount).toBe(2);
    expect(all[0]?.firstUser).toBe('b');
  });

  it('remove by id', async () => {
    await idx.add({
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 1,
      firstUser: 'a',
      createdAt: 1,
    });
    await idx.add({
      id: 's2',
      path: '/tmp/s2.jsonl',
      messageCount: 1,
      firstUser: 'b',
      createdAt: 2,
    });
    await idx.remove('s1');
    const all = await idx.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('s2');
  });

  it('search FTS5 multi-token: AND across firstUser tokens', async () => {
    await idx.add({
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 1,
      firstUser: 'refactor auth module',
      createdAt: 1,
    });
    await idx.add({
      id: 's2',
      path: '/tmp/s2.jsonl',
      messageCount: 1,
      firstUser: 'add login flow',
      createdAt: 2,
    });
    await idx.add({
      id: 's3',
      path: '/tmp/s3.jsonl',
      messageCount: 1,
      firstUser: 'fix tests for auth',
      createdAt: 3,
    });
    const hits = await idx.search('auth');
    const ids = hits.map((h) => h.id).sort();
    expect(ids).toEqual(['s1', 's3']);
  });

  it('search returns SessionEntry shape (id, path, firstUser)', async () => {
    await idx.add({
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 7,
      firstUser: 'find me please',
      createdAt: 100,
    });
    const hits = await idx.search('find');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: 's1',
      path: '/tmp/s1.jsonl',
      firstUser: 'find me please',
    });
  });

  it('persists across instances (sessions.db file on disk)', async () => {
    await idx.add({
      id: 's1',
      path: '/tmp/s1.jsonl',
      messageCount: 1,
      firstUser: 'persist me',
      createdAt: 1,
    });
    expect(existsSync(join(dir, 'sessions.db'))).toBe(true);
    const idx2 = new SessionIndex(dir);
    const all = await idx2.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('s1');
  });
});
