/**
 * @deepwhale/llm — 公共类型
 *
 * Sprint 0.3 范围：非流式 chat + 5 个 LLMError 子类。
 * Sprint 1a 扩展：system/tool role + tool_calls + stream() + usage + retry metadata。
 * Sprint 1b 再加：prompt cache、cost accounting、canonical schema。
 */

import type { Brand } from '@deepwhale/core';

/** 模型 ID 的品牌类型，避免把 'deepseek-chat' 当成任意 string 传来传去。 */
export type ModelId = Brand<string, 'ModelId'>;

/** Role 联合 — Sprint 1a 加 'system' / 'tool'(tool loop 需要)。 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * LLM 调用的 tool 调用描述。Sprint 1a 最小：
 * - id: 由 LLM 返回,tool 响应里 echo 回去
 * - name: tool 名(去 registry 查)
 * - args: tool 参数对象(已 JSON 解析,不是 string)
 *
 * Sprint 1b+ 会在 tool_loop 里用这个 type guard args 是否合法(schema 校验)。
 */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/**
 * 单条 chat message。Sprint 1a:
 * - role: 加 'system' / 'tool'
 * - content: assistant 在有 tool_calls 时可为空字符串(OAI spec)
 * - tool_calls: assistant 消息携带
 * - tool_call_id: tool 消息携带,echo 上面那个 id
 * - name: tool 消息携带,工具名(OAI 协议要求,便于审计)
 */
export interface ChatMessage {
  role: Role;
  content: string;
  tool_calls?: ReadonlyArray<ToolCall>;
  tool_call_id?: string;
  name?: string;
}

/**
 * Token usage 来自 LLM 响应。Sprint 1a: OAI 标准 + cached_tokens。
 * Sprint 1b: 加 cache_hit_rate / cost_turn / tokens_uncached (可观测性)。
 *
 * OAI 标准字段 + DeepSeek 扩展:
 * - prompt_tokens / completion_tokens / total_tokens
 * - cached_tokens (DeepSeek V4 起, 命中 cache 的 token 数)
 *
 * Sprint 1b 扩展 (Prefix-cache 可观测性):
 * - cache_hit_rate: 0..1, cached_tokens / prompt_tokens。LLM 不返 cached_tokens 时 undefined。
 * - cost_turn: 本次 turn 估算费用 (¥), 按 V4-Flash pricing hardcode。Sprint 1c 抽 config.toml。
 * - tokens_uncached: prompt_tokens - cached_tokens, 方便人眼扫读"实际新付的 token"。
 *
 * Sprint 1a: cache_hit_rate 仅做总 cost 估算, 没暴露。Sprint 1b 起可观测。
 */
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
  /** 0..1, cached_tokens / prompt_tokens。LLM 不返 cached_tokens 时 undefined。 */
  cache_hit_rate?: number;
  /** 本 turn 估算费用 (¥), V4-Flash pricing hardcode (2026-06)。
   *  cache hit 价: ¥0.1/M, cache miss 价: ¥0.5/M, completion: ¥1/M。Sprint 1c 抽 config.toml。 */
  cost_turn?: number;
  /** prompt_tokens - cached_tokens, "实际新付"的 token 数, 方便人眼扫读。 */
  tokens_uncached?: number;
}

/**
 * Sprint 1b: 根据 prompt/cached/completion token 算 3 个可观测字段。
 * 输入: prompt/completion/cached tokens (OAI 标准 + DeepSeek cached_tokens)
 * 输出: cache_hit_rate / cost_turn / tokens_uncached
 *
 * 不传 cached_tokens 时, 3 个字段全 undefined(避免假数据, 跟 Sprint 1a Optional 语义对齐)。
 *
 * 公式:
 * - tokens_uncached = max(0, prompt - cached)
 * - cache_hit_rate = cached / prompt  (prompt=0 时 0, 避免除零)
 * - cost_turn = tokens_uncached * 0.0005 + cached * 0.0001 + completion * 0.001
 *   (V4-Flash: cache miss ¥0.5/M, cache hit ¥0.1/M, completion ¥1/M, 单位 ¥/token)
 */
export interface CostBreakdown {
  cache_hit_rate: number;
  cost_turn: number;
  tokens_uncached: number;
}

export function computeCostBreakdown(
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number | undefined,
): CostBreakdown | undefined {
  if (cachedTokens === undefined) return undefined;
  const tokensUncached = Math.max(0, promptTokens - cachedTokens);
  const hitRate = promptTokens > 0 ? cachedTokens / promptTokens : 0;
  // V4-Flash pricing (2026-06, 单位: ¥/token)
  const costTurn = tokensUncached * 0.0005 + cachedTokens * 0.0001 + completionTokens * 0.001;
  return {
    cache_hit_rate: hitRate,
    cost_turn: costTurn,
    tokens_uncached: tokensUncached,
  };
}

/** chat() 完整调用的返回值。Sprint 1a 加 tool_calls + usage。 */
export interface ChatResult {
  model: ModelId;
  content: string;
  tool_calls?: ReadonlyArray<ToolCall>;
  usage?: Usage;
  /**
   * finish_reason:
   * - 'stop': 自然结束
   * - 'tool_calls': LLM 决定调工具
   * - 'length': 触达 max_tokens
   * - 'content_filter': 触发安全过滤
   */
  finish_reason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

/**
 * 流式 chunk。Sprint 1a 极简:
 * - delta.content: 增量文本(可能为空,如纯 tool_calls 增量)
 * - delta.tool_calls: 增量 tool_call(Sprint 1a 一次性返回完整,Sprint 1b+ 再支持 incremental)
 * - usage: 只在最后一个 chunk 出现(OAI 协议)
 * - finish_reason: 同 ChatResult
 */
export interface ChatChunk {
  delta: {
    content?: string;
    tool_calls?: ReadonlyArray<ToolCall>;
  };
  usage?: Usage;
  finish_reason?: ChatResult['finish_reason'];
}

/**
 * LLM 客户端的抽象接口。Sprint 1a 加 stream() + tools/tool_choice 字段。
 *
 * - chat(): 非流式,一次性返回完整结果
 * - stream(): 流式,逐 chunk 回调(onChunk 同步;onComplete 异步 return final)
 *
 * @throws APIKeyMissingError — API key 未设置
 * @throws LLMRateLimitError — 429(retry 透传后仍未恢复)
 * @throws LLMAuthError      — 401/403
 * @throws LLMNetworkError   — 网络/DNS 失败
 * @throws LLMUnknownError   — 其它 5xx 或 JSON 解析失败
 * @throws LLMStreamError    — SSE 解析中途断流
 */
export interface LLMClient {
  readonly model: ModelId;

  /**
   * 发送一组 messages,拿到助手完整回复(非流式)。
   *
   * Sprint 1a 新增:
   * - tools: 工具 schema 列表(LLM 看到后可能决定调)
   * - tool_choice: 'auto' / 'none' / 'required'(OAI 标准)
   *
   * retry: 内部对 429 / 5xx / network error 自动指数退避(默认 3 次),
   *         全失败才抛 LLMError。Sprint 1a 简化为固定 3 次。
   */
  chat(
    messages: ChatMessage[],
    options?: {
      signal?: AbortSignal;
      tools?: ReadonlyArray<LLMToolSchema>;
      tool_choice?: 'auto' | 'none' | 'required';
    },
  ): Promise<ChatResult>;

  /**
   * 流式 chat。Sprint 1a 新增。
   *
   * 用法:
   *   for await (const chunk of client.stream(messages, { onChunk })) {
   *     // chunk = ChatChunk
   *   }
   *
   * 也支持 callback 模式(更简单,适合 REPL):
   *   await client.stream(messages, { onChunk: (c) => out.write(c.delta.content ?? '') });
   *
   * retry 行为: 内部 stream 重连在 Sprint 1a **不做**(流式断流语义复杂),
   * 整个 stream 失败抛 LLMError 让 caller 决定(Sprint 1b+ 补断点续传)。
   */
  stream(
    messages: ChatMessage[],
    options: {
      signal?: AbortSignal;
      tools?: ReadonlyArray<LLMToolSchema>;
      tool_choice?: 'auto' | 'none' | 'required';
      onChunk: (chunk: ChatChunk) => void;
    },
  ): Promise<ChatResult>;
}

/**
 * Sprint 1a 极简:复用 OpenAI function-calling 协议 + ToolInputSchema 兼容形态。
 *
 * 不用 import @deepwhale/coding-agent 避免循环依赖 — Tool 那边把 schema 转成
 * 这个形态即可(structural typing,运行时不影响)。
 */
export interface LLMToolSchema {
  name: string;
  description: string;
  parameters: LLMToolParametersSchema;
}

/** OAI function-calling 参数 schema(简化形态,跟 coding-agent 的 ToolInputSchema 兼容)。 */
export interface LLMToolParametersSchema {
  readonly type: 'object';
  readonly properties: Record<string, LLMToolParamSchema>;
  readonly required?: ReadonlyArray<string>;
}

export type LLMToolParamSchema =
  | { type: 'string'; description: string; enum?: ReadonlyArray<string> }
  | { type: 'number'; description: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description: string }
  | { type: 'array'; description: string; items: LLMToolParamSchema };

/** Sprint 1a：SSE 流中途断流专用。Sprint 1b 再加 retry/续传。 */
export class LLMStreamError extends Error implements LLMError {
  override readonly name = 'LLMStreamError' as const;
  readonly isLLMError = true as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

// ---- 错误类型（用 instanceof + 标签字段） ----
//
// 设计：所有子类继承 Error.cause（标准 ES2022）+ 自带 status/可选 metadata。
// 不用 abstract class 标记：避免和 Error.cause readonly 实例属性冲突。
// Sprint 0.3 极简：5 个子类。Sprint 1+ 加 stream 中断、retry 计数等。

export interface LLMError {
  readonly isLLMError: true;
  readonly name: string;
  readonly message: string;
  readonly cause?: unknown;
}

/** 类型守卫：通过 isLLMError 标签识别 LLM 派生的 Error。 */
export function isLLMError(err: unknown): err is LLMError {
  return err instanceof Error && (err as { isLLMError?: unknown }).isLLMError === true;
}

export class APIKeyMissingError extends Error implements LLMError {
  override readonly name = 'APIKeyMissingError' as const;
  readonly isLLMError = true as const;
  constructor(message: string) {
    super(message);
  }
}

export class LLMRateLimitError extends Error implements LLMError {
  override readonly name = 'LLMRateLimitError' as const;
  readonly isLLMError = true as const;
  readonly status = 429 as const;
  constructor(message: string) {
    super(message);
  }
}

export class LLMAuthError extends Error implements LLMError {
  override readonly name = 'LLMAuthError' as const;
  readonly isLLMError = true as const;
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class LLMNetworkError extends Error implements LLMError {
  override readonly name = 'LLMNetworkError' as const;
  readonly isLLMError = true as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class LLMUnknownError extends Error implements LLMError {
  override readonly name = 'LLMUnknownError' as const;
  readonly isLLMError = true as const;
  readonly status?: number;
  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message);
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    if (options?.status !== undefined) this.status = options.status;
  }
}
