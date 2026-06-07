/**
 * D-30.2.6: todo 工具 (list/add/mark_done + JSON 持久化).
 *
 * 拍板 (D-30.2): 走 TodoStore 持久到 ~/.deepwhale/todos/current.json.
 * 跟 memory/skill/cron store 1:1 同形态: 显式 rootDir 注入 (测试用 tmpdir).
 * - action: 'list' | 'add' | 'mark_done'
 * - 0 改业务, 5 红线 0 触碰
 * - risk: low (本地小数据, 跟 skill store 同档)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TodoStore, todo } from '../../src/tools/todo.js';
import type { TodoItem } from '../../src/tools/todo.js';

describe('TodoStore (D-30.2.6)', () => {
  let dir: string;
  let store: TodoStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-todo-'));
    store = new TodoStore(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty', async () => {
    const items = await store.list();
    expect(items).toEqual([]);
  });

  it('adds an item', async () => {
    const item = await store.add('first');
    expect(item.id).toBe('1');
    expect(item.text).toBe('first');
    expect(item.done).toBe(false);
    const items = await store.list();
    expect(items).toHaveLength(1);
  });

  it('appends with incrementing id', async () => {
    await store.add('a');
    const b = await store.add('b');
    expect(b.id).toBe('2');
    const items = await store.list();
    expect(items.map((i: TodoItem) => i.text)).toEqual(['a', 'b']);
  });

  it('marks done by id', async () => {
    await store.add('a');
    await store.add('b');
    await store.markDone('1');
    const items = await store.list();
    expect(items[0]?.done).toBe(true);
    expect(items[1]?.done).toBe(false);
  });

  it('persists across instances', async () => {
    await store.add('persist-me');
    const other = new TodoStore(dir);
    const items = await other.list();
    expect(items).toHaveLength(1);
    expect(items[0]?.text).toBe('persist-me');
  });

  it('writes to todos/current.json under root', async () => {
    await store.add('x');
    expect(existsSync(join(dir, 'todos', 'current.json'))).toBe(true);
    const data = readFileSync(join(dir, 'todos', 'current.json'), 'utf8');
    expect(JSON.parse(data)).toHaveLength(1);
  });
});

describe('todo tool (D-30.2.6)', () => {
  it('action=list returns serialized items', async () => {
    const tool = todo;
    // 走 execute 走 store (instance 用 process.cwd() 兜底, 这里直接验 stub)
    const r = await tool.execute({ action: 'list' });
    expect(r.success).toBe(true);
  });
});
