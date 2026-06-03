/**
 * @deepwhale/llm — Pricing 配置 (Sprint 1b.5 Step 1)
 *
 * 把原本 hardcode 在 `types.ts:computeCostBreakdown` 的 V4-Flash pricing 抽到
 * ship-in + 用户可覆盖的 TOML 配置。Per-model currency (DeepSeek CNY, Anthropic USD),
 * 不在 UI 层做汇率换算 — UI 从 `cost_currency` 字段读 symbol (¥ / $)。
 *
 * ## 设计原则 (R7 / Step 0 拍板, 2026-06-03)
 *
 * 1. `loadPricingConfig(userPath)`:
 *    - 显式传 `userPath` 但文件不存在或非法 → **抛 PricingConfigParseError** (不静默)
 *    - 不传 → 加载 ship-in `pricing.default.toml`
 *
 * 2. `computeCost(pricing, model, ...)` 是**纯函数**: 无 console / 无 logger / 无 IO。
 *    3 种返回路径 (`CostBreakdownResult` 联合类型):
 *    - 整体 `undefined`: 没 `cached_tokens` → 4 字段全 absent
 *    - `{ base, no cost }`: 有 cache 但 pricing 找不到 model → 有 cache_hit_rate / tokens_uncached, 缺 cost
 *    - 完整 4 字段: 找到
 *
 * 3. Warning 责任在 caller (client/mode 边界), 纯函数零副作用。
 *
 * 4. UI/RPC: `cost_turn` absent 时字段不显示 (absent 不是 null), 读 `cost_currency` 决 symbol。
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import type { ModelId } from './types.js';

// ---- 类型 ----

/**
 * 单个模型的定价。Currency 跟价格数字绑定, UI 层不做汇率换算。
 */
export interface ModelPricing {
  /** 缓存未命中 input 价格, /M tokens. */
  cache_miss_per_m: number;
  /** 缓存命中 input 价格, /M tokens. */
  cache_hit_per_m: number;
  /** 输出价格, /M tokens. */
  completion_per_m: number;
  /** Currency 跟价格数字绑定, 不在 UI 层做汇率换算. */
  currency: 'CNY' | 'USD';
}

/**
 * 完整的 pricing 配置 (TOML 解析后).
 *
 * `models` 必须非空. 找不到 model 时**不静默 fallback** (见 R7).
 */
export interface PricingConfig {
  models: Record<string, ModelPricing>;
}

/**
 * `computeCost` 的 3 种返回结果 (联合类型).
 *
 * - `undefined`: 没 `cached_tokens` (Provider 也不支持 cache) → 4 字段全 absent
 * - `{ base, no cost }`: 有 cache 但 pricing 找不到 model 或 pricing 本身 undefined
 *   → 有 cache_hit_rate + tokens_uncached, 缺 cost_turn + cost_currency
 * - 完整 4 字段: 找到 model → cost_turn 和 cost_currency 同步存在 (不变量)
 */
export type CostBreakdownResult =
  | undefined
  | {
      cache_hit_rate: number;
      tokens_uncached: number;
      /** cost_turn 存在时 cost_currency 必须也存在 (类型不变量). */
      cost_turn?: number;
      cost_currency?: 'CNY' | 'USD';
    };

/**
 * pricing TOML 解析/加载错误. `userPath` 显式传但文件不存在/非法时抛.
 */
export class PricingConfigParseError extends Error {
  override readonly name = 'PricingConfigParseError' as const;
  constructor(
    message: string,
    readonly userPath: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

// ---- 纯函数 (无 console, 无 IO) ----

/**
 * 解析 TOML string → PricingConfig. 纯函数, 无 IO.
 *
 * 校验:
 * - 必须有 `[models.xxx]` 块 (至少 1 个)
 * - 每个 model 4 字段全必填 (cache_miss_per_m / cache_hit_per_m / completion_per_m / currency)
 * - currency 必须在 'CNY' | 'USD' enum
 * - 价格数字必须非负有限
 *
 * @throws PricingConfigParseError — malformed / 缺字段 / currency 错 / 数字非有限
 */
export function parsePricingConfig(toml: string): PricingConfig {
  let raw: unknown;
  try {
    raw = parseToml(toml);
  } catch (cause) {
    throw new PricingConfigParseError(`TOML parse failed: ${(cause as Error).message}`, '<inline>', { cause });
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PricingConfigParseError('TOML root must be a table', '<inline>');
  }

  const root = raw as Record<string, unknown>;
  const modelsRaw = root['models'];

  if (modelsRaw === undefined || modelsRaw === null) {
    throw new PricingConfigParseError('Missing required section: [models.*]', '<inline>');
  }
  if (typeof modelsRaw !== 'object' || Array.isArray(modelsRaw)) {
    throw new PricingConfigParseError('Section [models.*] must be a table', '<inline>');
  }

  const models: Record<string, ModelPricing> = {};
  for (const [modelId, value] of Object.entries(modelsRaw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new PricingConfigParseError(
        `[models.${modelId}] must be a table`,
        '<inline>',
      );
    }
    const block = value as Record<string, unknown>;
    const cacheMiss = block['cache_miss_per_m'];
    const cacheHit = block['cache_hit_per_m'];
    const completion = block['completion_per_m'];
    const currency = block['currency'];

    for (const [field, val] of [
      ['cache_miss_per_m', cacheMiss],
      ['cache_hit_per_m', cacheHit],
      ['completion_per_m', completion],
    ] as const) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
        throw new PricingConfigParseError(
          `[models.${modelId}].${field} must be a non-negative finite number, got: ${JSON.stringify(val)}`,
          '<inline>',
        );
      }
    }
    if (currency !== 'CNY' && currency !== 'USD') {
      throw new PricingConfigParseError(
        `[models.${modelId}].currency must be 'CNY' or 'USD', got: ${JSON.stringify(currency)}`,
        '<inline>',
      );
    }
    models[modelId] = {
      cache_miss_per_m: cacheMiss as number,
      cache_hit_per_m: cacheHit as number,
      completion_per_m: completion as number,
      currency,
    };
  }

  if (Object.keys(models).length === 0) {
    throw new PricingConfigParseError('At least one model required in [models.*]', '<inline>');
  }

  return { models };
}

/**
 * 纯函数, 无 console / 无 logger / 无 IO. 3 种返回路径见 `CostBreakdownResult`.
 *
 * 公式: tokens_uncached = max(0, prompt - cached)
 *       cache_hit_rate  = cached / prompt  (prompt=0 时 0, 避免除零)
 *       cost_turn       = tokens_uncached * cache_miss_per_m/1e6
 *                        + cached * cache_hit_per_m/1e6
 *                        + completion * completion_per_m/1e6
 *
 * 把 /M 转 /token 必须除 1e6, 不要直接当 /token 用 (会大 1000×).
 */
export function computeCost(
  pricing: PricingConfig | undefined,
  model: ModelId | undefined,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number | undefined,
): CostBreakdownResult {
  if (cachedTokens === undefined) {
    return undefined;
  }

  const tokensUncached = Math.max(0, promptTokens - cachedTokens);
  const hitRate = promptTokens > 0 ? cachedTokens / promptTokens : 0;

  // model undefined 或 pricing 找不到 model → 走 R7 中间路径
  // (有 cached 但 cost 字段 absent). 不静默 fallback, 不抛错, 不写 0.
  const modelPricing = model !== undefined ? pricing?.models[model] : undefined;
  if (modelPricing === undefined) {
    return {
      cache_hit_rate: hitRate,
      tokens_uncached: tokensUncached,
    };
  }

  const costTurn =
    tokensUncached * (modelPricing.cache_miss_per_m / 1_000_000) +
    cachedTokens * (modelPricing.cache_hit_per_m / 1_000_000) +
    completionTokens * (modelPricing.completion_per_m / 1_000_000);

  return {
    cache_hit_rate: hitRate,
    tokens_uncached: tokensUncached,
    cost_turn: costTurn,
    cost_currency: modelPricing.currency,
  };
}

// ---- IO 函数 (一次启动加载, 注入到 client) ----

/**
 * 加载 pricing config. 三种来源优先级 (高→低):
 * 1. `userPath` 显式指定且存在 → 解析用户文件
 * 2. `userPath` 显式指定但不存在或非法 → **抛 PricingConfigParseError** (不静默 fallback)
 * 3. `userPath` 未传 → 加载 ship-in `pricing.default.toml`
 *
 * hot path 不应调 (走 client.pricing 字段). Step 2 的 AnthropicClient 启动时调一次.
 */
export async function loadPricingConfig(userPath?: string): Promise<PricingConfig> {
  if (userPath === undefined) {
    // 走 ship-in default: 跟 pricing-config.ts 同目录, build 后复制到 dist/.
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/pricing-config.js → dist/pricing.default.toml
    const defaultPath = resolve(here, 'pricing.default.toml');
    return await loadFromPath(defaultPath);
  }
  return await loadFromPath(userPath);
}

async function loadFromPath(path: string): Promise<PricingConfig> {
  let tomlText: string;
  try {
    tomlText = await readFile(path, 'utf-8');
  } catch (cause) {
    const err = cause as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw new PricingConfigParseError(
        `Pricing config not found at: ${path}`,
        path,
        { cause },
      );
    }
    throw new PricingConfigParseError(
      `Failed to read pricing config at ${path}: ${err.message}`,
      path,
      { cause },
    );
  }
  try {
    return parsePricingConfig(tomlText);
  } catch (cause) {
    if (cause instanceof PricingConfigParseError) {
      // 重新抛, 用真实 path 替换 inner 错误的 '<inline>' 占位符.
      // 保留原始 userPath (readonly 字段, 不用 spread 因为 class 自带字段).
      throw new PricingConfigParseError(
        cause.message.replace('<inline>', path),
        path,
        { cause },
      );
    }
    throw cause;
  }
}
