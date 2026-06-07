/**
 * todo 工具 — TodoList 持久化 + 工具入口 (D-30.2.6, 2026-06-07).
 *
 * 走 TodoStore 持久到 ~/.deepwhale/todos/current.json.
 * 跟 memory / skill / cron store 1:1 同形态: 显式 rootDir 注入 (测试用 tmpdir).
 * - action: 'list' | 'add' | 'mark_done'
 * - 0 改业务, 5 红线 0 触碰
 * - risk: low (本地小数据, 跟 skill store 同档)
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { deepwhaleRoot } from '../util/deepwhale-paths.js';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * TodoStore — ~/.deepwhale/todos/current.json 单文件 store.
 * 跟 MemoryStore / SkillStore / CronStore 1:1 同形态 (显式 rootDir 注入).
 */
export class TodoStore {
  constructor(private readonly rootDir: string) {}

  private get todoPath(): string {
    return join(this.rootDir, 'todos', 'current.json');
  }

  async list(): Promise<TodoItem[]> {
    try {
      const data = await fs.readFile(this.todoPath, 'utf8');
      const parsed = JSON.parse(data) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as TodoItem[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async add(text: string): Promise<TodoItem> {
    const items = await this.list();
    const item: TodoItem = { id: String(items.length + 1), text, done: false };
    items.push(item);
    await this.save(items);
    return item;
  }

  async markDone(id: string): Promise<void> {
    const items = await this.list();
    const item = items.find((i) => i.id === id);
    if (item) {
      item.done = true;
      await this.save(items);
    }
  }

  private async save(items: TodoItem[]): Promise<void> {
    await fs.mkdir(join(this.rootDir, 'todos'), { recursive: true });
    await fs.writeFile(this.todoPath, JSON.stringify(items, null, 2), 'utf8');
  }
}

export class TodoTool implements Tool {
  readonly name = 'todo' as ToolName;
  readonly description =
    'Manage todos (list / add / mark_done). Persisted to ~/.deepwhale/todos/current.json. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform',
        enum: ['list', 'add', 'mark_done'],
      },
      text: { type: 'string', description: 'Todo text (for action=add)' },
      id: { type: 'string', description: 'Todo id (for action=mark_done)' },
    },
    required: ['action'],
  };

  private store(): TodoStore {
    return new TodoStore(deepwhaleRoot());
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const text = input['text'];
    const id = input['id'];

    if (action !== 'list' && action !== 'add' && action !== 'mark_done') {
      return {
        success: false,
        content: '',
        error: 'invalid-input: action must be "list" | "add" | "mark_done"',
      };
    }

    const store = this.store();
    try {
      if (action === 'list') {
        const items = await store.list();
        return {
          success: true,
          content: items.length === 0 ? '(no todos)' : JSON.stringify(items, null, 2),
          meta: { count: items.length, items },
        };
      }
      if (action === 'add') {
        if (typeof text !== 'string' || text.length === 0) {
          return { success: false, content: '', error: 'invalid-input: text is required for add' };
        }
        const item = await store.add(text);
        return {
          success: true,
          content: `added todo #${item.id}: ${item.text}`,
          meta: { item },
        };
      }
      // mark_done
      if (typeof id !== 'string' || id.length === 0) {
        return { success: false, content: '', error: 'invalid-input: id is required for mark_done' };
      }
      await store.markDone(id);
      return {
        success: true,
        content: `marked todo #${id} done`,
        meta: { id },
      };
    } catch (e) {
      return {
        success: false,
        content: '',
        error: `todo error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}

export const todo = new TodoTool();
