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
   * Base URL。
   *
   * 拍板 1C (2026-06-04): **DeepSeek-first + Anthropic SDK 协议兼容 + 多 Provider Adapter**。
   * 默认 `https://api.deepseek.com/anthropic` (DeepSeek 提供的 /anthropic 兼容端点, 单 key 走两家),
   * 但 caller 可显式指定其他 Anthropic-兼容 provider:
   *   - `https://api.anthropic.com` — 真 Anthropic API (需 ANTHROPIC_AUTH_TOKEN 真 key, 不走 DEEPSEEK_API_KEY 退路)
   *   - `https://openrouter.ai/api/v1/anthropic` — OpenRouter Anthropic Route
   *   - 任何自定义 proxy / 兼容层
   *
   * Sprint 1d.5-B 揭示: DeepSeek /anthropic 端点**实际** routing 兜底到 OAI flash (server.model=deepseek-v4-flash),
   * 行为稳定但 server 协议声明 mis-labeled. 1C 拍板**不**解决这个 routing 问题 — 现状保留, caller
   * 自选 baseUrl 决定走哪条路.
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
    // Sprint 1c.5 拍板 (1c-revive-2-B-1, 2026-06-04): tool schema 转换 (OAI {parameters} → Anthropic
    // {input_schema}), 跟 DeepSeekClient 同 LLMClient 契约 (5-7 行 production 改).
    // 跟 pi-agent 4-layer 模式: model layer (AnthropicClient) 不知道 tool registry 细节, 只做协议转换.
    const body = toAnthropicMessages(messages, options?.tools);
    const createParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model as string,
      messages: body.messages,
      max_tokens: 4096, // Anthropic API 必填, 4096 是合理默认 (Sprint 1c 让 caller 传)
      ...(body.system !== undefined ? { system: body.system } : {}),
      ...(body.tools !== undefined ? { tools: body.tools } : {}),
      ...(options?.tool_choice !== undefined ? { tool_choice: mapToolChoice(options.tool_choice) } : {}),
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
    const body = toAnthropicMessages(messages, options.tools);
    const streamParams: Anthropic.Messages.MessageStreamParams = {
      model: this.model as string,
      messages: body.messages,
      max_tokens: 4096,
      ...(body.system !== undefined ? { system: body.system } : {}),
      ...(body.tools !== undefined ? { tools: body.tools } : {}),
      ...(options.tool_choice !== undefined ? { tool_choice: mapToolChoice(options.tool_choice) } : {}),
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

/**
 * D-33.1.3: 公开 `serializeAnthropicMessagesForTest` 给单测覆盖 (跟 DeepSeekClient
 * 同形态). 跟 chat() / stream() 内部走同一份 `toAnthropicMessages`, 防 wire shape
 * 漂移. 返回简化形 { system, messages, tools }, 给单测 assert system 抽取 +
 * tool_result 合并 + tool_use 包装 4 个机制.
 */
export function serializeAnthropicMessagesForTest(
  messages: ReadonlyArray<ChatMessage>,
  tools?: ReadonlyArray<LLMToolSchema>,
): {
  system: string | undefined;
  messages: ReadonlyArray<{ role: 'user' | 'assistant'; content: unknown }>;
  tools:
    | ReadonlyArray<{ name: string; description: string | undefined; input_schema: unknown }>
    | undefined;
} {
  const out = toAnthropicMessages(messages as ChatMessage[], tools);
  return {
    system: out.system,
    messages: out.messages.map((m) => ({ role: m.role, content: m.content })),
    tools: out.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
  };
}

/** 拆分 system / 非 system messages (Anthropic 协议 system 是顶层字段). */
function toAnthropicMessages(
  messages: ChatMessage[],
  tools?: ReadonlyArray<LLMToolSchema>,
): { system: string | undefined; messages: AnthropicMessageParam[]; tools?: Anthropic.Tool[] } {
  const out: AnthropicMessageParam[] = [];
  let system: string | undefined;
  // Sprint 1c-revive-2-D-4-1 (P38, 2026-06-04): 合并连续 tool 消息到 1 个 user 消息
  // (Anthropic 协议要求 N 个 tool_use 紧跟 1 个 user 消息含 N 个 tool_result blocks).
  // 1c.5 拍板时 1-tool-call 路径碰巧合法 (N=1 时独立 user 消息仍可), 多 tool_calls 揭示.
  let pendingToolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> | undefined;
  const flushToolResults = (): void => {
    if (pendingToolResults !== undefined && pendingToolResults.length > 0) {
      out.push({
        role: 'user',
        content: pendingToolResults as unknown as Array<Anthropic.ContentBlockParam>,
      });
    }
    pendingToolResults = undefined;
  };
  for (const m of messages) {
    if (m.role === 'system') {
      // 多条 system 合并 (Anthropic system 是单 string, 重复 system 罕见)
      system = system === undefined ? m.content : `${system}\n\n${m.content}`;
      continue;
    }
    if (m.role === 'tool') {
      // 拍板 (D-4-1): 累积 tool_result 进 pendingToolResults (跟下一个 tool 消息合并).
      // flush 时机: 1) 遇到非 tool 角色, 2) loop 结束.
      if (pendingToolResults === undefined) {
        pendingToolResults = [];
      }
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: m.tool_call_id ?? '',
        content: m.content,
      });
      continue;
    }
    // 非 tool 角色: 先 flush pending tool_results (如果有)
    flushToolResults();
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    // assistant: OAI tool_calls → Anthropic content blocks (text + tool_use)
    if (m.role === 'assistant') {
      if (m.tool_calls !== undefined && m.tool_calls.length > 0) {
        const blocks: Anthropic.ToolUseBlockParam[] = m.tool_calls.map((tc) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.args,
        }));
        out.push({
          role: 'assistant',
          // ToolUseBlockParam[] 在 SDK 类型上是 ContentBlockParam[] 的子集, 但 TS 4.x 推断不到
          // (SDK 用 union 反推, 编译期会失配). 显式 cast: 真实运行时 server 接受.
          content: blocks as unknown as Array<Anthropic.ContentBlockParam>,
        });
        continue;
      }
      out.push({ role: 'assistant', content: m.content });
      continue;
    }
  }
  // loop 结束: flush 最后一批 tool_results (避免末尾独立 tool 消息丢失)
  flushToolResults();
  // tool schema: OAI {name, description, parameters} → Anthropic {name, description, input_schema}
  // 1c.5 拍板: 走 Tool 类型 (跟 SDK 对齐), 不拆 ToolUnion (Bash20250124 等 built-in 工具暂不用).
  let anthropicTools: Anthropic.Tool[] | undefined;
  if (tools !== undefined && tools.length > 0) {
    anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as unknown as Anthropic.Tool.InputSchema,
    }));
  }
  const out2: { system: string | undefined; messages: AnthropicMessageParam[]; tools?: Anthropic.Tool[] } = { system, messages: out };
  if (anthropicTools !== undefined) out2.tools = anthropicTools;
  return out2;
}

/** Map LLMClient 通用 tool_choice (OAI 风格) → Anthropic ToolChoice. */
function mapToolChoice(choice: 'auto' | 'none' | 'required'): Anthropic.ToolChoice {
  switch (choice) {
    case 'auto':
      return { type: 'auto' };
    case 'none':
      return { type: 'none' };
    case 'required':
      return { type: 'any' }; // Anthropic 协议 'any' 强制至少调 1 个, 跟 OAI 'required' 等价
  }
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
  // 拼 text + 提取 tool_use (1c.5 实施, 1b.5 留空)
  let content = '';
  const toolCalls: ToolCall[] = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      content = content === '' ? block.text : `${content}${block.text}`;
    } else if (block.type === 'tool_use') {
      // Sprint 1c.5 (1c-revive-2-B-1): tool_use block → OAI-style ToolCall (跟 DeepSeek shape 对齐)
      // Anthropic SDK 给 input: unknown, 我们假设是 parsed object (runToolLoop 给 args object)
      const input = block.input;
      const args: Record<string, unknown> =
        typeof input === 'object' && input !== null
          ? (input as Record<string, unknown>)
          : {};
      toolCalls.push({ id: block.id, name: block.name, args });
    }
    // thinking / redacted_thinking 跳过 (跟 1b.5 范围一致)
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
 *
 * B1 拍板 (Sprint 1b.5 Step 2): cached_tokens = (cache_creation ?? 0) + (cache_read ?? 0).
 *
 * ⚠️ 重要语义修正 (F4 拍板 2026-06-03, review 找到):
 * Anthropic 官方 prompt caching 文档: total input tokens = input_tokens + cache_creation_input_tokens
 * + cache_read_input_tokens. 之前 Step 2 写时把 input_tokens 当"总 prompt" 是错的, 漏算 cache
 * 字段对应的 token 总量. 修法:
 *
 * - total_prompt = input_tokens + cache_creation + cache_read
 * - cached_tokens = cache_creation + cache_read (跟 Step 2 一致)
 * - tokens_uncached = total_prompt - cached_tokens = input_tokens (不变量)
 * - cache_hit_rate = cached_tokens / total_prompt (cache 命中率, 包括 write + read)
 *
 * **Cost 1b.5 保守策略** (F4 拍板): cache_creation 跟 cache_read 价格不同 (Sonnet 1h TTL write
 * \$3.75/M, read \$0.30/M, 比例 12.5×), 1b.5 pricing 模型**不**拆 cache_write vs cache_read 字段.
 * 为避免假装知道 cache_creation 价格, **保守**: cache_creation OR cache_read 任一非零 →
 * cost_turn/cost_currency 字段 absent. 留 sprint 2 加 `cache_write_per_m` 字段.
 * - 注意: tokens_uncached 仍**可**算 (是 input_tokens, 跟 cache 字段无关), 不受 cost 限制
 *
 * 接受 Usage | MessageDeltaUsage (后者无 cache_creation / cache_read, 视为 0).
 * Sprint 1b.5 Step 2: 流末尾 message_delta event.usage 是 MessageDeltaUsage, 走 delta 路径
 * 不算 cost, 真实生产靠 stream.finalMessage() 拿完整 Usage.
 */
export function parseAnthropicUsage(
  usage: AnthropicUsage | MessageDeltaUsage,
  fallbackModel: ModelId,
  pricing?: PricingConfig,
): Usage | undefined {
  // MessageDeltaUsage (流末尾 message_delta 事件): 只有 output_tokens, 拿不到 input/cache.
  //   → 视为 delta 增量, 不算完整 cost. 真实生产靠 stream.finalMessage() 拿完整 Usage.
  if (!('input_tokens' in usage)) {
    return {
      prompt_tokens: 0,
      completion_tokens: usage.output_tokens,
      total_tokens: usage.output_tokens,
    };
  }
  // 此后 usage 一定是 AnthropicUsage (有 input_tokens + cache_creation + cache_read)
  const full = usage as AnthropicUsage;
  // F4 修正: total_prompt = input + cache_creation + cache_read (官方文档)
  const cacheCreation = full.cache_creation_input_tokens ?? 0;
  const cacheRead = full.cache_read_input_tokens ?? 0;
  const cached = cacheCreation + cacheRead;
  const totalPrompt = full.input_tokens + cached;
  const completion = full.output_tokens;
  const total = totalPrompt + completion;
  const out: Usage = {
    prompt_tokens: totalPrompt, // 跟 DeepSeek OAI shape 字段对齐 (prompt = 全部输入, 含 cache)
    completion_tokens: completion,
    total_tokens: total,
  };
  if (cached > 0) out.cached_tokens = cached;
  // tokens_uncached 仍算 (跟 cache 字段无关, 跟 computeCost 内部算的 uncached 一致)
  if (cached > 0) out.tokens_uncached = full.input_tokens; // = totalPrompt - cached
  // F4 保守: cache_creation OR cache_read 非零 → cost_turn 字段 absent. 留 sprint 2 加 cache_write_per_m 字段.
  // 1b.5 pricing 模型只有 cache_miss / cache_hit / completion, 不能区分 cache_creation 跟
  // cache_read 的不同价. 假装按 cache_hit 价算 cache_creation 会**低估** Sonnet 12.5×.
  if (cached === 0) {
    // 跟 parseOaiSseUsageField 一致, 透传 pricing + model 给 computeCost
    // cached=0 (LLM 显式说 0 cache hit) → 走完整 4 字段路径, 跟 OAI shape 对齐
    const breakdown = computeCost(pricing, fallbackModel, totalPrompt, completion, 0);
    if (breakdown !== undefined) {
      out.cache_hit_rate = breakdown.cache_hit_rate;
      if (breakdown.cost_turn !== undefined) out.cost_turn = breakdown.cost_turn;
      if (breakdown.cost_currency !== undefined) out.cost_currency = breakdown.cost_currency;
      out.tokens_uncached = breakdown.tokens_uncached;
    }
  } else {
    // cache_creation OR cache_read 非零: cost 字段 absent, 但 cache_hit_rate 仍算 (观测)
    out.cache_hit_rate = totalPrompt > 0 ? cached / totalPrompt : 0;
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
