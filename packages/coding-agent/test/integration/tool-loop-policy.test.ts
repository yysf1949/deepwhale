import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runToolLoopWithReview, type Planner, type Reviewer, type TaskGraphRecorder } from '../../src/agent/tool-loop-policy.js';
import { PersistingTaskGraphRecorder } from '../../src/agent/persisting-task-graph-recorder.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import type { ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';

class ScriptedLlm implements LLMClient {
  readonly model = 'scripted-mock' as ModelId;
  private index = 0;
  constructor(private readonly responses: ReadonlyArray<ChatResult>) {}
  async chat(_messages: ReadonlyArray<ChatMessage>): Promise<ChatResult> {
    const next = this.responses[this.index] ?? this.responses[this.responses.length - 1];
    this.index += 1;
    return next;
  }
  async stream(): Promise<ChatResult> {
    return this.responses[0]!;
  }
}

function makeUsage(): NonNullable<ChatResult['usage']> {
  return { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
}

const stopResult: ChatResult = {
  model: 'scripted-mock' as ModelId,
  content: 'all done',
  finish_reason: 'stop',
  usage: makeUsage(),
};

const toolCallResult: ChatResult = {
  model: 'scripted-mock' as ModelId,
  content: '',
  finish_reason: 'tool_calls',
  tool_calls: [{ id: '1', name: 'bash', args: { command: 'echo', args: ['hi'] } }],
  usage: makeUsage(),
};

describe('tool-loop-policy integration', () => {
  it('runs the loop without reviewer or taskGraph and returns the base result', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const result = await runToolLoopWithReview({
      client: llm,
      messages: [],
      registry: createDefaultRegistry(),
      maxSteps: 3,
    });
    expect(result.toolCallsRecorded).toBe(0);
    expect(result.review).toBeUndefined();
    expect(result.final.content).toBe('all done');
  });

  it('invokes the reviewer with default gates after the loop and reports the verdict', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const seenCommands: string[] = [];
    const reviewer: Reviewer = {
      async review({ commands }) {
        seenCommands.push(...commands);
        return {
          status: 'approve',
          details: commands.map((c) => ({ command: c, exitCode: 0, stdout: '', stderr: '' })),
        };
      },
    };
    const result = await runToolLoopWithReview({
      client: llm,
      messages: [],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      reviewer,
    });
    expect(seenCommands).toEqual(['pnpm typecheck', 'pnpm lint', 'pnpm test']);
    expect(result.review?.status).toBe('approve');
  });

  it('passes custom review gates through to the reviewer', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const seen: string[] = [];
    const reviewer: Reviewer = {
      async review({ commands }) {
        seen.push(...commands);
        return { status: 'request_changes', details: [] };
      },
    };
    await runToolLoopWithReview({
      client: llm,
      messages: [],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      reviewer,
      reviewGates: ['git diff --check'],
    });
    expect(seen).toEqual(['git diff --check']);
  });

  it('records tool invocations into the task graph and reports the count', async () => {
    const llm = new ScriptedLlm([toolCallResult, stopResult]);
    const recorded: string[] = [];
    const taskGraph: TaskGraphRecorder = {
      async recordToolCall(input) {
        recorded.push(input.toolName);
      },
      async recordGoal(_goal) {
        /* noop */
      },
    };
    const result = await runToolLoopWithReview({
      client: llm,
      messages: [],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      taskGraph,
    });
    expect(recorded).toEqual(['bash']);
    expect(result.toolCallsRecorded).toBe(1);
  });

  it('records the latest user goal into the task graph when provided', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const recordedGoals: string[] = [];
    const taskGraph: TaskGraphRecorder = {
      async recordToolCall() {
        /* noop */
      },
      async recordGoal(goal) {
        recordedGoals.push(goal);
      },
    };

    await runToolLoopWithReview({
      client: llm,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'first goal' },
        { role: 'assistant', content: 'ack' },
        { role: 'user', content: 'ship D75 task graph evidence' },
      ],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      taskGraph,
    });

    expect(recordedGoals).toEqual(['ship D75 task graph evidence']);
  });

  it('calls planner.plan with the latest user goal and records the resulting tasks into the task graph (D-77)', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const plannedGoals: string[] = [];
    const planner: Planner = {
      async plan({ goal }) {
        plannedGoals.push(goal);
        return { tasks: [{ id: 'p-0', goal, dependsOn: [] }] };
      },
      async callTool() {
        throw new Error('planner cannot call tools');
      },
    };
    const recordedPlans: Array<{ id: string; goal: string }> = [];
    const taskGraph: TaskGraphRecorder & {
      recordPlan: (input: { tasks: ReadonlyArray<{ id: string; goal: string }> }) => Promise<void>;
    } = {
      async recordToolCall() {
        /* noop */
      },
      async recordGoal() {
        /* noop */
      },
      async recordPlan(input) {
        recordedPlans.push(...input.tasks);
      },
    };

    await runToolLoopWithReview({
      client: llm,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'ship D77 planner evidence' },
      ],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      planner,
      taskGraph,
    });

    expect(plannedGoals).toEqual(['ship D77 planner evidence']);
    expect(recordedPlans).toEqual([{ id: 'p-0', goal: 'ship D77 planner evidence' }]);
  });

  it('passes task graph records across separate recorder instances pointing at the same file (D-80 cross-session)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tool-loop-policy-d80-'));
    const file = join(dir, 'task-graph.jsonl');
    try {
      // Instance A: fresh recorder, run one tool loop, record goal + 1 tool call.
      const recorderA = new PersistingTaskGraphRecorder({ file });
      await recorderA.load();
      const llmA = new ScriptedLlm([toolCallResult, stopResult]);
      await runToolLoopWithReview({
        client: llmA,
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'D-80 cross-session goal from instance A' },
        ],
        registry: createDefaultRegistry(),
        maxSteps: 3,
        taskGraph: recorderA,
      });

      // After A's run, the file should contain a goal + 1 tool call.
      expect(recorderA.getGoals().map((g) => g.goal)).toEqual(['D-80 cross-session goal from instance A']);
      expect(recorderA.getToolCalls().map((t) => t.toolName)).toEqual(['bash']);

      // Instance B: fresh recorder from the same file. After load(), B sees A's records.
      const recorderB = new PersistingTaskGraphRecorder({ file });
      await recorderB.load();
      expect(recorderB.getGoals().map((g) => g.goal)).toEqual(['D-80 cross-session goal from instance A']);
      expect(recorderB.getToolCalls().map((t) => t.toolName)).toEqual(['bash']);

      // B runs a second tool loop; both A's and B's records survive in B's view.
      const llmB = new ScriptedLlm([toolCallResult, stopResult]);
      await runToolLoopWithReview({
        client: llmB,
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'D-80 second goal from instance B' },
        ],
        registry: createDefaultRegistry(),
        maxSteps: 3,
        taskGraph: recorderB,
      });
      expect(recorderB.getGoals().map((g) => g.goal)).toEqual([
        'D-80 cross-session goal from instance A',
        'D-80 second goal from instance B',
      ]);
      expect(recorderB.getToolCalls().map((t) => t.toolName)).toEqual(['bash', 'bash']);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });
});
