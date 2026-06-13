import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LLMClient, ChatResult, ChatMessage, ModelId } from '@deepwhale/llm';
import type { Tool, ToolName } from '../../src/types.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { executePlan, type OrchestratorResult } from '../../src/taskgraph/task-orchestrator.js';
import type { Plan } from '../../src/planner/planner.js';
import { createMockLLMClient } from './__mocks__/mock-llm-client.js';

function newTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'task-orchestrator-'));
}

function makeSuccessClient(): LLMClient {
  return createMockLLMClient({
    model: 'mock' as ModelId,
    content: 'task done',
    finish_reason: 'stop',
  });
}

function makeRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register({
    name: 'bash' as ToolName,
    description: 'mock tool',
    risk: 'low' as const,
    schema: { type: 'object' as const, properties: {} },
    execute: async () => ({ success: true as const, content: 'ok' }),
  } as Tool);
  return reg;
}

describe('TaskOrchestrator', () => {
  let dir: string;

  beforeEach(() => {
    dir = newTempDir();
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  });

  it('executePlan creates tasks from plan and executes ready ones', async () => {
    const plan: Plan = {
      tasks: [
        { id: 'A', goal: 'first task', dependsOn: [] },
        { id: 'B', goal: 'second task', dependsOn: ['A'] },
        { id: 'C', goal: 'third task', dependsOn: ['B'] },
      ],
    };

    const client = makeSuccessClient();
    const registry = makeRegistry();
    const result: OrchestratorResult = await executePlan(plan, {
      client,
      root: dir,
      registry,
      policy: null,
    });

    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.tasks).toHaveLength(3);
  });

  it('executePlan respects dependency order for independent tasks', async () => {
    const plan: Plan = {
      tasks: [
        { id: 'C', goal: 'independent task C', dependsOn: [] },
        { id: 'D', goal: 'independent task D', dependsOn: [] },
      ],
    };

    const client = makeSuccessClient();
    const registry = makeRegistry();
    const result = await executePlan(plan, {
      client,
      root: dir,
      registry,
      policy: null,
    });

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    const statuses = result.tasks.map((t) => ({ id: t.id, status: t.status }));
    expect(statuses).toEqual([
      { id: 'C', status: 'done' },
      { id: 'D', status: 'done' },
    ]);
  });

  it('executePlan handles task failure gracefully and continues', async () => {
    const plan: Plan = {
      tasks: [
        { id: 'task-a', goal: 'succeed task', dependsOn: [] },
        { id: 'task-b', goal: 'fail task', dependsOn: [] },
      ],
    };

    const client: LLMClient = {
      model: 'mock' as ModelId,
      chat: vi.fn().mockImplementation(async (messages: ChatMessage[]) => {
        const systemMsg = messages.find((m) => m.role === 'system');
        if (systemMsg?.content?.includes('succeed')) {
          return { model: 'mock' as ModelId, content: 'done', finish_reason: 'stop' } as ChatResult;
        }
        throw new Error('LLM task-b failure');
      }),
      stream: vi.fn().mockResolvedValue({ model: 'mock' as ModelId, content: '', finish_reason: 'stop' }),
    } as LLMClient;

    const registry = makeRegistry();
    const result = await executePlan(plan, {
      client,
      root: dir,
      registry,
      policy: null,
    });

    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
    const taskA = result.tasks.find((t) => t.id === 'task-a');
    const taskB = result.tasks.find((t) => t.id === 'task-b');
    expect(taskA?.status).toBe('done');
    expect(taskB?.status).toBe('failed');
  });

  it('OrchestratorResult contains correct counts for mixed outcomes', async () => {
    const plan: Plan = {
      tasks: [
        { id: 'X', goal: 'complete me', dependsOn: [] },
        { id: 'Y', goal: 'complete me too', dependsOn: [] },
        { id: 'Z', goal: 'fail me', dependsOn: [] },
      ],
    };

    const client: LLMClient = {
      model: 'mock' as ModelId,
      chat: vi.fn().mockImplementation(async (messages: ChatMessage[]) => {
        const systemMsg = messages.find((m) => m.role === 'system');
        if (systemMsg?.content?.includes('fail me')) {
          throw new Error('task Z fails');
        }
        return { model: 'mock' as ModelId, content: 'done', finish_reason: 'stop' } as ChatResult;
      }),
      stream: vi.fn().mockResolvedValue({ model: 'mock' as ModelId, content: '', finish_reason: 'stop' }),
    } as LLMClient;

    const registry = makeRegistry();
    const result = await executePlan(plan, {
      client,
      root: dir,
      registry,
      policy: null,
    });

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
