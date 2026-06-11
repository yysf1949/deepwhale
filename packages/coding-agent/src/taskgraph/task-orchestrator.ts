/**
 * TaskOrchestrator — v4.0 Agent OS 编排
 *
 * Orchestrates task execution through the TaskGraph:
 * 1. Receives a Plan from the Planner
 * 2. Creates tasks in the TaskGraph
 * 3. Executes ready tasks in dependency order
 * 4. Updates task status as they complete
 *
 * This is the core Agent OS loop that ties Planner + TaskGraph + Tools together.
 */

import type { LLMClient } from '@deepwhale/llm';
import type { ToolRegistry } from '../tools/registry.js';
import type { SandboxRunner } from '../sandbox/types.js';
import type { ToolPolicy } from '../policy/types.js';
import { createDefaultRegistry } from '../tools/registry.js';
import { runToolLoop, type ToolLoopResult } from '../agent/tool-loop.js';
import { TaskGraphStore, type TaskGraphNode } from './taskgraph.js';
import type { Plan, PlannedTask } from '../planner/planner.js';

export interface OrchestratorOptions {
  readonly client: LLMClient;
  readonly root: string;
  readonly registry?: ToolRegistry;
  readonly sandboxRunner?: SandboxRunner;
  readonly policy?: ToolPolicy;
  readonly signal?: AbortSignal;
  readonly onChunk?: (chunk: { content?: string }) => void;
  readonly maxConcurrent?: number;
}

export interface OrchestratorResult {
  readonly tasks: ReadonlyArray<TaskGraphNode>;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly totalDurationMs: number;
}

/**
 * Execute a plan through the TaskGraph.
 * Creates tasks, then executes them in dependency order.
 */
export async function executePlan(
  plan: Plan,
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const store = new TaskGraphStore({ root: options.root });
  await store.load();

  // Create tasks from plan
  for (const task of plan.tasks) {
    try {
      await store.append({
        id: task.id,
        goal: task.goal,
        dependsOn: [...task.dependsOn],
        status: 'pending',
        source: 'planner',
      });
    } catch {
      // Task may already exist, skip
    }
  }

  const registry = options.registry ?? createDefaultRegistry({
    ...(options.sandboxRunner ? { sandboxRunner: options.sandboxRunner } : {}),
  });

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  // Execute tasks in dependency order
  const maxIterations = plan.tasks.length * 2; // Safety limit
  for (let i = 0; i < maxIterations; i++) {
    const ready = await store.readyTasks();
    if (ready.length === 0) break;

    for (const task of ready) {
      // Mark as running
      await store.update(task.id, { status: 'running' });

      try {
        // Execute task via tool loop
        const messages = [
          { role: 'system' as const, content: `Execute this task: ${task.goal}` },
        ];

        const loopOptions: import('../agent/tool-loop.js').ToolLoopOptions = {
          registry,
          maxSteps: 10,
          isInteractive: false,
        };
        if (options.signal) loopOptions.signal = options.signal;
        if (options.policy) loopOptions.policy = options.policy;
        if (options.onChunk) loopOptions.onChunk = options.onChunk;

        const result: ToolLoopResult = await runToolLoop(
          options.client,
          messages,
          loopOptions,
        );

        // Check if task succeeded
        if (result.final.finish_reason === 'stop') {
          await store.update(task.id, { status: 'done' });
          completed++;
        } else {
          await store.update(task.id, { status: 'failed' });
          failed++;
        }
      } catch {
        await store.update(task.id, { status: 'failed' });
        failed++;
      }
    }
  }

  const tasks = await store.list();
  return {
    tasks,
    completed,
    failed,
    skipped,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Get orchestration status for a task graph.
 */
export async function getOrchestrationStatus(root: string): Promise<{
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  ready: number;
}> {
  const store = new TaskGraphStore({ root });
  await store.load();
  const tasks = await store.list();
  const ready = await store.readyTasks();

  return {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    running: tasks.filter((t) => t.status === 'running').length,
    done: tasks.filter((t) => t.status === 'done').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
    ready: ready.length,
  };
}
