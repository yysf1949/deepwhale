/**
 * DeepSeekClient 单测 — 100% mock fetch，零网络依赖。
 *
 * 覆盖：
 * - 构造（默认 / 注入 apiKey / 注入 model / 注入 baseUrl）
 * - happy path（200 + 标准 OpenAI 兼容响应）
 * - API key 缺失 → APIKeyMissingError
 * - 401/403 → LLMAuthError
 * - 429 → LLMRateLimitError
 * - 500 → LLMUnknownError
 * - 网络失败 → LLMNetworkError
 * - JSON 解析失败 → LLMUnknownError
 * - choices 缺失 / message 缺失 / content 非 string → LLMUnknownError
 * - AbortSignal 透传
 * - Authorization 头正确
 * - content-type 正确
 * - body.model 正确
 * - body.messages 正确
 * - body.stream=false
 * - stream()：CRLF/LF SSE delimiter 兼容、onChunk 累加、末尾 flush、[DONE] 跳过、JSON 坏行 warn
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, DEEPSEEK_DEFAULT_MODEL } from '../src/index.js';
import {
  APIKeyMissingError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMUnknownError,
} from '../src/index.js';
import type { ChatMessage } from '../src/index.js';

// ---- 工具：构造一个 mock fetch 桥接到可控 Response ----

type FetchCall = {
  url: string;
  init: RequestInit;
  rawBody: string;
};

function makeMockFetch(responder: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const rawBody = typeof init?.body === 'string' ? init.body : '';
    const call: FetchCall = { url: u, init: init ?? {}, rawBody };
    calls.push(call);
    return responder(call);
  });
  return { fn, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } });
}

/**
 * 构造一个 SSE 流式 Response。Sprint 1a 修 P2-D 后必须同时验证:
 * - LF delimiter (\n\n) — OpenAI / DeepSeek 官方
 * - CRLF delimiter (\r\n\r\n) — 旧 proxy / 某些中间层会发 CRLF
 *
 * 用 ReadableStream 喂 Uint8Array,让 mock fetch 返回的 Response.body.getReader()
 * 能正确逐 chunk 给到 client,模拟真实 wire-level 行为。
 */
function makeSseResponse(events: string[], delimiter: '\n' | '\r\n' = '\n'): Response {
  const joiner = delimiter === '\r\n' ? '\r\n\r\n' : '\n\n';
  const payload = events.join(joiner) + (events.length > 0 ? joiner : '');
  const enc = new TextEncoder();
  // 单 chunk 喂入,简化 reader.read() 调用次数 = 1
  // 末尾 close() 让 client 看到 done=true
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (payload.length > 0) controller.enqueue(enc.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** 构造一个 OAI delta chunk JSON 字符串。 */
function oaiDelta(content: string, finishReason?: 'stop' | 'tool_calls' | 'length'): string {
  const obj: Record<string, unknown> = {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1700000000,
    model: 'deepseek-v4-flash',
    choices: [
      {
        index: 0,
        delta: { content, role: 'assistant' },
        finish_reason: finishReason ?? null,
      },
    ],
  };
  return `data: ${JSON.stringify(obj)}`;
}

const SAMPLE_MESSAGES: ChatMessage[] = [
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: 'hello' },
  { role: 'user', content: 'tell me a joke' },
];

const SAMPLE_RESPONSE = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  created: 1700000000,
  model: 'deepseek-chat',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Why did the whale cross the ocean? To get to the other tide.',
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

// ---- Tests ----

describe('DeepSeekClient', () => {
  const ORIGINAL_API_KEY = process.env['DEEPSEEK_API_KEY'];

  beforeEach(() => {
    delete process.env['DEEPSEEK_API_KEY'];
  });

  afterEach(() => {
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env['DEEPSEEK_API_KEY'];
    } else {
      process.env['DEEPSEEK_API_KEY'] = ORIGINAL_API_KEY;
    }
  });

  describe('construction', () => {
    it('uses default model when not given', () => {
      const c = new DeepSeekClient({
        apiKey: 'k',
        fetchImpl: makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE)).fn,
      });
      expect(c.model).toBe(DEEPSEEK_DEFAULT_MODEL);
    });

    it('uses injected model', () => {
      const c = new DeepSeekClient({ apiKey: 'k', model: 'deepseek-reasoner' });
      expect(c.model).toBe('deepseek-reasoner');
    });

    it('reads API key from process.env.DEEPSEEK_API_KEY', async () => {
      process.env['DEEPSEEK_API_KEY'] = 'env-key';
      const { fn } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ fetchImpl: fn });
      await c.chat([{ role: 'user', content: 'hi' }]);
      const auth = (fn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(auth['Authorization']).toBe('Bearer env-key');
    });

    it('prefers explicit apiKey over env', async () => {
      process.env['DEEPSEEK_API_KEY'] = 'env-key';
      const { fn } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'explicit-key', fetchImpl: fn });
      await c.chat([{ role: 'user', content: 'hi' }]);
      const auth = (fn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(auth['Authorization']).toBe('Bearer explicit-key');
    });
  });

  describe('happy path', () => {
    it('returns content + model from response', async () => {
      const { fn } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.chat([{ role: 'user', content: 'hi' }]);
      // Sprint 1a: result.model 来自 LLM 响应的 echo 字段,不再 fallback 到 client.model
      expect(result.model).toBe(SAMPLE_RESPONSE.model);
      expect(result.content).toContain('whale');
    });

    it('sends POST to /chat/completions with Bearer auth', async () => {
      const { fn, calls } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'sk-abc', fetchImpl: fn });
      await c.chat(SAMPLE_MESSAGES);
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.url).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(call.init.method).toBe('POST');
      const headers = call.init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer sk-abc');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('serializes body with model, messages, stream=false', async () => {
      const { fn, calls } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await c.chat(SAMPLE_MESSAGES);
      const body = JSON.parse(calls[0]!.rawBody) as Record<string, unknown>;
      expect(body['model']).toBe(DEEPSEEK_DEFAULT_MODEL);
      expect(body['stream']).toBe(false);
      expect(body['messages']).toEqual([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'tell me a joke' },
      ]);
    });

    it('uses custom baseUrl when provided', async () => {
      const { fn, calls } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({
        apiKey: 'k',
        baseUrl: 'http://localhost:9999/v1',
        fetchImpl: fn,
      });
      await c.chat([{ role: 'user', content: 'hi' }]);
      expect(calls[0]!.url).toBe('http://localhost:9999/v1/chat/completions');
    });
  });

  describe('usage (Sprint 1b: cache_hit_rate / cost_turn / tokens_uncached)', () => {
    it('Sprint 1b: 满 usage (含 cached_tokens) → 算对 cache_hit_rate / cost_turn / tokens_uncached', async () => {
      // 1000 prompt, 80% 命中 cache = 800 cached, 200 uncached; 100 completion
      // cost = 200 * 1.0/1e6 + 800 * 0.02/1e6 + 100 * 2.0/1e6
      //      = 0.0002 + 0.000016 + 0.0002 = 0.000416
      // P0 fix (2026-06-03): pricing 数字从 0.5/0.1/1.0 改成官方 1.0/0.02/2.0
      // (Q 贴官方 api-docs.deepseek.com 截屏纠正, 二手源 / 1b 印象都不可信)
      const response = {
        ...SAMPLE_RESPONSE,
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          total_tokens: 1100,
          prompt_cache_hit_tokens: 800,
        },
      };
      const { fn } = makeMockFetch(() => jsonResponse(response));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.chat([{ role: 'user', content: 'hi' }]);
      expect(result.usage).toBeDefined();
      expect(result.usage?.cached_tokens).toBe(800);
      expect(result.usage?.cache_hit_rate).toBeCloseTo(0.8);
      expect(result.usage?.tokens_uncached).toBe(200);
      expect(result.usage?.cost_turn).toBeCloseTo(0.000416);
    });

    it('Sprint 1b: 无 cached_tokens → 3 个新字段全 undefined (不写默认值避免假数据)', async () => {
      // 模拟 LLM 不返 prompt_cache_hit_tokens(老版 OAI / 不支持 cache 的 provider)
      const { fn } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.chat([{ role: 'user', content: 'hi' }]);
      expect(result.usage).toBeDefined();
      expect(result.usage?.cached_tokens).toBeUndefined();
      expect(result.usage?.cache_hit_rate).toBeUndefined();
      expect(result.usage?.cost_turn).toBeUndefined();
      expect(result.usage?.tokens_uncached).toBeUndefined();
    });

    it('Sprint 1b: prompt=0 边界 (避免除零)', async () => {
      const { fn } = makeMockFetch(() =>
        jsonResponse({
          ...SAMPLE_RESPONSE,
          usage: {
            prompt_tokens: 0,
            completion_tokens: 10,
            total_tokens: 10,
            prompt_cache_hit_tokens: 0,
          },
        }),
      );
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.chat([{ role: 'user', content: 'hi' }]);
      // 0/0 走 prompt>0 短路, hit rate 0
      expect(result.usage?.cache_hit_rate).toBe(0);
      expect(result.usage?.tokens_uncached).toBe(0);
      // cost = 0 + 0 + 10 * 2.0/1e6 = 0.00002 (P0 fix: pricing 改成官方 2.0¥/M output)
      expect(result.usage?.cost_turn).toBeCloseTo(0.00002);
    });

    it('Sprint 1b: stream usage-only chunk 同样算 cache_hit_rate / cost_turn / tokens_uncached', async () => {
      // 流式 OAI 协议: stream_options.include_usage=true 时, 最后发一个 usage-only chunk
      const enc = new TextEncoder();
      const usageChunk = {
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'deepseek-v4-flash',
        choices: [],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 50,
          total_tokens: 250,
          prompt_cache_hit_tokens: 180,
        },
      };
      const payload = `data: ${JSON.stringify(usageChunk)}\n\ndata: [DONE]\n\n`;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode(payload));
          controller.close();
        },
      });
      const { fn } = makeMockFetch(() => new Response(stream, { status: 200 }));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.stream(
        [{ role: 'user', content: 'hi' }],
        { onChunk: () => {} },
      );
      expect(result.usage).toBeDefined();
      expect(result.usage?.cached_tokens).toBe(180);
      expect(result.usage?.cache_hit_rate).toBeCloseTo(0.9);
      expect(result.usage?.tokens_uncached).toBe(20);
      // cost = 20 * 1.0/1e6 + 180 * 0.02/1e6 + 50 * 2.0/1e6
      //      = 0.00002 + 0.0000036 + 0.0001 = 0.0001236 (P0 fix: pricing 官方化)
      expect(result.usage?.cost_turn).toBeCloseTo(0.0001236);
    });

    it('Sprint 1b P1 fix: 末 chunk 同时带 choices=[{finish_reason:"stop"}] + 顶层 usage → usage 不丢', async () => {
      // 真实 DeepSeek 流: include_usage=true 时, 末 chunk 形如
      // {choices:[{delta:{}, finish_reason:"stop"}], usage:{...}}
      // 之前 parseSseEvent 看到 choices 非空就走 content 路径, 顶层 usage 被丢弃。
      // P1 fix: 任何 chunk 都先解析顶层 usage, 末 chunk 必须能透出 cache/cost 给状态栏。
      const events = [
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, delta: { content: 'hi' } }],
        })}`,
        // 末 chunk: choices 不空 + 顶层 usage
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 50,
            total_tokens: 250,
            prompt_cache_hit_tokens: 180,
          },
        })}`,
        'data: [DONE]',
      ];
      const res = makeSseResponse(events);
      const { fn } = makeMockFetch(() => res);
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.stream(
        [{ role: 'user', content: 'hi' }],
        { onChunk: () => {} },
      );
      // 修复前: result.usage 是 undefined; 修复后: usage 透出
      expect(result.usage).toBeDefined();
      expect(result.usage?.cached_tokens).toBe(180);
      expect(result.usage?.cache_hit_rate).toBeCloseTo(0.9);
      expect(result.usage?.tokens_uncached).toBe(20);
      // cost = 20 * 1.0/1e6 + 180 * 0.02/1e6 + 50 * 2.0/1e6
      //      = 0.00002 + 0.0000036 + 0.0001 = 0.0001236 (P0 fix: pricing 官方化)
      expect(result.usage?.cost_turn).toBeCloseTo(0.0001236);
    });

    it('Sprint 1b P1 fix: stream 路径 body 必须带 stream_options.include_usage=true (服务端才会回 usage)', async () => {
      // 校验 wire-level: client 真的在 stream=true 时把 stream_options.include_usage=true
      // 塞进 request body, 不会因为改 buildRequestBody 时漏写而退化。
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      const { fn, calls } = makeMockFetch(
        () => new Response(stream, { status: 200 }),
      );
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await c.stream([{ role: 'user', content: 'hi' }], { onChunk: () => {} });
      const body = JSON.parse(calls[0]!.rawBody) as Record<string, unknown>;
      expect(body['stream']).toBe(true);
      expect(body['stream_options']).toEqual({ include_usage: true });
    });

    it('Sprint 1b P1 fix: 非流式 chat() body 不带 stream_options (避免污染 wire)', async () => {
      // 反向断言: stream=false 时 stream_options 不该被注入。
      // OAI 协议允许在非流式请求里也带 stream_options 但会被忽略,
      // 但我们不在非流式路径加它, 保持 wire 最小化。
      const { fn, calls } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await c.chat([{ role: 'user', content: 'hi' }]);
      const body = JSON.parse(calls[0]!.rawBody) as Record<string, unknown>;
      expect(body['stream']).toBe(false);
      expect(body['stream_options']).toBeUndefined();
    });

    it('Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 V4 thinking 400): stream 累加 reasoning_content, final 拿到完整', async () => {
      // 真实 DeepSeek V4 thinking 模式: stream 期间逐 chunk 给 reasoning_content
      // 增量, content 跟在 thinking 后给. 修前: parse.ts:45-46 主动丢 (Sprint 1a
      // "机制 3 简化"), final.reasoning_content 是 undefined. 修后: 累加后透传.
      const events = [
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, delta: { reasoning_content: 'Let me think... ', role: 'assistant' } }],
        })}`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, delta: { reasoning_content: 'first step is...', role: 'assistant' } }],
        })}`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, delta: { content: 'Final answer', role: 'assistant' } }],
        })}`,
        `data: ${JSON.stringify({
          id: 'chatcmpl-1',
          object: 'chat.completion.chunk',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        })}`,
        'data: [DONE]',
      ];
      const res = makeSseResponse(events);
      const { fn } = makeMockFetch(() => res);
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.stream([{ role: 'user', content: 'hi' }], { onChunk: () => {} });
      // 关键断言: 累加的 reasoning_content 在 final result 上
      expect(result.reasoning_content).toBe('Let me think... first step is...');
      expect(result.content).toBe('Final answer');
    });

    it('Sprint 1c-revive-2-D-21.1: non-thinking model (V3 旧 alias) 不带 reasoning_content, final 字段 absent', async () => {
      // 反向: V3 chat / thinking 关闭 → delta 没 reasoning_content 字段 → final
      // 也没 reasoning_content (拍板: 空字符串省掉字段, omitempty 风格, 减少 wire 噪音).
      const events = [
        oaiDelta('hi', 'stop'),
        'data: [DONE]',
      ];
      const res = makeSseResponse(events);
      const { fn } = makeMockFetch(() => res);
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.stream([{ role: 'user', content: 'hi' }], { onChunk: () => {} });
      expect(result.reasoning_content).toBeUndefined();
    });

    it('Sprint 1c-revive-2-D-21.1: assistant message 带 reasoning_content 时, 下次请求 wire body 必带 reasoning_content (V4 400 修复)', async () => {
      // 真 V4 400 根因: 多轮对话 assistant 消息带 reasoning_content, 下次请求
      // 必须在 body 透传, 不然 DeepSeek 报 400. 此 test 模拟"上轮收到 reasoning"
      // 推 working 之后, 第二次 chat 抓 wire body 验证 reasoning_content 在.
      const { fn, calls } = makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await c.chat([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: 'hello',
          reasoning_content: 'I should greet back',
        },
        { role: 'user', content: 'and a joke?' },
      ]);
      const body = JSON.parse(calls[0]!.rawBody) as Record<string, unknown>;
      const messages = body['messages'] as Array<Record<string, unknown>>;
      const assistantMsg = messages.find((m) => m['role'] === 'assistant');
      expect(assistantMsg).toBeDefined();
      // 关键: 修前 assistantMsg 没 reasoning_content (parse.ts 主动丢), V4 报 400.
      // 修后 reasoning_content 透传, V4 多轮 200.
      expect(assistantMsg!['reasoning_content']).toBe('I should greet back');
    });
  });

  describe('error: API key', () => {
    it('throws APIKeyMissingError when no key in env or options', async () => {
      const c = new DeepSeekClient({
        fetchImpl: makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE)).fn,
      });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(
        APIKeyMissingError,
      );
    });

    it('APIKeyMissingError implements the LLMError interface', () => {
      const e = new APIKeyMissingError('x');
      expect(e.name).toBe('APIKeyMissingError');
      expect(e.isLLMError).toBe(true);
    });
  });

  describe('error: HTTP status', () => {
    it('throws LLMAuthError on 401', async () => {
      const { fn } = makeMockFetch(() => textResponse('unauthorized', 401));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(LLMAuthError);
    });

    it('throws LLMAuthError on 403', async () => {
      const { fn } = makeMockFetch(() => textResponse('forbidden', 403));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      try {
        await c.chat([{ role: 'user', content: 'hi' }]);
      } catch (e) {
        expect(e).toBeInstanceOf(LLMAuthError);
        if (e instanceof LLMAuthError) expect(e.status).toBe(403);
        return;
      }
      expect.fail('expected throw');
    });

    it('throws LLMRateLimitError on 429', async () => {
      const { fn } = makeMockFetch(() => textResponse('rate limited', 429));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      try {
        await c.chat([{ role: 'user', content: 'hi' }]);
      } catch (e) {
        expect(e).toBeInstanceOf(LLMRateLimitError);
        if (e instanceof Error) expect(e.isLLMError).toBe(true);
        return;
      }
      expect.fail('expected throw');
    });

    it('throws LLMUnknownError on 500', async () => {
      const { fn } = makeMockFetch(() => textResponse('boom', 500));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      try {
        await c.chat([{ role: 'user', content: 'hi' }]);
      } catch (e) {
        expect(e).toBeInstanceOf(LLMUnknownError);
        if (e instanceof LLMUnknownError) expect(e.status).toBe(500);
        return;
      }
      expect.fail('expected throw');
    });
  });

  describe('error: network / parsing / schema', () => {
    it('wraps fetch rejection in LLMNetworkError', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl });
      try {
        await c.chat([{ role: 'user', content: 'hi' }]);
      } catch (e) {
        expect(e).toBeInstanceOf(LLMNetworkError);
        return;
      }
      expect.fail('expected throw');
    });

    it('wraps AbortError in LLMNetworkError', async () => {
      const fetchImpl = vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      });
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl });
      try {
        await c.chat([{ role: 'user', content: 'hi' }]);
      } catch (e) {
        expect(e).toBeInstanceOf(LLMNetworkError);
        if (e instanceof LLMNetworkError) expect(e.message).toContain('aborted');
        return;
      }
      expect.fail('expected throw');
    });

    it('throws LLMUnknownError when response is not valid JSON', async () => {
      const { fn } = makeMockFetch(() => textResponse('not json at all', 200));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(
        LLMUnknownError,
      );
    });

    it('throws LLMUnknownError when choices is missing', async () => {
      const { fn } = makeMockFetch(() => jsonResponse({ id: 'x' }));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(
        LLMUnknownError,
      );
    });

    it('falls back to empty content when message.content is not a string', async () => {
      // Sprint 1a 行为变更：content 非 string 不再 throw,fallback 到空串。
      // 这跟 DeepSeek 实际行为对齐(可能返回 null/reasoning_content 而非 strict error)。
      const { fn } = makeMockFetch(() =>
        jsonResponse({ choices: [{ message: { role: 'assistant', content: 42 } }] }),
      );
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.chat([{ role: 'user', content: 'hi' }]);
      expect(result.content).toBe('');
    });
  });

  describe('abort signal', () => {
    it('passes the user abort signal through to fetch and aborts when triggered', async () => {
      let observedSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn(
        async (_url: string, init?: RequestInit): Promise<Response> => {
          observedSignal = init?.signal as AbortSignal | undefined;
          // 模拟"客户端持续在等响应,直到 abort 触发才 reject"。
          // Sprint 1a 修 P2-C:验证 signal 已合成进 fetch,且 abort 真能传到下游。
          return new Promise<Response>((_resolve, reject) => {
            observedSignal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        },
      );
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl, timeoutMs: 30_000 });
      const ac = new AbortController();
      // Sprint 1a 修 P2-C:chat() 新签名是 (msgs, { signal }),旧 chat(msgs, ac.signal) 是误传
      const promise = c.chat([{ role: 'user', content: 'hi' }], { signal: ac.signal });
      // 触发 abort
      ac.abort();
      await expect(promise).rejects.toBeInstanceOf(LLMNetworkError);
      // 验证:实现必须把外部 signal 合成进 fetch 的 init.signal
      expect(observedSignal).toBeDefined();
      expect(observedSignal?.aborted).toBe(true);
    });

    it('aborts request on timeout', async () => {
      const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl, timeoutMs: 50 });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(
        LLMNetworkError,
      );
    });
  });

  describe('stream()', () => {
    describe('SSE delimiter compatibility (P2-D regression)', () => {
      it('parses LF-delimited SSE stream and emits incremental onChunk', async () => {
        // Baseline: 标准 OpenAI / DeepSeek LF delimiter (\n\n)
        const events = [oaiDelta('Hello'), oaiDelta(' world'), oaiDelta('!', 'stop')];
        const { fn } = makeMockFetch(() => makeSseResponse(events, '\n'));
        const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
        const received: string[] = [];
        const result = await c.stream(
          [{ role: 'user', content: 'hi' }],
          { onChunk: (chunk) => received.push(chunk.delta.content ?? '') },
        );
        expect(received).toEqual(['Hello', ' world', '!']);
        expect(result.content).toBe('Hello world!');
        expect(result.finish_reason).toBe('stop');
      });

      it('parses CRLF-delimited SSE stream (P2-D regression)', async () => {
        // 关键回归: 旧实现 split('\n\n') 会把 \r 留在 event 开头导致 JSON.parse 失败
        // 并被 sseParseFailures 累计 → onChunk 收不到任何 chunk、result.content 为空
        // Sprint 1a 修复后必须能正常解析。
        const events = [oaiDelta('a'), oaiDelta('b'), oaiDelta('c', 'stop')];
        const { fn } = makeMockFetch(() => makeSseResponse(events, '\r\n'));
        const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
        const received: string[] = [];
        const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
          const result = await c.stream(
            [{ role: 'user', content: 'hi' }],
            { onChunk: (chunk) => received.push(chunk.delta.content ?? '') },
          );
          // 三个 delta chunk 全部解析成功
          expect(received).toEqual(['a', 'b', 'c']);
          // 完整文本拼接正确
          expect(result.content).toBe('abc');
          expect(result.finish_reason).toBe('stop');
          // 没有任何 SSE 解析失败的 warn
          const warns = stderrSpy.mock.calls
            .map((c) => String(c[0]))
            .filter((s) => s.includes('SSE parse failures'));
          expect(warns).toEqual([]);
        } finally {
          stderrSpy.mockRestore();
        }
      });

      it('parses mixed LF/CRLF chunks within a single stream (proxy rewrite scenario)', async () => {
        // 真实场景: 部分 CDN/proxy 会在 chunk 边界重写 line ending
        // client 必须用 /\\r?\\n\\r?\\n/ 容忍两种结尾
        const enc = new TextEncoder();
        const events = [oaiDelta('x'), oaiDelta('y'), oaiDelta('z', 'stop')];
        // 拼成: event1 用 LF,event2 用 CRLF,event3 用 LF (中间混插)
        const payload = [events[0], events[1], events[2]]
          .map((e, i) => (i === 1 ? e + '\r\n\r\n' : e + '\n\n'))
          .join('');
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(enc.encode(payload));
            controller.close();
          },
        });
        const { fn } = makeMockFetch(() => new Response(stream, { status: 200 }));
        const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
        const received: string[] = [];
        const result = await c.stream(
          [{ role: 'user', content: 'hi' }],
          { onChunk: (chunk) => received.push(chunk.delta.content ?? '') },
        );
        expect(received).toEqual(['x', 'y', 'z']);
        expect(result.content).toBe('xyz');
      });
    });

    it('skips [DONE] sentinel without emitting a chunk', async () => {
      // OAI 协议用 data: [DONE] 标记流结束。client 必须识别并终止。
      const events = [oaiDelta('hi'), 'data: [DONE]'];
      const { fn } = makeMockFetch(() => makeSseResponse(events, '\n'));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const chunks: ChatChunk[] = [];
      const result = await c.stream(
        [{ role: 'user', content: 'hi' }],
        { onChunk: (chunk) => chunks.push(chunk) },
      );
      // [DONE] 不应产生 chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.delta.content).toBe('hi');
      expect(result.content).toBe('hi');
    });

    it('P2-D follow-up: [DONE] sentinel does not count as SSE parse failure', async () => {
      // 之前 bug: parseSseEvent 对 [DONE] 返回 null, stream loop 把所有 null 算 sseParseFailures++,
      // 正常流也刷 [deepwhale] warn: SSE parse failures: 1。修后 [DONE] 必须显式 skip 且不计数。
      const events = [oaiDelta('a'), oaiDelta('b'), 'data: [DONE]'];
      const { fn } = makeMockFetch(() => makeSseResponse(events, '\n'));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const result = await c.stream(
          [{ role: 'user', content: 'hi' }],
          { onChunk: () => {} },
        );
        // 业务正确
        expect(result.content).toBe('ab');
        // 关键: stderr 不能出现 SSE parse failure warn
        const warns = stderrSpy.mock.calls
          .map((c) => String(c[0]))
          .filter((s) => s.includes('SSE parse failures'));
        expect(warns).toEqual([]);
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('P2-D follow-up: [DONE] is skipped even when split mid-line across chunks', async () => {
      // 真 wire-level 场景: data: [DONE] 行可能被 TCP chunk 边界切到两次。
      // 我们的 buffer 累积 + 末尾 flush 路径都要把 [DONE] 识别出来,不能让它漏到 parseSseEvent 算 failure。
      const enc = new TextEncoder();
      const part1 = enc.encode('da');
      const part2 = enc.encode('ta: [DONE]\n\n');
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(part1);
          controller.enqueue(part2);
          controller.close();
        },
      });
      const { fn } = makeMockFetch(() => new Response(stream, { status: 200 }));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        await c.stream([{ role: 'user', content: 'hi' }], { onChunk: () => {} });
        const warns = stderrSpy.mock.calls
          .map((c) => String(c[0]))
          .filter((s) => s.includes('SSE parse failures'));
        expect(warns).toEqual([]);
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('flushes trailing buffer even when stream ends without trailing delimiter', async () => {
      // 真实 OAI 服务端通常 stream 以 \n\n 结尾,但有些实现 (curl --no-buffer) 不发最后一个 delimiter
      // client 的 "末尾 flush buffer" 分支必须覆盖这种情况
      const enc = new TextEncoder();
      // 故意只放一个 event,不加结尾 delimiter,让 client 在 done=true 后 flush
      const payload = oaiDelta('only');
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode(payload));
          controller.close();
        },
      });
      const { fn } = makeMockFetch(() => new Response(stream, { status: 200 }));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const result = await c.stream(
        [{ role: 'user', content: 'hi' }],
        { onChunk: () => {} },
      );
      expect(result.content).toBe('only');
    });

    it('warns to stderr and continues when a chunk has malformed JSON (P2-D)', async () => {
      // 真实 LLM 服务端偶尔会发 heartbeat (空 data) 或非 JSON 注释行
      // client 必须: 不抛错、跳过坏行、最终在 stderr 留 warn、其它好行仍能解析
      const events = [oaiDelta('ok'), 'data: {this is not valid json', oaiDelta('done', 'stop')];
      const { fn } = makeMockFetch(() => makeSseResponse(events, '\n'));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      const received: string[] = [];
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      try {
        const result = await c.stream(
          [{ role: 'user', content: 'hi' }],
          { onChunk: (chunk) => received.push(chunk.delta.content ?? '') },
        );
        // 两个好行仍正确解析
        expect(received).toEqual(['ok', 'done']);
        expect(result.content).toBe('okdone');
        // 1 个坏行被跳过,warn 写到了 stderr
        const warns = stderrSpy.mock.calls
          .map((c) => String(c[0]))
          .filter((s) => s.includes('SSE parse failures'));
        expect(warns).toHaveLength(1);
        expect(warns[0]).toContain('SSE parse failures: 1');
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it('throws LLMUnknownError when onChunk callback is missing', async () => {
      const c = new DeepSeekClient({
        apiKey: 'k',
        fetchImpl: makeMockFetch(() => makeSseResponse([oaiDelta('x')])).fn,
      });
      // 强制绕过 TS: stream 类型要求 onChunk,运行时检查
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        c.stream([{ role: 'user', content: 'hi' }], {} as any),
      ).rejects.toBeInstanceOf(LLMUnknownError);
    });

    it('sends body.stream=true and forwards onChunk to caller', async () => {
      // 端到端: 验证 stream=true 标志 + onChunk 完整链路
      const events = [oaiDelta('one'), oaiDelta('two')];
      const { fn, calls } = makeMockFetch(() => makeSseResponse(events, '\n'));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await c.stream([{ role: 'user', content: 'hi' }], { onChunk: () => {} });
      const body = JSON.parse(calls[0]!.rawBody) as Record<string, unknown>;
      expect(body['stream']).toBe(true);
    });
  });
});
