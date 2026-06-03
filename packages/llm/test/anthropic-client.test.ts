/**
 * @deepwhale/llm — AnthropicClient unit tests
 *
 * Sprint 1b.5 Step 2 (D1 拍板 2026-06-03): 用官方 @anthropic-ai/sdk 实例,
 * mock fetch 拦截 SDK HTTP 层 (SDK opts.fetch 注入是设计意图内的 escape hatch).
 *
 * 覆盖 8 tests:
 * 1. constructor: APIKeyMissingError when no key
 * 2. constructor: env ANTHROPIC_AUTH_TOKEN 优先级
 * 3. constructor: env DEEPSEEK_API_KEY 退路
 * 4. chat: parseAnthropicMessage 翻译 text content + finish_reason=stop
 * 5. chat: cache_creation + cache_read 合并到 cached_tokens (B1 拍板)
 * 6. chat: pricing 算 cost_turn + cost_currency USD
 * 7. chat: tool_calls 参数未实现 → LLMUnknownError (1c 留)
 * 8. error mapping: SDK error → LLMUnknownError with cause
 * 9. parseAnthropicUsage: MessageDeltaUsage (无 input_tokens) → 只 output_tokens, cost absent
 * 10. parseAnthropicSseEvent: content_block_delta text_delta → ChatChunk delta.content
 * 11. parseAnthropicSseEvent: message_delta usage → final usage with finish_reason
 * 12. parseAnthropicSseEvent: start/stop event → null (不暴露)
 *
 * X3 拍板: 不**接真**, 不**看**真 key. mock fetch 返 Anthropic-shape fixture.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicClient, parseAnthropicMessage, parseAnthropicUsage, parseAnthropicSseEvent } from '../src/anthropic-client.js';
import { APIKeyMissingError, LLMUnknownError, type ModelId } from '../src/types.js';
import { parsePricingConfig } from '../src/pricing-config.js';

const TEST_KEY = 'test-key-no-real-credentials-12345';

describe('AnthropicClient — constructor + API key resolution', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env['ANTHROPIC_AUTH_TOKEN'];
    delete process.env['DEEPSEEK_API_KEY'];
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('1. constructor: 无 key (env 也没) → APIKeyMissingError', () => {
    expect(() => new AnthropicClient()).toThrow(APIKeyMissingError);
  });

  it('2. constructor: env ANTHROPIC_AUTH_TOKEN 优先 + DEEPSEEK_API_KEY 没设 → 走 anthropic', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = TEST_KEY;
    const client = new AnthropicClient();
    expect(client.model).toBe('claude-sonnet-4-5');
  });

  it('3. constructor: env DEEPSEEK_API_KEY 退路 (ANTHROPIC_AUTH_TOKEN 没设) → 走 anthropic (跟 shim 兼容)', () => {
    process.env['DEEPSEEK_API_KEY'] = TEST_KEY;
    const client = new AnthropicClient();
    expect(client.model).toBe('claude-sonnet-4-5');
  });

  it('4. constructor: 显式 apiKey 优先于 env', () => {
    process.env['ANTHROPIC_AUTH_TOKEN'] = 'env-key';
    const client = new AnthropicClient({ apiKey: TEST_KEY });
    expect(client.model).toBe('claude-sonnet-4-5');
    // SDK 内部持有 apiKey, 我们**不**直接验证 (私有字段), 信任 SDK 自己的 auth 路径
  });
});

describe('parseAnthropicMessage + parseAnthropicUsage (B1 拍板: cache_creation + cache_read 合并)', () => {
  // Sprint 1b.5 P1 pricing 价表 (Sonnet 4.5 USD)
  const pricing = parsePricingConfig(`
[models.claude-sonnet-4-5]
cache_miss_per_m = 3.0
cache_hit_per_m  = 0.30
completion_per_m = 15.0
currency         = "USD"
`);

  it('5. text content + stop_reason=end_turn → finish_reason=stop + content', () => {
    // 这是 Anthropic Message 类型的最小形状, 我们只放 parseAnthropicMessage 用的字段
    const message = {
      id: 'msg_1',
      type: 'message' as const,
      role: 'assistant' as const,
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text' as const, text: 'Hello, world!', citations: null }],
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    };
    const result = parseAnthropicMessage(message, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(result.content).toBe('Hello, world!');
    expect(result.finish_reason).toBe('stop');
    expect(result.model).toBe('claude-sonnet-4-5');
    expect(result.usage?.prompt_tokens).toBe(100);
    expect(result.usage?.completion_tokens).toBe(50);
    expect(result.usage?.cost_currency).toBe('USD');
  });

  it('6. cache_creation + cache_read 合并到 cached_tokens + total_prompt 包含 cache (F4 修正)', () => {
    const message = {
      id: 'msg_1',
      type: 'message' as const,
      role: 'assistant' as const,
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text' as const, text: 'hi', citations: null }],
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_creation_input_tokens: 600, // 新建 cache 600
        cache_read_input_tokens: 200,    // 命中 cache 200
      },
    };
    const result = parseAnthropicMessage(message, 'claude-sonnet-4-5' as ModelId, pricing);
    // F4 修正: total_prompt = input + cache_creation + cache_read = 1000 + 600 + 200 = 1800
    expect(result.usage?.prompt_tokens).toBe(1800);
    // B1: cached = 600 + 200 = 800
    expect(result.usage?.cached_tokens).toBe(800);
    // cache_hit_rate = cached / total_prompt = 800 / 1800 ≈ 0.444
    expect(result.usage?.cache_hit_rate).toBeCloseTo(0.444, 3);
    // F4 保守: cache_creation (Sonnet $3.75/M) 跟 cache_read ($0.30/M) 价格差 12.5×,
    // 1b.5 pricing 不拆 → cost_turn 字段 absent. 留 sprint 2 加 cache_write_per_m 字段.
    expect(result.usage?.cost_turn).toBeUndefined();
    expect(result.usage?.cost_currency).toBeUndefined();
    // tokens_uncached 仍 = input_tokens (不变量: total_prompt - cached)
    expect(result.usage?.tokens_uncached).toBe(1000);
  });

  it('7. cache_creation + cache_read 都 null → cached_tokens absent (无 cache)', () => {
    const message = {
      id: 'msg_1',
      type: 'message' as const,
      role: 'assistant' as const,
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text' as const, text: 'hi', citations: null }],
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    };
    const result = parseAnthropicMessage(message, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(result.usage?.cached_tokens).toBeUndefined();
    // F4: cached=0 (cache_creation + cache_read 都 null) → 走完整 4 字段路径
    expect(result.usage?.cost_currency).toBe('USD');
    // cost: 100/1e6 * 3.0 + 50/1e6 * 15.0 = 0.0003 + 0.00075 = 0.00105
    expect(result.usage?.cost_turn).toBeCloseTo(0.00105, 5);
  });

  it('6b. F4: cache_creation 单独非零 (新建 cache) → cost absent (留 sprint 2)', () => {
    // 1b.5 不拆 cache_write 价, 1b.5 保守: cost_turn absent. 但 cache_hit_rate 仍算
    const message = {
      id: 'msg_1',
      type: 'message' as const,
      role: 'assistant' as const,
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text' as const, text: 'hi', citations: null }],
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 500, // 只 cache_creation
        cache_read_input_tokens: null,
      },
    };
    const result = parseAnthropicMessage(message, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(result.usage?.cached_tokens).toBe(500);
    // total_prompt = 100 + 500 = 600
    expect(result.usage?.prompt_tokens).toBe(600);
    expect(result.usage?.cache_hit_rate).toBeCloseTo(500 / 600, 3);
    // F4 保守: cost 字段 absent
    expect(result.usage?.cost_turn).toBeUndefined();
    expect(result.usage?.cost_currency).toBeUndefined();
  });

  it('8. stop_reason=tool_use → finish_reason=tool_calls (Sprint 1c 实施 tool_calls 翻译)', () => {
    // 1b.5: parseAnthropicMessage 把 stop_reason 翻译对, tool_use block 跳过 (1c 再加)
    const message = {
      id: 'msg_1',
      type: 'message' as const,
      role: 'assistant' as const,
      model: 'claude-sonnet-4-5',
      content: [{ type: 'text' as const, text: 'Using tool', citations: null }],
      stop_reason: 'tool_use' as const,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      },
    };
    const result = parseAnthropicMessage(message, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(result.finish_reason).toBe('tool_calls');
  });

  it('9. parseAnthropicUsage(MessageDeltaUsage) 只有 output_tokens → 不算 cost (流中 delta 事件)', () => {
    // MessageDeltaUsage shape: 只有 output_tokens (无 input_tokens/cache)
    const delta = { output_tokens: 42 };
    const result = parseAnthropicUsage(delta, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(result?.completion_tokens).toBe(42);
    expect(result?.prompt_tokens).toBe(0);
    expect(result?.cost_turn).toBeUndefined();
    expect(result?.cost_currency).toBeUndefined();
  });
});

describe('parseAnthropicSseEvent — 流式 event → ChatChunk 翻译', () => {
  const pricing = parsePricingConfig(`
[models.claude-sonnet-4-5]
cache_miss_per_m = 3.0
cache_hit_per_m  = 0.30
completion_per_m = 15.0
currency         = "USD"
`);

  it('10. content_block_delta text_delta → ChatChunk delta.content', () => {
    const event = {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: 'Hello' },
    };
    const chunk = parseAnthropicSseEvent(event, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(chunk).toEqual({ delta: { content: 'Hello' } });
  });

  it('11. message_delta → final usage + finish_reason', () => {
    // 流末尾 message_delta event: 携带 stop_reason + MessageDeltaUsage (只有 output_tokens)
    const event = {
      type: 'message_delta' as const,
      delta: { stop_reason: 'end_turn' as const, stop_sequence: null },
      usage: { output_tokens: 50 },
    };
    const chunk = parseAnthropicSseEvent(event, 'claude-sonnet-4-5' as ModelId, pricing);
    expect(chunk?.finish_reason).toBe('stop');
    expect(chunk?.usage?.completion_tokens).toBe(50);
    expect(chunk?.usage?.cost_turn).toBeUndefined(); // delta 路径不算 cost
  });

  it('12. start/stop event → null (不暴露给 caller)', () => {
    const messageStart = {
      type: 'message_start' as const,
      message: {
        id: 'msg_1',
        type: 'message' as const,
        role: 'assistant' as const,
        model: 'claude-sonnet-4-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null },
      },
    };
    const messageStop = { type: 'message_stop' as const };
    expect(parseAnthropicSseEvent(messageStart, 'claude-sonnet-4-5' as ModelId, pricing)).toBeNull();
    expect(parseAnthropicSseEvent(messageStop, 'claude-sonnet-4-5' as ModelId, pricing)).toBeNull();
  });
});

describe('AnthropicClient — error mapping (X3 拍板: 不接真, mock fetch 触发 SDK error)', () => {
  it('13. SDK 抛 Error → LLMUnknownError with cause', async () => {
    // Mock fetch 返 401 → SDK 抛 AuthenticationError → 我们包成 LLMUnknownError
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new AnthropicClient({ apiKey: TEST_KEY, fetchImpl: mockFetch as unknown as typeof fetch });
    await expect(
      client.chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(LLMUnknownError);
  });
});

describe('AnthropicClient — tools 暂未实现 (1c 留)', () => {
  it('14. tools 参数传非空数组 → LLMUnknownError', async () => {
    const mockFetch = vi.fn(async () => new Response('', { status: 200 }));
    const client = new AnthropicClient({ apiKey: TEST_KEY, fetchImpl: mockFetch as unknown as typeof fetch });
    await expect(
      client.chat(
        [{ role: 'user', content: 'hi' }],
        { tools: [{ name: 'x', description: 'y', parameters: { type: 'object', properties: {} } }] },
      ),
    ).rejects.toThrow(LLMUnknownError);
  });
});
