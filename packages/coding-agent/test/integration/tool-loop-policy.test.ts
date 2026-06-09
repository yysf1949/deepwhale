import { describe, expect, it } from 'vitest';
import { runToolLoopWithReview, type Reviewer, type TaskGraphRecorder } from '../../src/agent/tool-loop-policy.js';
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
});
