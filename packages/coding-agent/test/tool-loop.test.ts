import { describe, expect, it, vi } from 'vitest';
import {
  isToolLoopError,
  runToolLoop,
  ToolLoopLimitError,
  TOOL_LOOP_DEFAULT_MAX_STEPS,
  type ToolLoopStep,
} from '../src/agent/tool-loop.js';
import { ToolRegistry } from '../src/tools/registry.js';
import type { Tool, ToolResult } from '../src/types.js';
import type { ChatMessage, ChatResult, LLMClient, ModelId, ToolCall } from '@deepwhale/llm';

// ---- mock LLM ----

function mockClient(responses: ReadonlyArray<ChatResult>): LLMClient {
  let idx = 0;
  return {
    model: 'mock' as ModelId,
    chat: vi.fn(async (): Promise<ChatResult> => {
      const r = responses[idx];
      if (!r) throw new Error(`mockClient: no response at index ${idx}`);
      idx += 1;
      return r;
    }),
  } as LLMClient;
}

function okResult(content: string, toolCalls: ReadonlyArray<ToolCall> = []): ChatResult {
  const r: ChatResult = {
    model: 'mock' as ModelId,
    content,
    finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
  };
  if (toolCalls.length > 0) r.tool_calls = toolCalls;
  return r;
}

function tc(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id, name, args };
}

// ---- mock tool ----

function echoTool(): Tool {
  return {
    name: 'echo',
    description: 'returns args.text',
    risk: 'low',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'text to echo' },
      },
      required: ['text'],
    },
    execute: vi.fn(async (input): Promise<ToolResult> => {
      const text = String(input['text'] ?? '');
      return { success: true, content: text };
    }),
  };
}

function failingTool(): Tool {
  return {
    name: 'fail_tool',
    description: 'always fails',
    risk: 'medium',
    schema: { type: 'object', properties: {} },
    execute: async (): Promise<ToolResult> => ({
      success: false,
      content: '',
      error: 'intentional failure',
    }),
  };
}

// ---- tests ----

describe('runToolLoop', () => {
  it('returns final result when LLM does not call any tool', async () => {
    const client = mockClient([okResult('hello world')]);
    const reg = new ToolRegistry();
    reg.register(echoTool());

    const result = await runToolLoop(client, [], { registry: reg });
    expect(result.final.content).toBe('hello world');
    expect(result.final.finish_reason).toBe('stop');
    expect(result.steps.filter((s) => s.kind === 'tool')).toHaveLength(0);
    expect(result.messages).toHaveLength(1); // [assistant(stop)]
  });

  it('calls tool and feeds result back to LLM (single round-trip)', async () => {
    // 1st LLM call: emit tool_call to echo
    // 2nd LLM call: terminal reply
    const client = mockClient([
      okResult('', [tc('call_1', 'echo', { text: 'ping' })]),
      okResult('done: ping'),
    ]);
    const reg = new ToolRegistry();
    const echo = echoTool();
    reg.register(echo);

    const result = await runToolLoop(client, [], { registry: reg });
    expect(result.final.content).toBe('done: ping');
    expect(result.steps.filter((s) => s.kind === 'tool')).toHaveLength(1);
    expect(result.messages).toHaveLength(3); // assistant(tool_calls) + tool + assistant(stop)
  });

  it('continues loop after tool failure (tool error becomes tool message content)', async () => {
    const client = mockClient([
      okResult('', [tc('call_1', 'fail_tool')]),
      okResult('got the error'),
    ]);
    const reg = new ToolRegistry();
    reg.register(failingTool());

    const result = await runToolLoop(client, [], { registry: reg });
    expect(result.final.content).toBe('got the error');
    const toolStep = result.steps.find(
      (s): s is ToolLoopStep & { kind: 'tool' } => s.kind === 'tool',
    );
    expect(toolStep).toBeDefined();
    expect(toolStep?.result.success).toBe(false);
  });

  it('throws ToolLoopLimitError when LLM keeps calling tools (max steps reached)', async () => {
    // 每次都调 echo，永远不收敛
    const infiniteEcho = (): ChatResult =>
      okResult('', [tc(`call_${Math.random()}`, 'echo', { text: 'loop' })]);
    const responses: ChatResult[] = [];
    for (let i = 0; i < TOOL_LOOP_DEFAULT_MAX_STEPS + 1; i += 1) {
      responses.push(infiniteEcho());
    }
    const client = mockClient(responses);
    const reg = new ToolRegistry();
    reg.register(echoTool());

    await expect(runToolLoop(client, [], { registry: reg, maxSteps: 3 })).rejects.toBeInstanceOf(
      ToolLoopLimitError,
    );
    expect(isToolLoopError(new ToolLoopLimitError(3, okResult('')))).toBe(true);
  });

  it('handles unknown tool name gracefully (returns tool-not-found error in tool message)', async () => {
    const client = mockClient([
      okResult('', [tc('call_1', 'unknown_tool', { x: 1 })]),
      okResult('recovered'),
    ]);
    const reg = new ToolRegistry();
    reg.register(echoTool()); // 只有 echo,没有 unknown_tool

    const result = await runToolLoop(client, [], { registry: reg });
    expect(result.final.content).toBe('recovered');
    const toolStep = result.steps.find(
      (s): s is ToolLoopStep & { kind: 'tool' } => s.kind === 'tool',
    );
    expect(toolStep?.result.success).toBe(false);
    expect(toolStep?.result.error).toMatch(/tool-not-found/);
  });

  it('passes tools array to LLMClient.chat with tool_choice=auto', async () => {
    const chatMock = vi.fn(async (): Promise<ChatResult> => okResult('done'));
    const client: LLMClient = {
      model: 'mock' as ModelId,
      chat: chatMock as LLMClient['chat'],
    };
    const reg = new ToolRegistry();
    reg.register(echoTool());

    await runToolLoop(client, [], { registry: reg });
    expect(chatMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        tool_choice: 'auto',
        tools: expect.arrayContaining([expect.objectContaining({ name: 'echo' })]),
      }),
    );
  });

  it('onChunk callback receives streamed content delta', async () => {
    // Note: runToolLoop uses non-streaming client.chat by default.
    // This test verifies that when onChunk is provided, stream() path is used.
    // We mock stream() to verify the call shape.
    const streamMock = vi.fn(async (): Promise<ChatResult> => okResult('streamed'));
    const client: LLMClient = {
      model: 'mock' as ModelId,
      chat: vi.fn(async (): Promise<ChatResult> => okResult('should-not-be-called')),
      stream: streamMock as LLMClient['stream'],
    };
    const reg = new ToolRegistry();
    reg.register(echoTool());
    const chunks: string[] = [];

    await runToolLoop(client, [], {
      registry: reg,
      onChunk: (c) => {
        if (c.content) chunks.push(c.content);
      },
    });
    expect(streamMock).toHaveBeenCalled();
  });

  it('preserves input messages (does not mutate caller array)', async () => {
    const client = mockClient([okResult('hi')]);
    const reg = new ToolRegistry();
    reg.register(echoTool());
    const original: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    const snapshot = JSON.parse(JSON.stringify(original));
    await runToolLoop(client, original, { registry: reg });
    expect(original).toEqual(snapshot);
  });
});
