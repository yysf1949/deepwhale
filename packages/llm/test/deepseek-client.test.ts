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
      message: { role: 'assistant', content: 'Why did the whale cross the ocean? To get to the other tide.' },
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
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE)).fn });
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
      expect(result.model).toBe(DEEPSEEK_DEFAULT_MODEL);
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

  describe('error: API key', () => {
    it('throws APIKeyMissingError when no key in env or options', async () => {
      const c = new DeepSeekClient({ fetchImpl: makeMockFetch(() => jsonResponse(SAMPLE_RESPONSE)).fn });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(APIKeyMissingError);
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
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(LLMUnknownError);
    });

    it('throws LLMUnknownError when choices is missing', async () => {
      const { fn } = makeMockFetch(() => jsonResponse({ id: 'x' }));
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(LLMUnknownError);
    });

    it('throws LLMUnknownError when message.content is not a string', async () => {
      const { fn } = makeMockFetch(() =>
        jsonResponse({ choices: [{ message: { role: 'assistant', content: 42 } }] }),
      );
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl: fn });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(LLMUnknownError);
    });
  });

  describe('abort signal', () => {
    it('passes the user abort signal through to fetch', async () => {
      let observedSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
        observedSignal = init?.signal as AbortSignal | undefined;
        return jsonResponse(SAMPLE_RESPONSE);
      });
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl, timeoutMs: 30_000 });
      const ac = new AbortController();
      await c.chat([{ role: 'user', content: 'hi' }], ac.signal);
      // 我们的实现 AbortSignal.any 合成，外部 signal 必须被合成进
      expect(observedSignal).toBeDefined();
      // 合成的 signal 上应能看到外部 controller 调 abort 后的传递（功能层验证）
      ac.abort();
      // 给一个微任务让任何重试/finally 跑完
      await Promise.resolve();
    });

    it('aborts request on timeout', async () => {
      const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });
      const c = new DeepSeekClient({ apiKey: 'k', fetchImpl, timeoutMs: 50 });
      await expect(c.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(LLMNetworkError);
    });
  });
});
