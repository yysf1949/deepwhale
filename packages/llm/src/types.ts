/**
 * @deepwhale/llm — 公共类型
 *
 * Sprint 0.3 极简：只定义 chat 一次对话需要的最小类型。
 * Sprint 1+ 才扩展：tool_calls、prompt cache、token accounting。
 */

import type { Brand } from '@deepwhale/core';

/** 模型 ID 的品牌类型，避免把 'deepseek-chat' 当成任意 string 传来传去。 */
export type ModelId = Brand<string, 'ModelId'>;

/** Role 联合 — Sprint 0 只用 'user' / 'assistant'。Sprint 1+ 加 'system' / 'tool'。 */
export type Role = 'user' | 'assistant';

/** 单条 chat message。Sprint 0 不带 tool_calls（v1.0.x 才加）。 */
export interface ChatMessage {
  role: Role;
  content: string;
}

/** chat() 完整调用的返回值。Sprint 0 不返回 usage（v1.0.x 才上）。 */
export interface ChatResult {
  model: ModelId;
  content: string;
}

/**
 * LLM 客户端的抽象接口。
 * 实现：DeepSeekClient（OpenAI 兼容）。Sprint 1+ 扩 Anthropic / 自家 Reasonix。
 */
export interface LLMClient {
  /** 模型 ID（用来回显给用户） */
  readonly model: ModelId;

  /**
   * 发送一组 messages，拿到助手完整回复（非流式）。
   * Sprint 0.3 只实现非流式；流式挪 v1.0.x。
   *
   * @throws APIKeyMissingError — API key 未设置
   * @throws LLMRateLimitError — 429
   * @throws LLMAuthError      — 401/403
   * @throws LLMNetworkError   — 网络/DNS 失败
   * @throws LLMUnknownError   — 其它 5xx 或 JSON 解析失败
   */
  chat(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult>;
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
