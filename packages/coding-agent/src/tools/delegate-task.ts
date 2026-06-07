/**
 * delegate_task 工具 — subagent 并行编排 (D-30.3.1, 2026-06-07).
 *
 * 拍板 (D-30.3): 跟 todo / plan 1:1 同形态 (Tool class, schema JSON object,
 *   ToolResult success/error union). runner 注入 (默认 echo, 单测覆盖并发).
 *   真接 LLM 留 D-30.4 (本批 plan 拍板 stub).
 * - tasks: { prompt, model? }[] 必传
 * - concurrency: 1..5, 默认 3, >5 强制 cap 5
 * - 单条 sub-task 失败不中断 batch, 标 [error:idx]
 * - 0 改业务, 5 红线 0 触碰
 * - risk: medium (并行执行可能消耗 token / 副作用)
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

/** 注入的 sub-task 执行器 — 默认 echo, 单测覆盖并发. */
export type SubTaskRunner = (prompt: string, model: string) => Promise<string>;

const defaultRunner: SubTaskRunner = async (prompt, model) =>
  `[${model}] ${prompt}`;

export interface SubTask {
  prompt: string;
  model?: string;
}

export class DelegateTaskTool implements Tool {
  readonly name = 'delegate_task' as ToolName;
  readonly description =
    'Run sub-tasks in parallel subagents (max concurrency 5). Single-task errors are captured, not raised. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Array of { prompt: string, model?: string } sub-tasks',
        items: {
          type: 'string',
          description: 'JSON-encoded sub-task ({"prompt":"...","model":"..."})',
        },
      },
      concurrency: {
        type: 'number',
        description: 'Max parallel sub-tasks (1..5, default 3, capped at 5)',
      },
    },
    required: ['tasks'],
  };

  constructor(private readonly runner: SubTaskRunner = defaultRunner) {}

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const tasks = input['tasks'];
    const rawConcurrency = input['concurrency'];

    if (!Array.isArray(tasks)) {
      return { success: false, content: '', error: 'invalid-input: tasks must be an array' };
    }
    if (tasks.length === 0) {
      return { success: false, content: '', error: 'invalid-input: tasks must not be empty' };
    }

    let limit = 3;
    if (typeof rawConcurrency === 'number' && Number.isFinite(rawConcurrency) && rawConcurrency >= 1) {
      limit = Math.floor(rawConcurrency);
    }
    if (limit > 5) limit = 5;

    const lines: string[] = [];
    for (let i = 0; i < tasks.length; i += limit) {
      const chunk = tasks.slice(i, i + limit) as SubTask[];
      const chunkResults = await Promise.all(
        chunk.map(async (t, j) => {
          const idx = i + j;
          const prompt = typeof t.prompt === 'string' ? t.prompt : '';
          const model = typeof t.model === 'string' && t.model.length > 0 ? t.model : 'default';
          if (prompt.length === 0) {
            return `[task ${idx}] error: invalid-input: prompt is required`;
          }
          try {
            const out = await this.runner(prompt, model);
            return `[task ${idx}] ok: ${out}`;
          } catch (e) {
            return `[task ${idx}] error: ${e instanceof Error ? e.message : String(e)}`;
          }
        }),
      );
      lines.push(...chunkResults);
    }
    return {
      success: true,
      content: lines.join('\n'),
      meta: { count: tasks.length, concurrency: limit },
    };
  }
}

export const delegateTask = new DelegateTaskTool();
