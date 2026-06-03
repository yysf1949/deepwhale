/**
 * DeepSeek 客户端 — OpenAI 兼容 HTTP 协议。
 *
 * Sprint 0.3 范围：非流式 chat + 5 个 LLMError 子类。
 * Sprint 1a 范围：
 *   - 非流式 + 流式双 API（stream() 新增）
 *   - retry/backoff：429/5xx/network 最多 3 次指数退避（200ms→400ms→800ms）
 *   - tool_calls 支持（OpenAI function-calling 协议）
 *   - **机制 2：content="" 永远序列化**（不带 omitempty — 防 wire-level 缓存 hash 变化）
 *   - **机制 3：reasoning_content 不打 wire** — session 内部 thinking 保留，wire 不传
 *   - usage 透传（DeepSeek V4 起带 cached_tokens）
 *   - finish_reason 透传
 *
 * Sprint 1b 再加：canonical schema、cache_hit_rate 暴露。
 * Sprint 2+ 再加：Anthropic 兼容客户端、断点续传。
 */

import { t } from '@deepwhale/core';
import process from 'node:process';
import {
  APIKeyMissingError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMStreamError,
  LLMUnknownError,
  isLLMError,
} from './types.js';
import type {
  ChatChunk,
  ChatMessage,
  ChatResult,
  LLMClient,
  LLMError,
  LLMToolSchema,
  ModelId,
  ToolCall,
  Usage,
} from './types.js';

/** DeepSeek 的 OpenAI 兼容端点。 */
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/**
 * 默认模型：DeepSeek-V4-Flash（V4 系列速度/成本优先版本）。
 *
 * 迁移背景：
 * - V4 于 2026-04-24 preview 发布，2026-07-24 15:59 UTC 后 `deepseek-chat`
 *   和 `deepseek-reasoner` 旧 alias 完全失效（hard-fail，不再是 deprecation warning）。
 * - 官方推荐路径：保持 base_url 不变，把 model 字段改成 `deepseek-v4-flash` 或
 *   `deepseek-v4-pro`。
 * - v4-flash 是 coding agentic 场景的官方推荐（速度/成本/工具调用优化）。
 * - ref: https://api-docs.deepseek.com/news/news260424
 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';

const DEFAULT_TIMEOUT_MS = 60_000;
/** Sprint 1a：固定 3 次重试（429/5xx/network），指数退避 200ms → 400ms → 800ms。 */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 200;

export interface DeepSeekClientOptions {
  /** API key。优先于 process.env.DEEPSEEK_API_KEY。 */
  apiKey?: string;
  /** 模型 ID，默认 deepseek-v4-flash。 */
  model?: string;
  /** Base URL，默认 https://api.deepseek.com/v1。Sprint 1+ 用 mock server 时可换。 */
  baseUrl?: string;
  /** fetch 实现（注入 mock）。默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 单次 HTTP 调用的超时毫秒，默认 60s。 */
  timeoutMs?: number;
  /**
   * 退避函数（注入 mock）。默认 `setTimeout`-based。Sprint 1a 测试用 fake timers 时注入。
   * 返回 Promise，resolve 时表示"已等够，可以重试"。
   */
  sleepFn?: (ms: number) => Promise<void>;
  /** 自定义 abort 工厂（测试用 fake abort）。 */
  makeAbortController?: () => AbortController;
}

export class DeepSeekClient implements LLMClient {
  readonly model: ModelId;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly makeAbortController: () => AbortController;

  constructor(options: DeepSeekClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['DEEPSEEK_API_KEY'];
    const rawModel = options.model ?? DEEPSEEK_DEFAULT_MODEL;
    this.model = rawModel as ModelId;
    this.baseUrl = options.baseUrl ?? DEEPSEEK_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.makeAbortController = options.makeAbortController ?? (() => new AbortController());
  }

  // ==========================================================================
  // 公开 API
  // ==========================================================================

  async chat(
    messages: ChatMessage[],
    options: {
      signal?: AbortSignal;
      tools?: ReadonlyArray<LLMToolSchema>;
      tool_choice?: 'auto' | 'none' | 'required';
    } = {},
  ): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new APIKeyMissingError(t('error.api_key_missing'));
    }

    const body = this.buildRequestBody(messages, options.tools, options.tool_choice, false);

    const res = await this.callWithRetry(body, options.signal);
    const json = await this.parseJsonResponse(res);
    return this.parseChatResponse(json, res.status);
  }

  async stream(
    messages: ChatMessage[],
    options: {
      signal?: AbortSignal;
      tools?: ReadonlyArray<LLMToolSchema>;
      tool_choice?: 'auto' | 'none' | 'required';
      onChunk: (chunk: ChatChunk) => void;
    },
  ): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new APIKeyMissingError(t('error.api_key_missing'));
    }
    if (!options.onChunk) {
      throw new LLMUnknownError('stream() requires onChunk callback');
    }

    const body = this.buildRequestBody(messages, options.tools, options.tool_choice, true);
    const res = await this.callWithRetry(body, options.signal);
    if (!res.ok || !res.body) {
      await this.throwOnHttpError(res);
    }

    // 解析 SSE 流
    const reader = res.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let assembledContent = '';
    let assembledToolCalls: ToolCall[] = [];
    let usage: Usage | undefined;
    let finishReason: ChatResult['finish_reason'];
    let lineCount = 0;
    let chunkCount = 0;
    let sseParseFailures = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        lineCount += 1;
        buffer += decoder.decode(value, { stream: true });
        // SSE: event 间以双换行分隔。真实 SSE wire 可能是 LF 或 CRLF(部分 proxy / 旧服务端会发 CRLF)。
        // Sprint 1a 修 P2-D:用正则一次匹配两种分隔,避免 CRLF 流被延迟到 flush。
        // 注意:不能 split('\n\n') 然后用 '\r\n\r\n' split,否则会切错最后一个 event。
        const SSE_DELIM_RE = /\r?\n\r?\n/;
        let m: RegExpExecArray | null;
        // lastIndex 在循环里持续推进,直到无匹配
        const delimRe = new RegExp(SSE_DELIM_RE.source, 'g');
        while ((m = delimRe.exec(buffer)) !== null) {
          const event = buffer.slice(0, m.index);
          buffer = buffer.slice(m.index + m[0].length);
          delimRe.lastIndex = 0; // 每次切完后 buffer 头部变了,从头再来
          // P2-D follow-up:[DONE] sentinel 是 OAI 协议正常终止标记,绝不能算 parse failure。
          // 必须在 parseSseEvent 之前拦截,否则正常流也会刷 warn,污染 stderr 日志。
          // 其他返回 null 的情况(heartbeat / comment / JSON 损坏)才是真正需要 warn 的失败。
          if (isSseDoneSentinel(event)) continue;
          const parsed = parseSseEvent(event);
          if (parsed === null) {
            sseParseFailures += 1;
            continue;
          }
          chunkCount += 1;
          // Sprint 1a:content 增量直接累加
          if (parsed.delta.content) {
            assembledContent += parsed.delta.content;
          }
          if (parsed.delta.tool_calls) {
            // Sprint 1a 一次性返回完整,直接覆盖（DeepSeek V4 流式 tool_calls 也是完整结构）
            assembledToolCalls = [...parsed.delta.tool_calls];
          }
          if (parsed.usage) usage = parsed.usage;
          if (parsed.finish_reason) finishReason = parsed.finish_reason;
          options.onChunk(parsed);
        }
        // 切完后 buffer 还可能含一个未结束的 event(等下一个 chunk 或 flush)
        // lastIndex 已经被 reset 为 0;这里把 buffer 截到 delimRe.lastIndex(但 delimRe 已经停,buffer 已经是剩余)
        // 不需要额外处理,下一轮 read() 时再切。
        // 但如果 delimRe.exec 一次都没匹配,buffer 没变;下次 read 直接 append。
      }
      // 末尾 flush buffer
      if (buffer.trim().length > 0) {
        // 同样先看 [DONE] sentinel,再走 parseSseEvent
        if (!isSseDoneSentinel(buffer)) {
          const parsed = parseSseEvent(buffer);
          if (parsed) {
            chunkCount += 1;
            if (parsed.delta.content) assembledContent += parsed.delta.content;
            if (parsed.delta.tool_calls) assembledToolCalls = [...parsed.delta.tool_calls];
            if (parsed.usage) usage = parsed.usage;
            if (parsed.finish_reason) finishReason = parsed.finish_reason;
            options.onChunk(parsed);
          } else {
            sseParseFailures += 1;
          }
        }
      }
      // Sprint 1a 修 P2-D:JSON parse 失败不再静默,在 stderr 留一行 warn(运维排查用)。
      if (sseParseFailures > 0) {
        process.stderr.write(
          `[deepwhale] warn: SSE parse failures: ${sseParseFailures} (stream still completed)\n`,
        );
      }
    } catch (err) {
      throw new LLMStreamError(
        `SSE stream interrupted after ${lineCount} lines / ${chunkCount} chunks: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }

    const result: ChatResult = {
      model: this.model,
      content: assembledContent,
    };
    if (assembledToolCalls.length > 0) result.tool_calls = assembledToolCalls;
    if (usage) result.usage = usage;
    if (finishReason) result.finish_reason = finishReason;
    return result;
  }

  // ==========================================================================
  // 内部：HTTP + retry
  // ==========================================================================

  private buildRequestBody(
    messages: ChatMessage[],
    tools: ReadonlyArray<LLMToolSchema> | undefined,
    toolChoice: 'auto' | 'none' | 'required' | undefined,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: this.model,
      messages: messages.map(toWireMessage),
      stream,
      // 机制 2：content="" 永远序列化（OAI spec 允许,但 prefix-cache hash 会变,
      // 所以这里强制把空字符串序列化为 "",绝不带 omitempty）
      // 实际由 toWireMessage 完成 — 这里只是注释提醒调用者。
      ...(tools && tools.length > 0
        ? { tools: tools.map((t) => ({ type: 'function', function: t })) }
        : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    };
  }

  private async callWithRetry(
    body: Record<string, unknown>,
    externalSignal: AbortSignal | undefined,
  ): Promise<Response> {
    const url = `${this.baseUrl}/chat/completions`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      // 每次重试一个独立 AbortController（timeout 重新计）
      const timeoutController = this.makeAbortController();
      const timer = setTimeout(() => timeoutController.abort(new Error('timeout')), this.timeoutMs);
      const combinedSignal =
        externalSignal !== undefined
          ? AbortSignal.any([externalSignal, timeoutController.signal])
          : timeoutController.signal;

      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: combinedSignal,
        });

        if (res.ok) return res;

        // 5xx/429 → retry；4xx 其他 → 立即抛
        if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES - 1) {
          // 读 body 留作错误诊断（不 await 不算 leak,GC 会清）
          const errBody = await res.text().catch(() => '');
          lastError = new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
          await this.sleepFn(BASE_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        await this.throwOnHttpError(res);
      } catch (err) {
        // 4xx 已被 throwOnHttpError 处理,这里的 err 是 network/timeout/abort
        if (isLLMError(err)) throw err; // 4xx 不重试
        lastError = err;
        // 已被外部 signal 取消 → 立即退出
        if (externalSignal?.aborted) {
          throw new LLMNetworkError('Request aborted by caller', { cause: err });
        }
        // timeout / network → retry
        if (attempt < MAX_RETRIES - 1) {
          await this.sleepFn(BASE_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        throw this.wrapNetworkError(err);
      } finally {
        clearTimeout(timer);
      }
    }
    // 理论不会到这（最后一次循环要么 return 要么 throw）
    throw this.wrapNetworkError(lastError);
  }

  private async parseJsonResponse(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch (err) {
      throw new LLMUnknownError('Failed to parse DeepSeek response as JSON', { cause: err });
    }
  }

  private parseChatResponse(json: unknown, status: number): ChatResult {
    const parsed = parseOaiChatCompletion(json, this.model);
    if (parsed === null) {
      throw new LLMUnknownError('DeepSeek response missing choices[0].message', { status });
    }
    return parsed;
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

// ============================================================================
// 内部 helper:wire 消息转换 + 响应解析 + SSE 解析
// ============================================================================

/**
 * 把 ChatMessage 转成 OAI wire 格式。
 *
 * 关键不变量（Prefix-cache 机制 2/3）：
 * - `content: ""` 永远序列化为 ""（不带 omitempty）
 * - reasoning_content 字段不打 wire（即使 LLM 返回了也丢掉 — Sprint 1a 简化）
 * - tool_calls 必带 type:'function' 包装
 */
function toWireMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      content: m.content ?? '',
      tool_call_id: m.tool_call_id ?? '',
    };
  }
  if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
    return {
      role: 'assistant',
      content: m.content ?? '', // 机制 2：永远序列化
      tool_calls: m.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          // OAI wire 上 args 是 string,我们这里已经是 object,JSON.stringify 转回去
          arguments: JSON.stringify(tc.args),
        },
      })),
    };
  }
  return { role: m.role, content: m.content ?? '' };
}

/**
 * 从 OAI chat/completions 非流式响应里提取内容。
 * 返回 null 表示结构异常。
 */
function parseOaiChatCompletion(json: unknown, fallbackModel: ModelId): ChatResult | null {
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  const choices = obj['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const firstObj = first as Record<string, unknown>;
  const message = firstObj['message'];
  if (typeof message !== 'object' || message === null) return null;
  const msg = message as Record<string, unknown>;
  // 机制 3：reasoning_content 不暴露给 caller（session 内部如果要保留,sprint 1b 再加）
  // 这里直接忽略 reasoning_content 字段,只取 content
  const content = typeof msg['content'] === 'string' ? msg['content'] : '';

  // 解析 tool_calls
  let toolCalls: ToolCall[] | undefined;
  const rawTc = msg['tool_calls'];
  if (Array.isArray(rawTc) && rawTc.length > 0) {
    toolCalls = [];
    for (const tc of rawTc) {
      if (typeof tc !== 'object' || tc === null) continue;
      const tcObj = tc as Record<string, unknown>;
      const fn = tcObj['function'];
      if (typeof fn !== 'object' || fn === null) continue;
      const fnObj = fn as Record<string, unknown>;
      const name = typeof fnObj['name'] === 'string' ? fnObj['name'] : '';
      const argsStr = typeof fnObj['arguments'] === 'string' ? fnObj['arguments'] : '{}';
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argsStr);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // args 解析失败,留空对象。caller 看到 args={} 通常意味着 LLM 输出格式错误。
      }
      const id = typeof tcObj['id'] === 'string' ? tcObj['id'] : '';
      toolCalls.push({ id, name, args });
    }
  }

  // usage
  let usage: Usage | undefined;
  const rawUsage = obj['usage'];
  if (typeof rawUsage === 'object' && rawUsage !== null) {
    const u = rawUsage as Record<string, unknown>;
    const prompt = typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0;
    const completion = typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0;
    const total = typeof u['total_tokens'] === 'number' ? u['total_tokens'] : prompt + completion;
    const cached =
      typeof u['prompt_cache_hit_tokens'] === 'number' ? u['prompt_cache_hit_tokens'] : undefined;
    usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
    if (cached !== undefined) usage.cached_tokens = cached;
  }

  // finish_reason
  const rawFr = firstObj['finish_reason'];
  const finishReason: ChatResult['finish_reason'] =
    rawFr === 'stop' || rawFr === 'tool_calls' || rawFr === 'length' || rawFr === 'content_filter'
      ? rawFr
      : undefined;

  const modelRaw = obj['model'];
  const model: ModelId = typeof modelRaw === 'string' ? (modelRaw as ModelId) : fallbackModel;

  const result: ChatResult = { model, content };
  if (toolCalls) result.tool_calls = toolCalls;
  if (usage) result.usage = usage;
  if (finishReason) result.finish_reason = finishReason;
  return result;
}

/**
 * 判断 SSE event raw text 是否是 OAI 协议的 [DONE] 终止 marker。
 * 在 parseSseEvent 之前调用,确保 [DONE] sentinel 不被算作 parse failure
 * (P2-D follow-up: 之前会被静默归入 sseParseFailures++, 正常流也刷 warn)。
 *
 * 容忍: data: [DONE] / data:[DONE] / 多个 data: 行 / 前后空白 / CRLF。
 */
function isSseDoneSentinel(eventRaw: string): boolean {
  // 扫所有 data: 行,看是否有且只有 [DONE]
  let sawDataLine = false;
  for (const ln of eventRaw.split('\n')) {
    if (!ln.startsWith('data:')) continue;
    const payload = ln.slice(5).trimStart();
    if (payload === '[DONE]') {
      sawDataLine = true;
    } else {
      // [DONE] event 不应混入别的 data
      return false;
    }
  }
  return sawDataLine;
}

/**
 * 解析单个 SSE event（`data: {...}\n`）。
 * 返回 null 表示跳过该 event（heartbeat / comment / 解析失败）。
 *
 * 注意:[DONE] sentinel 由 isSseDoneSentinel 在调用方提前拦截,
 * 本函数不再处理,避免重复路径让 caller 误算 parse failure。
 */
function parseSseEvent(eventRaw: string): ChatChunk | null {
  const lines = eventRaw.split('\n');
  const dataLines: string[] = [];
  for (const ln of lines) {
    if (ln.startsWith('data:')) {
      dataLines.push(ln.slice(5).trimStart());
    }
    // event:/id:/retry: 忽略
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join('\n');
  // [DONE] sentinel 已被 isSseDoneSentinel 提前拦截,这里不再判断。
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null; // 解析失败静默跳过（Sprint 1a 简化,Sprint 1b 加重试日志）
  }
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  const choices = obj['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    // usage-only chunk(OAI 协议允许 stream_options.include_usage)
    const rawUsage = obj['usage'];
    if (typeof rawUsage === 'object' && rawUsage !== null) {
      const u = rawUsage as Record<string, unknown>;
      const usage: Usage = {
        prompt_tokens: typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0,
        completion_tokens: typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0,
        total_tokens: typeof u['total_tokens'] === 'number' ? u['total_tokens'] : 0,
      };
      return { delta: {}, usage };
    }
    return null;
  }
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const firstObj = first as Record<string, unknown>;
  const rawDelta = firstObj['delta'];
  if (typeof rawDelta !== 'object' || rawDelta === null) return null;
  const deltaObj = rawDelta as Record<string, unknown>;

  // 机制 3：reasoning_content 不暴露
  const content = typeof deltaObj['content'] === 'string' ? deltaObj['content'] : undefined;

  // tool_calls 增量(DeepSeek V4 stream 一次性给完整,这里当 full 处理)
  let toolCalls: ToolCall[] | undefined;
  const rawTc = deltaObj['tool_calls'];
  if (Array.isArray(rawTc) && rawTc.length > 0) {
    toolCalls = [];
    for (const tc of rawTc) {
      if (typeof tc !== 'object' || tc === null) continue;
      const tcObj = tc as Record<string, unknown>;
      const fn = tcObj['function'];
      if (typeof fn !== 'object' || fn === null) continue;
      const fnObj = fn as Record<string, unknown>;
      const name = typeof fnObj['name'] === 'string' ? fnObj['name'] : '';
      const argsStr = typeof fnObj['arguments'] === 'string' ? fnObj['arguments'] : '{}';
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argsStr);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        /* leave {} */
      }
      const id = typeof tcObj['id'] === 'string' ? tcObj['id'] : '';
      const idx = typeof tcObj['index'] === 'number' ? tcObj['index'] : 0;
      // Sprint 1a 简化：按 index 收集,最终输出合并
      toolCalls.push({ id: id || `${idx}`, name, args });
    }
  }

  // finish_reason
  const rawFr = firstObj['finish_reason'];
  const finishReason: ChatResult['finish_reason'] =
    rawFr === 'stop' || rawFr === 'tool_calls' || rawFr === 'length' || rawFr === 'content_filter'
      ? rawFr
      : undefined;

  const delta: { content?: string; tool_calls?: readonly ToolCall[] } = {};
  if (content !== undefined) delta.content = content;
  if (toolCalls !== undefined) delta.tool_calls = toolCalls;
  const chunk: ChatChunk = { delta };
  if (finishReason) chunk.finish_reason = finishReason;
  return chunk;
}
