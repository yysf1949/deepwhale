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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  APIKeyMissingError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMStreamError,
  LLMUnknownError,
  isLLMError,
} from './types.js';
import {
  parsePricingConfig,
  type PricingConfig,
} from './pricing-config.js';
import {
  isSseDoneSentinel,
  parseOaiChatCompletion,
  parseSseEvent,
} from './parse.js';
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
  /**
   * Sprint 1b.5: 注入 pricing config. 缺省 = undefined → 走 R7 中间路径
   * (base 2 字段, cost 字段 absent). caller 启动期 `await loadPricingConfig()`
   * 拿到 PricingConfig 后传入. 不阻塞 constructor.
   */
  pricing?: PricingConfig;
}

export class DeepSeekClient implements LLMClient {
  readonly model: ModelId;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly makeAbortController: () => AbortController;
  /**
   * Sprint 1b.5: pricing config 注入. 缺省 = 启动期 sync 加载 ship-in `pricing.default.toml`.
   * 加载失败 (file not found / parse error) → `undefined` → 走 R7 中间路径
   * (base 2 字段, cost 字段 absent, 不静默 fallback).
   *
   * 用法: caller 显式 `pricing: await loadPricingConfig()` 可覆盖 ship-in (例如读用户 ~/.deepwhale/pricing.toml).
   * `DeepSeekClientOptions.pricing` 字段让 caller 控制 (不阻塞 constructor).
   */
  private readonly pricing: PricingConfig | undefined;

  constructor(options: DeepSeekClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['DEEPSEEK_API_KEY'];
    const rawModel = options.model ?? DEEPSEEK_DEFAULT_MODEL;
    this.model = rawModel as ModelId;
    this.baseUrl = options.baseUrl ?? DEEPSEEK_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.makeAbortController = options.makeAbortController ?? (() => new AbortController());
    this.pricing = options.pricing ?? loadDefaultPricing();
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
    // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 DeepSeek V4 thinking 400 bug):
    // 累加 delta.reasoning_content 给 final ChatResult. DeepSeek V4 默认开
    // thinking, 多轮必须把上轮 reasoning 回传, 否则 400.
    let assembledReasoningContent = '';
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
          // Sprint 1b.5: 透传 pricing + model 给 module-level parse fn.
          const parsed = parseSseEvent(event, this.pricing, this.model);
          if (parsed === null) {
            sseParseFailures += 1;
            continue;
          }
          chunkCount += 1;
          // Sprint 1a:content 增量直接累加
          if (parsed.delta.content) {
            assembledContent += parsed.delta.content;
          }
          // Sprint 1c-revive-2-D-21.1 (2026-06-06): reasoning_content 增量累加.
          // thinking mode 期间逐 chunk 给一段 thinking, 关掉后 content 继续.
          // 不开 thinking 的 model (V3 旧 alias) 不带这字段, 累加永远 '' 不影响.
          if (parsed.delta.reasoning_content) {
            assembledReasoningContent += parsed.delta.reasoning_content;
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
        // Sprint 1b.5 Step 2.5 (F6 拍板, review 2026-06-03 找到): 之前 flush 路径漏传
        // this.pricing + this.model, 最后一个 SSE usage event 没尾随双换行时会丢
        // cost_turn/cost_currency. 修法: 跟正常 path 一致传 this.pricing, this.model.
        if (!isSseDoneSentinel(buffer)) {
          const parsed = parseSseEvent(buffer, this.pricing, this.model);
          if (parsed) {
            chunkCount += 1;
            if (parsed.delta.content) assembledContent += parsed.delta.content;
            if (parsed.delta.reasoning_content) {
              assembledReasoningContent += parsed.delta.reasoning_content;
            }
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
    // Sprint 1c-revive-2-D-21.1 (2026-06-06): reasoning_content 完整累加后透传.
    // 不开 thinking 时这里是 '', 省略字段 (避免污染 caller).
    if (assembledReasoningContent.length > 0) {
      result.reasoning_content = assembledReasoningContent;
    }
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
      // P1 fix (2026-06-03): OAI/DeepSeek 在 stream=true 时, 必须在 body 里
      // 显式带 stream_options.include_usage=true, 服务端才在最后一个 chunk
      // (可能带 choices 也可能不带) 上携带 usage 字段。
      // 不然 cache_hit_rate / cost_turn / tokens_uncached 在 stream 路径全部拿不到。
      // ref: https://api-docs.deepseek.com/api/create-chat-completion
      ...(stream ? { stream_options: { include_usage: true } } : {}),
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
    // Sprint 1b.5: 透传 this.pricing 给 module-level parseOaiChatCompletion,
    // 让 computeCost 能找到 model pricing 算 cost. 不传 pricing 走 R7 中间路径
    // (cost 字段 absent, base 2 字段仍在).
    const parsed = parseOaiChatCompletion(json, this.model, this.pricing);
    if (parsed === null) {
      throw new LLMUnknownError('DeepSeek response missing choices[0].message', { status });
    }
    return parsed;
  }

  private async throwOnHttpError(res: Response): Promise<never> {
    // P2 稳定性债 (Sprint 1c-revive-2-D-21.1 P1 修复, 2026-06-06):
    // 假 key 时 DeepSeek 返 401 + JSON error body, 但 body 是 stream。
    // 之前直接 res.text() 读 stream, 跟调用方没建好的 reader 撞 libuv 状态机,
    // Windows + libuv 内部报 assertion 后 crash 进程。修法: 先 cancel 掉 body
    // (告诉 fetch "我不要了"), 再读 1 个 chunk 上限, 避免 await 死等。
    // ref: https://undici.nodejs.org/#/docs/api/Response.md (body.cancel)
    let text = '';
    if (res.body && !res.body.locked) {
      try {
        const reader = res.body.getReader();
        const { value } = await reader.read().catch(() => ({ value: undefined }));
        if (value) text = new TextDecoder('utf-8').decode(value);
        await reader.cancel().catch(() => {});
      } catch {
        // swallow — 我们只是想拿 status + 短 snippet, 不希望 network 异常覆盖
      }
    }
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
// 内部 helper: sync 加载 ship-in pricing.default.toml
// ============================================================================

/**
 * Sprint 1b.5: 启动期 sync 加载 ship-in `pricing.default.toml`.
 *
 * 设计:
 * - sync 加载 (1 次启动, 不在 hot path, 符合 R3)
 * - 加载失败 (file not found / parse error) → 返回 `undefined` → caller 走 R7 中间路径
 *   (不静默 fallback 到硬编码, 不抛错, base 2 字段, cost 字段 absent)
 * - 文件路径解析: Use sibling pricing.default.toml relative to package location. (Q 拍板 2026-06-04, Task 2 Gap 5 留痕)
 *   走 `import.meta.url` → 当前文件 → 同目录 `pricing.default.toml`
 *   (dev 走 src/, build 后走 dist/, 路径自动对齐;
 *    **不**走 cwd / XDG config dir / env var, 避免 dev-vs-prod 不一致)
 *
 * 测试环境 (vitest) 时 pricing.default.toml 跟 src/ 在一起, 也能加载。
 */
function loadDefaultPricing(): PricingConfig | undefined {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const defaultPath = resolve(here, 'pricing.default.toml');
    const tomlText = readFileSync(defaultPath, 'utf-8');
    return parsePricingConfig(tomlText);
  } catch {
    // 任何错误 (file not found / parse error / 权限) → 不让 client 启动失败.
    // 走 R7 中间路径: base 2 字段, cost 字段 absent.
    return undefined;
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
 *
 * Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 DeepSeek V4 thinking 400 bug):
 * 取消 "机制 3 简化" — 现在 reasoning_content 完整透传. DeepSeek V4 默认开
 * thinking mode, 多轮必须回传上轮 reasoning, 否则 400 "reasoning_content
 * must be passed back to the API". 改动:
 *   - assistant 消息 (无 tool_calls): wire 包含 reasoning_content (若有)
 *   - assistant 消息 (有 tool_calls): wire 包含 reasoning_content (若有)
 *     (DeepSeek 协议要求 tool_call 那个 turn 也要带 reasoning)
 *   - 非 assistant 消息: 不带 reasoning_content 字段
 *   - 空字符串 reasoning_content (thinking 关): 仍然序列化为 "" 字段, 跟
 *     DeepSeek 服务端 round-trip 一致 (不依赖"字段缺失"判断). 拍板: thinking
 *     关时省掉字段 (omitempty 风格, 减少 wire 噪音), 见下行 guard.
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
    const wire: Record<string, unknown> = {
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
    if (m.reasoning_content !== undefined && m.reasoning_content.length > 0) {
      wire['reasoning_content'] = m.reasoning_content;
    }
    return wire;
  }
  if (m.role === 'assistant') {
    const wire: Record<string, unknown> = {
      role: m.role,
      content: m.content ?? '',
    };
    if (m.reasoning_content !== undefined && m.reasoning_content.length > 0) {
      wire['reasoning_content'] = m.reasoning_content;
    }
    return wire;
  }
  return { role: m.role, content: m.content ?? '' };
}

/**
 * 从 OAI chat/completions 非流式响应里提取内容。
 * 返回 null 表示结构异常。
 */
/**
 * Step 2 起 parseOai* 3 个 module-level fn (parseOaiChatCompletion / parseSseEvent /
 * parseSseUsageField) + isSseDoneSentinel 已抽到 parse.ts. 旧 import 位置保留
 * 重导出给 1b 时代 test fixture 用 (deepseek-client.test.ts 没直接 import 它们,
 * 是通过 client 调用间接, 但保险起见保留 export shell).
 *
 * Sprint 1b.5: 留空注释, 避免误删. 真实代码在 parse.ts.
 */
// (parseOaiChatCompletion / isSseDoneSentinel / parseSseEvent / parseSseUsageField) moved to ./parse.ts
