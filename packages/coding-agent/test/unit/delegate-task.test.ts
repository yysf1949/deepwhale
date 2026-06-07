/**
 * D-30.3.1: delegate_task 工具 (subagent 并行 max 5).
 *
 * 拍板 (D-30.3): 跟 todo / plan 1:1 同形态 (Tool class, schema JSON object,
 *   ToolResult success/error union). runner 注入 (默认 echo, 单测覆盖并发).
 *   真接 LLM 留 D-30.4 (本批 plan 拍板 stub).
 * - 0 改业务, 5 红线 0 触碰
 * - risk: medium (并行执行可能消耗 token / 副作用)
 */
import { describe, it, expect } from 'vitest';
import { DelegateTaskTool, type SubTaskRunner } from '../../src/tools/delegate-task.js';

describe('DelegateTaskTool (D-30.3.1)', () => {
  it('runs sub-tasks in parallel and joins results', async () => {
    const calls: string[] = [];
    const runner: SubTaskRunner = async (prompt) => {
      calls.push(prompt);
      await new Promise((r) => setTimeout(r, 10));
      return `done:${prompt}`;
    };
    const tool = new DelegateTaskTool(runner);
    const r = await tool.execute({
      tasks: [
        { prompt: 'task 1' },
        { prompt: 'task 2' },
        { prompt: 'task 3' },
      ],
      concurrency: 5,
    });
    expect(r.success).toBe(true);
    expect(r.content).toContain('done:task 1');
    expect(r.content).toContain('done:task 2');
    expect(r.content).toContain('done:task 3');
    expect(calls).toHaveLength(3);
  });

  it('respects concurrency limit (no more than N parallel)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const runner: SubTaskRunner = async (prompt) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return `ok:${prompt}`;
    };
    const tool = new DelegateTaskTool(runner);
    const r = await tool.execute({
      tasks: Array.from({ length: 6 }, (_, i) => ({ prompt: `t${i}` })),
      concurrency: 2,
    });
    expect(r.success).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('caps concurrency at 5 even if user requests more', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const runner: SubTaskRunner = async (prompt) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return `ok:${prompt}`;
    };
    const tool = new DelegateTaskTool(runner);
    const r = await tool.execute({
      tasks: Array.from({ length: 12 }, (_, i) => ({ prompt: `t${i}` })),
      concurrency: 99,
    });
    expect(r.success).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('returns error for empty tasks array', async () => {
    const tool = new DelegateTaskTool(async (p) => p);
    const r = await tool.execute({ tasks: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/tasks/);
    }
  });

  it('captures per-task errors without aborting the batch', async () => {
    const runner: SubTaskRunner = async (prompt) => {
      if (prompt === 'bad') throw new Error('boom');
      return `ok:${prompt}`;
    };
    const tool = new DelegateTaskTool(runner);
    const r = await tool.execute({
      tasks: [{ prompt: 'good' }, { prompt: 'bad' }, { prompt: 'also-good' }],
    });
    expect(r.success).toBe(true);
    expect(r.content).toContain('ok:good');
    expect(r.content).toContain('ok:also-good');
    expect(r.content).toMatch(/\[task 1\] error/);
    expect(r.content).toMatch(/boom/);
  });
});
