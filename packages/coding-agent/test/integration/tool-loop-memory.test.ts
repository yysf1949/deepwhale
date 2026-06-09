/**
 * tool-loop-memory integration — D-35 cross-session memory.
 *
 * 覆盖 (D-35 验收):
 *   - user_explicit memory 写入: user 消息含 "remember" / "preference" / "always" / "never forget" 关键词
 *   - auto_extracted memory 写入: 成功 tool result 含 "decision" / "preference" / "chose" / "switched to" 关键词
 *   - 0 memory 写入: 不传 memory option
 *
 * 关键不变量 (跟 D-33.7 一致):
 *   - runToolLoop signature 0 改 (5 红线 + v1.0 contract preserved)
 *   - 0 LLM call for memory extraction (deterministic keyword heuristic)
 *   - 0 改 default registry
 */
import { describe, expect, it } from 'vitest';
import { runToolLoopWithMemory, type MemoryStore } from '../../src/agent/tool-loop-memory.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import type { ChatResult, LLMClient, ModelId } from '@deepwhale/llm';

class ScriptedLlm implements LLMClient {
  readonly model = 'scripted-mock' as ModelId;
  private index = 0;
  constructor(private readonly responses: ReadonlyArray<ChatResult>) {}
  async chat(): Promise<ChatResult> {
    const next = this.responses[this.index] ?? this.responses[this.responses.length - 1];
    this.index += 1;
    return next;
  }
  async stream(): Promise<ChatResult> {
    return this.responses[0]!;
  }
}

const stopResult: ChatResult = {
  model: 'scripted-mock' as ModelId,
  content: 'all done',
  finish_reason: 'stop',
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const decisionResult: ChatResult = {
  model: 'scripted-mock' as ModelId,
  content: '',
  finish_reason: 'tool_calls',
  tool_calls: [
    {
      id: '1',
      name: 'bash',
      args: { command: 'echo', args: ['decision: use pnpm for all packages'] },
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

describe('tool-loop-memory integration (D-35)', () => {
  it('records a user_explicit memory when the user message contains "remember"', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const recorded: Array<{ scope: string; source: string; content: string }> = [];
    const memory: MemoryStore = {
      async put({ scope, source, content }) {
        recorded.push({ scope, source, content });
      },
      async archive() {
        /* noop */
      },
      async restore() {
        /* noop */
      },
      async list() {
        return [];
      },
    };
    const result = await runToolLoopWithMemory({
      client: llm,
      messages: [{ role: 'user', content: 'please remember: I prefer Chinese for status messages' }],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      memory,
    });
    expect(recorded).toEqual([
      { scope: 'user', source: 'user_explicit', content: 'please remember: I prefer Chinese for status messages' },
    ]);
    expect(result.memoriesWritten).toBe(1);
  });

  it('records an auto_extracted memory when a tool result mentions "decision"', async () => {
    const llm = new ScriptedLlm([decisionResult, stopResult]);
    const recorded: Array<{ scope: string; source: string; content: string }> = [];
    const memory: MemoryStore = {
      async put({ scope, source, content }) {
        recorded.push({ scope, source, content });
      },
      async archive() {
        /* noop */
      },
      async restore() {
        /* noop */
      },
      async list() {
        return [];
      },
    };
    const result = await runToolLoopWithMemory({
      client: llm,
      messages: [{ role: 'user', content: 'fix the registry test' }],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      memory,
    });
    // The "decision" result should be recorded as session-scope auto_extracted.
    const decisionMemory = recorded.find((m) => m.content.includes('decision'));
    expect(decisionMemory).toEqual({ scope: 'session', source: 'auto_extracted', content: expect.stringContaining('decision') });
    expect(result.memoriesWritten).toBeGreaterThan(0);
  });

  it('returns 0 memories written when no memory option is provided', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const result = await runToolLoopWithMemory({
      client: llm,
      messages: [{ role: 'user', content: 'hello' }],
      registry: createDefaultRegistry(),
      maxSteps: 3,
    });
    expect(result.memoriesWritten).toBe(0);
  });
});
