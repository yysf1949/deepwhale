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
 * Token usage 来自 LLM 响应。Sprint 1a 加,Sprint 1b 再加 prompt_cache_* 等字段。
 *
 * OAI 标准字段 + DeepSeek 扩展:
 * - prompt_tokens / completion_tokens / total_tokens
 * - cached_tokens (DeepSeek V4 起,命中 cache 的 token 数)
 *
 * Sprint 1a 只用 total 做 cost 估算。Sprint 1b 再加 cache_hit_rate。
 */
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
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
