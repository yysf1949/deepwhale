/**
 * @deepwhale/llm — OpenAI 兼容 LLM 客户端
 *
 * Sprint 0.3 落地：
 * - DeepSeek OpenAI 兼容 HTTP 客户端（chat/非流式/abort/timeout）
 * - 4 种 LLMError 子类（APIKeyMissing / RateLimit / Auth / Network / Unknown）
 * - fetch 注入 → 单测 100% mock
 *
 * Sprint 1a 扩展：流式 + tool_calls + retry/backoff + usage + 6 个 LLMError 子类
 * Sprint 1b 再加：cache_hit_rate、canonical schema
 * Sprint 1b.5: pricing config.toml 化 — CostBreakdown / computeCostBreakdown
 *   从 types.js 整体迁移到 pricing-config.js (per-model currency, R7 缺失定价中间路径).
 */

export const DEEPWHALE_LLM_VERSION = '0.1.0';
export { DeepSeekClient, DEEPSEEK_BASE_URL, DEEPSEEK_DEFAULT_MODEL } from './deepseek-client.js';
export type { DeepSeekClientOptions } from './deepseek-client.js';
export { canonicalizeSchema } from './canonicalize-schema.js';
export {
  parsePricingConfig,
  loadPricingConfig,
  computeCost,
  PricingConfigParseError,
} from './pricing-config.js';
export type {
  ModelPricing,
  PricingConfig,
  CostBreakdownResult,
} from './pricing-config.js';
export type {
  LLMClient,
  ChatMessage,
  ChatResult,
  ChatChunk,
  ToolCall,
  Usage,
  ModelId,
  Role,
  LLMError,
  LLMToolSchema,
  LLMToolParametersSchema,
  LLMToolParamSchema,
} from './types.js';
export { isLLMError } from './types.js';
export {
  APIKeyMissingError,
  LLMRateLimitError,
  LLMAuthError,
  LLMNetworkError,
  LLMUnknownError,
  LLMStreamError,
} from './types.js';
