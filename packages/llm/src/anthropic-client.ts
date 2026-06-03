/**
 * @deepwhale/llm — AnthropicClient
 *
 * Sprint 1b.5 Step 2: Anthropic provider, 走 /anthropic endpoint 薄包装方案 (D1 拍板).
 *
 * 关键设计 (R-D 拍板 2026-06-03):
 * - 用官方 @anthropic-ai/sdk 实例发请求, 不手写 fetch
 * - SDK opts.fetch 注入是设计意图内的 escape hatch (Cloudflare Workers / Deno
 *   proxy), 我们用同 pattern 注入 mock fetch 用于测试, 真实部署走 SDK 实际 fetch
 * - baseURL 落 https://api.deepseek.com/anthropic, authToken 复用 DEEPSEEK_API_KEY
 *   (DeepSeek shim 接 /anthropic 路径, 同 key 验证) — **不**直连 api.anthropic.com
 * - 响应是 Anthropic-shape Message, 写 parseAnthropicMessage 翻译成 ChatResult
 * - SSE 走 SDK MessageStream, 写 parseAnthropicSseEvent 翻译 RawMessageStreamEvent
 *   → ChatChunk. 不复用 parseOai* (那是 OAI shape, 协议不同)
 * - X3 拍板: Step 2 不接真 API, 测试用 mock fetch, 不碰 key
 *
 * Cache 字段 (B1 拍板): Anthropic 有 cache_creation_input_tokens (新建) +
 * cache_read_input_tokens (命中) 两个**独立**字段. 我们合并到 cached_tokens:
 *   cached_tokens = (cache_creation ?? 0) + (cache_read ?? 0)
 * cache_creation 详细拆解留 sprint 2 改进 (跟 cache_hit_rate / cost_turn 一起).
 *
 * StopReason 翻译 (Anthropic → OAI-shape finish_reason):
 *   'end_turn'       → 'stop'
 *   'stop_sequence'  → 'stop'
 *   'max_tokens'     → 'length'
 *   'tool_use'       → 'tool_calls'
 *   null (in-flight) → undefined
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  Message as AnthropicMessage,
  MessageParam as AnthropicMessageParam,
  MessageDeltaUsage,
  RawMessageStreamEvent,
  Usage as AnthropicUsage,
} from '@anthropic-ai/sdk/resources/messages/messages.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { APIKeyMissingError, LLMUnknownError } from './types.js';
import type {
  ChatChunk,
  ChatMessage,
  ChatResult,
  LLMClient,
  LLMToolSchema,
  ModelId,
  ToolCall,
  Usage,
} from './types.js';
import { computeCost, parsePricingConfig } from './pricing-config.js';
import type { PricingConfig } from './pricing-config.js';

/** DeepSeek shim 提供的 /anthropic 兼容端点 (相对 OAI v1 端点). */
export const DEEPSEEK_ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';

/** Anthropic 默认 model (走 DeepSeek shim 时, 服务端映射到 Claude Sonnet 4.5). */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-5';

const DEFAULT_TIMEOUT_MS = 60_000;

export interface AnthropicClientOptions {
  /** API key。优先于 process.env.ANTHROPIC_AUTH_TOKEN / DEEPSEEK_API_KEY。 */
  apiKey?: string;
  /** 模型 ID，默认 claude-sonnet-4-5。 */
  model?: string;
  /**
   * Base URL，默认 https://api.deepseek.com/anthropic。
   * 真实生产不走 api.anthropic.com (那是真的 Anthropic, 需不同 key), 走 DeepSeek shim.
   */
  baseUrl?: string;
  /** 自定义 fetch (注入 mock 用于测试). 默认走 SDK 内部 fetch. */
  fetchImpl?: typeof fetch;
  /** 单次 HTTP 调用的超时毫秒，默认 60s。 */
  timeoutMs?: number;
  /**
   * pricing config override. 不传 → 走 ship-in default.toml.
   * Sprint 1b.5 pricing 抽象层 (per-model currency). 详见 pricing-config.ts.
   */
  pricing?: PricingConfig;
}

/**
 * AnthropicClient implements LLMClient.
 *
 * 内部包一个 @anthropic-ai/sdk 实例, .messages.create() / .messages.stream()
 * 走 SDK 真实 HTTP 路径. 我们负责:
 * - ChatMessage → Anthropic.MessageParam 转换 (Sprint 1c 再加 tool_use schema)
 * - Anthropic.Message → ChatResult 转换 (parseAnthropicMessage)
 * - RawMessageStreamEvent → ChatChunk 转换 (parseAnthropicSseEvent, 含 usage 翻译)
 *
 * 不**在**这里写 HTTP / SSE 解析 (SDK 负责), 不**在**这里做重试 (SDK 自带 maxRetries=2,
 * 我们接受默认). Sprint 1c 集成测真接 shim 时可调整 SDK timeout / maxRetries.
 */
export class AnthropicClient implements LLMClient {
  readonly model: ModelId;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pricing: PricingConfig | undefined;
  private readonly sdk: Anthropic;

  constructor(options: AnthropicClientOptions = {}) {
    this.apiKey = options.apiKey ?? resolveApiKey();
    if (this.apiKey === '') {
      throw new APIKeyMissingError(
        'Anthropic API key not set. Set ANTHROPIC_AUTH_TOKEN or DEEPSEEK_API_KEY env var, ' +
          'or pass apiKey option.',
      );
    }
    this.model = (options.model ?? ANTHROPIC_DEFAULT_MODEL) as ModelId;
    this.baseUrl = options.baseUrl ?? DEEPSEEK_ANTHROPIC_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pricing = options.pricing ?? loadDefaultPricing();

    // SDK opts.fetch 注入是设计意图内的 escape hatch (测试 mock + Cloudflare
    // Workers / Deno proxy). 真实生产不传, SDK 走全局 fetch.
    const sdkOptions: { authToken: string; baseURL: string; timeout: number; fetch?: typeof fetch } = {
      authToken: this.apiKey,
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
    };
    if (options.fetchImpl !== undefined) sdkOptions.fetch = options.fetchImpl;
    this.sdk = new Anthropic(sdkOptions);
  }

  async chat(
    messages: ChatMessage[],
    options?: {
      signal?: AbortSignal;
      tools?: ReadonlyArray<LLMToolSchema>;
      tool_choice?: 'auto' | 'none' | 'required';
    },
  ): Promise<ChatResult> {
    // Sprint 1c 实施 tool_use schema 映射; Sprint 1b.5 暂不支持 tools
    // (Sprint 1a 协议调研: Anthropic tool_use schema 跟 OAI function-calling 字段不同,
    // 需手写 name/description/input_schema 转换. 留 1c.)
    if (options?.tools !== undefined && options.tools.length > 0) {
      throw new LLMUnknownError(
        'AnthropicClient tools 参数暂未实现 (Sprint 1c 添加). 当前仅支持无 tools 的 chat/stream.',
      );
    }
    const body = toAnthropicMessages(messages);
    const createParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model as string,
      messages: body.messages,
      max_tokens: 4096, // Anthropic API 必填, 4096 是合理默认 (Sprint 1c 让 caller 传)
      ...(body.system !== undefined ? { system: body.system } : {}),
    };
    const sdkOptions: Anthropic.RequestOptions = {
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
    };

    let response: AnthropicMessage;
    try {
      response = await this.sdk.messages.create(createParams, sdkOptions);
    } catch (e) {
      throw mapSdkError(e);
    }
    return parseAnthropicMessage(response, this.model, this.pricing);
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
    if (options.tools !== undefined && options.tools.length > 0) {
      throw new LLMUnknownError(
        'AnthropicClient tools 参数暂未实现 (Sprint 1c 添加). 当前仅支持无 tools 的 chat/stream.',
      );
    }
    const body = toAnthropicMessages(messages);
    const streamParams: Anthropic.Messages.MessageStreamParams = {
      model: this.model as string,
      messages: body.messages,
      max_tokens: 4096,
      ...(body.system !== undefined ? { system: body.system } : {}),
    };
    const sdkOptions: Anthropic.RequestOptions = {
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    };

    // SDK 的 messages.stream() 返 MessageStream (异步可迭代 + EventEmitter).
    // 跟 for await 一起用, 跟 OAI SSE 处理模式不同 — 这里是 SDK 自家 stream,
    // 不是 SSE 字节流. parseAnthropicSseEvent 负责把每个 RawMessageStreamEvent
    // 翻译成 ChatChunk.
    const stream = this.sdk.messages.stream(streamParams, sdkOptions);
    let finalMessage: AnthropicMessage | undefined;
    for await (const event of stream) {
      const chunk = parseAnthropicSseEvent(event, this.model, this.pricing);
      if (chunk !== null) {
        options.onChunk(chunk);
        // 收到 message_stop 时, SDK 也提供 finalMessage(), 但我们靠 event 流本身
        // 拼出 stop_reason + 完整 usage. 留 1c 集成测时优化 (现 8 tests 覆盖 main path).
      }
      // SDK 的 message_stop event 不携带 final message, 需调 stream.finalMessage()
      // 才能拿到. 简化: 收完流后从 stream 实例读 final message.
      if (event.type === 'message_stop') {
        finalMessage = await stream.finalMessage();
      }
    }
    if (finalMessage === undefined) {
      throw new LLMUnknownError('Anthropic stream ended without message_stop event');
    }
    return parseAnthropicMessage(finalMessage, this.model, this.pricing);
  }
}

// ---- 私有 helper ----

function resolveApiKey(): string {
  // 优先 ANTHROPIC_AUTH_TOKEN (Anthropic SDK 标准), 退到 DEEPSEEK_API_KEY (Sprint 1b.5 shim).
  const anthropic = process.env['ANTHROPIC_AUTH_TOKEN'];
  if (anthropic !== undefined && anthropic !== '') return anthropic;
  const deepseek = process.env['DEEPSEEK_API_KEY'];
  if (deepseek !== undefined && deepseek !== '') return deepseek;
  return '';
}

function loadDefaultPricing(): PricingConfig | undefined {
  try {
    // 跟 DeepSeekClient 走同 pattern: readFileSync pricing.default.toml relative to dist/.
    // Sprint 1c 集成测时检查这条路径在 ESM 打包后是否仍 OK. Step 2 单测用 mock fetch,
    // 不走 loadDefaultPricing (test fixture 显式传 pricing).
    const here = dirname(fileURLToPath(import.meta.url));
    const defaultPath = resolve(here, 'pricing.default.toml');
    const tomlText = readFileSync(defaultPath, 'utf-8');
    return parsePricingConfig(tomlText);
  } catch {
    return undefined;
  }
}

function mapSdkError(e: unknown): Error {
  // SDK 错误分类: APIConnectionError / APIConnectionTimeoutError / RateLimitError /
  // AuthenticationError / BadRequestError / InternalServerError 等. 简化: 透传
  // SDK Error name + message 到 LLMUnknownError. Sprint 1c 集成测时细化 1:1 映射
  // 到 LLMRateLimitError / LLMAuthError / LLMNetworkError (跟 DeepSeekClient 一致).
  if (e instanceof Error) return new LLMUnknownError(`Anthropic SDK: ${e.message}`, { cause: e });
  return new LLMUnknownError(`Anthropic SDK: ${String(e)}`);
}

/** 拆分 system / 非 system messages (Anthropic 协议 system 是顶层字段). */
function toAnthropicMessages(
  messages: ChatMessage[],
): { system: string | undefined; messages: AnthropicMessageParam[] } {
  const out: AnthropicMessageParam[] = [];
  let system: string | undefined;
  for (const m of messages) {
    if (m.role === 'system') {
      // 多条 system 合并 (Anthropic system 是单 string, 重复 system 罕见)
      system = system === undefined ? m.content : `${system}\n\n${m.content}`;
      continue;
    }
    if (m.role === 'tool') {
      // Sprint 1c 实施: tool_result content block 转换. Sprint 1b.5 抛错 (Sprint 0.3 范围
      // 也不支持 tool, DeepSeekClient 也是 mock fixture 走 OAI shape).
      throw new LLMUnknownError(
        'AnthropicClient tool role 暂未实现 (Sprint 1c 添加). 1b.5 范围: user/assistant only.',
      );
    }
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    // assistant: OAI tool_calls 字段暂不支持, 1b.5 范围
    if (m.role === 'assistant') {
      if (m.tool_calls !== undefined && m.tool_calls.length > 0) {
        throw new LLMUnknownError(
          'AnthropicClient assistant tool_calls 暂未实现 (Sprint 1c 添加).',
        );
      }
      out.push({ role: 'assistant', content: m.content });
      continue;
    }
  }
  return { system, messages: out };
}

// ---- 解析层: Anthropic.Message / RawMessageStreamEvent → ChatResult / ChatChunk ----

/**
 * 把 Anthropic SDK 的 Message 翻译成 ChatResult.
 *
 * - content: 拼 text block, 跳过 tool_use (1c 实施) / thinking (1b.5 不暴露)
 * - stop_reason → finish_reason 翻译
 * - usage: cache_creation + cache_read → cached_tokens (B1 拍板). 算 cache_hit_rate
 *   + cost_turn + tokens_uncached 跟 OAI 路径一致.
 */
export function parseAnthropicMessage(
  message: AnthropicMessage,
  fallbackModel: ModelId,
  pricing?: PricingConfig,
): ChatResult {
  // 拼 text + 提取 tool_use (1c 实施, 1b.5 留空)
  let content = '';
  const toolCalls: ToolCall[] = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      content = content === '' ? block.text : `${content}${block.text}`;
    }
    // tool_use / thinking / redacted_thinking 1b.5 跳过. tool_use 留 1c.
  }

  const finishReason: ChatResult['finish_reason'] = mapStopReason(message.stop_reason);

  const usage = parseAnthropicUsage(message.usage, fallbackModel, pricing);

  const model: ModelId = (message.model as ModelId) ?? fallbackModel;
  const result: ChatResult = { model, content };
  if (toolCalls.length > 0) result.tool_calls = toolCalls;
  if (usage !== undefined) result.usage = usage;
  if (finishReason !== undefined) result.finish_reason = finishReason;
  return result;
}

/** 翻译 Anthropic stop_reason → ChatResult['finish_reason']. */
function mapStopReason(stopReason: AnthropicMessage['stop_reason']): ChatResult['finish_reason'] {
  if (stopReason === null) return undefined;
  switch (stopReason) {
    case 'end_turn':
      return 'stop';
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
  }
}

/**
 * 把 Anthropic Usage 翻译成标准化 Usage 结构 (带 cache/cost 字段).
 * B1 拍板: cached_tokens = (cache_creation ?? 0) + (cache_read ?? 0).
 *
 * 接受 Usage | MessageDeltaUsage (后者无 cache_creation / cache_read, 视为 0).
 * Sprint 1b.5 Step 2: AnthropicMessage.usage 是完整 Usage, 流末尾 message_delta
 * 拿到的 event.usage 是 MessageDeltaUsage (只有 output_tokens + cache_creation +
 * cache_read, 没 input_tokens). 统一视为 0 cache_creation/cache_read 处理.
 */
export function parseAnthropicUsage(
  usage: AnthropicUsage | MessageDeltaUsage,
  fallbackModel: ModelId,
  pricing?: PricingConfig,
): Usage | undefined {
  // AnthropicUsage (完整): 有 input_tokens + output_tokens + cache_creation + cache_read
  // MessageDeltaUsage (流末尾 message_delta 事件): 只有 output_tokens, 拿不到 input/cache.
  //   → 视为 delta 增量, 不算完整 cost. 真实生产靠 stream.finalMessage() 拿完整 Usage.
  if (!('input_tokens' in usage)) {
    // 流中 message_delta event: 只透出 output_tokens, 不算 cost / cache.
    return {
      prompt_tokens: 0,
      completion_tokens: usage.output_tokens,
      total_tokens: usage.output_tokens,
    };
  }
  // 此后 usage 一定是 AnthropicUsage (有 input_tokens + cache_creation + cache_read)
  const full = usage as AnthropicUsage;
  const prompt = full.input_tokens;
  const completion = full.output_tokens;
  // B1: 合并 cache 字段. cache_creation / cache_read 都可能 null.
  const cacheCreation = full.cache_creation_input_tokens ?? 0;
  const cacheRead = full.cache_read_input_tokens ?? 0;
  const cached = cacheCreation + cacheRead;
  const total = prompt + completion;
  const out: Usage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
  };
  if (cached > 0) out.cached_tokens = cached;
  // 跟 parseOaiSseUsageField 一致, 透传 pricing + model 给 computeCost
  // 注意: cached=0 也算 cost (只是 0 cache hit). 跟 1b P1 (P2-D follow-up) 行为一致.
  const breakdown = computeCost(pricing, fallbackModel, prompt, completion, cached);
  if (breakdown !== undefined) {
    out.cache_hit_rate = breakdown.cache_hit_rate;
    if (breakdown.cost_turn !== undefined) out.cost_turn = breakdown.cost_turn;
    if (breakdown.cost_currency !== undefined) out.cost_currency = breakdown.cost_currency;
    out.tokens_uncached = breakdown.tokens_uncached;
  }
  return out;
}

/**
 * 把单个 RawMessageStreamEvent 翻译成 ChatChunk.
 * 返 null 表示跳过 (heartbeat / ping / 不该透出的 event).
 *
 * Event 类型 (来自 SDK type):
 * - message_start: 携带 message metadata (model, id, usage.input_tokens=0) — 不透出
 * - content_block_start: 新的 text/tool_use/thinking block 起点 — 不透出 (避免 0 token 块)
 * - content_block_delta: text 增量 (delta.text) 或 input_json_delta (tool_use) — 透出 content
 * - content_block_stop: block 结束 — 不透出
 * - message_delta: 顶层 delta (stop_reason + usage 更新) — 透出 finish_reason + 最终 usage
 * - message_stop: 流结束 — 不透出 (caller 走 stream.finalMessage 拿 final Message)
 * - ping: heartbeat — 不透出
 */
export function parseAnthropicSseEvent(
  event: RawMessageStreamEvent,
  fallbackModel: ModelId,
  pricing?: PricingConfig,
): ChatChunk | null {
  switch (event.type) {
    case 'content_block_delta': {
      const delta = event.delta;
      if (delta.type === 'text_delta') {
        return { delta: { content: delta.text } };
      }
      // input_json_delta (tool_use) / thinking_delta / signature_delta: 1b.5 跳过
      return null;
    }
    case 'message_delta': {
      // 顶层 delta: stop_reason + usage. 这是流末尾的最终 usage 更新.
      const finishReason = mapStopReason(event.delta.stop_reason);
      const usage = parseAnthropicUsage(event.usage, fallbackModel, pricing);
      const chunk: ChatChunk = { delta: {} };
      if (finishReason !== undefined) chunk.finish_reason = finishReason;
      if (usage !== undefined) chunk.usage = usage;
      // 1b.5 简化: 即使 chunk 是空 delta, 也透出 (caller 看 finish_reason 收尾)
      return chunk;
    }
    // 其他 event 类型 (start/stop) 不透出. ping event 不在 union (SDK 内部 filter)
    case 'message_start':
    case 'content_block_start':
    case 'content_block_stop':
    case 'message_stop':
      return null;
  }
}
