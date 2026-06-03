/**
 * DeepSeek 客户端 — OpenAI 兼容 HTTP 协议。
 *
 * Sprint 0.3 极简实现：
 * - Base URL: https://api.deepseek.com/v1（OpenAI 兼容）
 * - 只支持非流式 chat
 * - 默认模型: deepseek-chat
 * - API key 从 process.env.DEEPSEEK_API_KEY 读
 *
 * Sprint 1+ 再加：流式、自家 Reasonix、retry/backoff、prompt cache、token 计量。
 */

import { t } from '@deepwhale/core';
import {
  APIKeyMissingError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMUnknownError,
  isLLMError,
} from './types.js';
import type { ChatMessage, ChatResult, LLMClient, LLMError, ModelId } from './types.js';

/** DeepSeek 的 OpenAI 兼容端点。 */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';

export interface DeepSeekClientOptions {
  /** API key。优先于 process.env.DEEPSEEK_API_KEY。 */
  apiKey?: string;
  /** 模型 ID，默认 deepseek-chat。Sprint 1+ 加 deepseek-reasoner。 */
  model?: string;
  /** Base URL，默认 https://api.deepseek.com/v1。Sprint 1+ 用 mock server 时可换。 */
  baseUrl?: string;
  /** fetch 实现（注入 mock）。默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 单次 chat 超时毫秒，默认 60s。Sprint 1+ 拆 streaming timeout / total timeout。 */
  timeoutMs?: number;
}

export class DeepSeekClient implements LLMClient {
  readonly model: ModelId;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['DEEPSEEK_API_KEY'];
    const rawModel = options.model ?? DEEPSEEK_DEFAULT_MODEL;
    // 强制 brand cast — model ID 由 DeepSeek 服务端校验
    this.model = rawModel as ModelId;
    this.baseUrl = options.baseUrl ?? DEEPSEEK_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new APIKeyMissingError(t('error.api_key_missing'));
    }

    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    // AbortSignal.any 支持用户传 + 超时
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new Error('timeout')), this.timeoutMs);
    const combinedSignal =
      signal !== undefined ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (err) {
      throw this.wrapNetworkError(err);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      await this.throwOnHttpError(res);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw new LLMUnknownError('Failed to parse DeepSeek response as JSON', { cause: err });
    }

    const content = extractContent(json);
    if (content === null) {
      throw new LLMUnknownError('DeepSeek response missing choices[0].message.content', { status: res.status });
    }
    return { model: this.model, content };
  }

  private async throwOnHttpError(res: Response): Promise<never> {
    const text = await res.text().catch(() => '');
    const message = `DeepSeek API error ${res.status}: ${text.slice(0, 200)}`;
    if (res.status === 429) throw new LLMRateLimitError(message);
    if (res.status === 401 || res.status === 403) throw new LLMAuthError(res.status, message);
    throw new LLMUnknownError(message, { status: res.status });
  }

  private wrapNetworkError(err: unknown): LLMError {
    if (isLLMError(err)) return err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('AbortError')) {
      return new LLMNetworkError(`Request aborted: ${msg}`, { cause: err });
    }
    return new LLMNetworkError(`Network error: ${msg}`, { cause: err });
  }
}

/**
 * 从 OpenAI 兼容响应中提取 content。
 * 返回 null 表示结构异常（v1.0.x 要补 schema 校验，挪 zod）。
 */
function extractContent(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  const choices = obj['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as Record<string, unknown>)['message'];
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : null;
}
