/**
 * @deepwhale/llm — OpenAI 兼容 LLM 客户端
 *
 * Sprint 0.3 落地：
 * - DeepSeek OpenAI 兼容 HTTP 客户端（chat/非流式/abort/timeout）
 * - 4 种 LLMError 子类（APIKeyMissing / RateLimit / Auth / Network / Unknown）
 * - fetch 注入 → 单测 100% mock
 *
 * Sprint 1+ 扩：流式、tool_calls、prompt cache、Reasonix、retry/backoff、token 计量。
 */

export const DEEPWHALE_LLM_VERSION = '0.1.0';
export { DeepSeekClient, DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from './deepseek-client.js';
export type { DeepSeekClientOptions } from './deepseek-client.js';
export type { LLMClient, ChatMessage, ChatResult, ModelId, Role, LLMError } from './types.js';
export { isLLMError } from './types.js';
export {
  APIKeyMissingError,
  LLMRateLimitError,
  LLMAuthError,
  LLMNetworkError,
  LLMUnknownError,
} from './types.js';
