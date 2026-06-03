/**
 * Sprint 1b.5 Step 1: pricing config.toml 化的 unit test.
 *
 * 覆盖 plan 列举的 8 tests:
 * 1. parsePricingConfig: 简单 model 块
 * 2. parsePricingConfig: 字段类型错报错
 * 3. parsePricingConfig: currency 不在 enum 报错
 * 4. loadPricingConfig: 不传 userPath → 用内置 ship-in default
 * 5. loadPricingConfig: 显式传 userPath 但文件不存在 → 抛 PricingConfigParseError
 * 6. loadPricingConfig: 显式传 userPath 但文件损坏 → 抛 PricingConfigParseError
 * 7. computeCost: 命中 model → 完整 4 字段含 cost_currency
 * 8. computeCost: cached=undefined → 整体 undefined
 * 9. computeCost: cached 有但 pricing 找不到 model → 返 base 2 字段, cost 字段 absent
 * 10. computeCost: cached=prompt 返 cache_hit_rate=1
 * 11. cost_turn 精度: 1M token cache miss + 1M completion (V4-Flash CNY) → 0.5 + 1.0 = 1.5
 * 12. Anthropic USD: Sonnet 4.5 输入 1M cache miss + 1M completion → 3 + 15 = 18
 * 13. Anthropic USD cache hit: Sonnet 4.5 cached=1M + uncached=0 + completion=1M → 0.30 + 15 = 15.30
 * 14. Anthropic Opus 4.5 (P1 corrected): cache_miss=1M + completion=1M → 5 + 25 = 30
 * 15. loadPricingConfig 默认: ship-in deepseek-v4-flash 存在, claude-sonnet-4-5 存在, claude-opus-4-5 存在
 */

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import {
  parsePricingConfig,
  loadPricingConfig,
  computeCost,
  PricingConfigParseError,
} from '../src/pricing-config.js';
import type { ModelId } from '../src/types.js';

const V4FlashCNY = 'deepseek-v4-flash' as ModelId;
const SonnetUSD = 'claude-sonnet-4-5' as ModelId;
const OpusUSD = 'claude-opus-4-5' as ModelId;

describe('parsePricingConfig', () => {
  it('1. 简单 model 块解析正确', () => {
    const toml = `
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`;
    const cfg = parsePricingConfig(toml);
    expect(cfg.models['deepseek-v4-flash']).toEqual({
      cache_miss_per_m: 0.5,
      cache_hit_per_m: 0.1,
      completion_per_m: 1.0,
      currency: 'CNY',
    });
  });

  it('2. 字段类型错 (cache_miss_per_m = "abc") → 抛 PricingConfigParseError', () => {
    const toml = `
[models.test]
cache_miss_per_m = "abc"
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`;
    expect(() => parsePricingConfig(toml)).toThrow(PricingConfigParseError);
  });

  it('3. currency 不在 enum (currency = "EUR") → 抛 PricingConfigParseError', () => {
    const toml = `
[models.test]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "EUR"
`;
    expect(() => parsePricingConfig(toml)).toThrow(PricingConfigParseError);
  });
});

describe('loadPricingConfig', () => {
  it('4. 不传 userPath → 用内置 ship-in default.toml (含 deepseek-v4-flash + claude-sonnet-4-5 + claude-opus-4-5)', async () => {
    const cfg = await loadPricingConfig();
    expect(cfg.models['deepseek-v4-flash']).toBeDefined();
    expect(cfg.models['claude-sonnet-4-5']).toBeDefined();
    expect(cfg.models['claude-opus-4-5']).toBeDefined();
  });

  it('5. 显式传 userPath 但文件不存在 → 抛 PricingConfigParseError (不静默 fallback)', async () => {
    const nonExistent = join(tmpdir(), `non-existent-pricing-${Date.now()}.toml`);
    await expect(loadPricingConfig(nonExistent)).rejects.toThrow(PricingConfigParseError);
  });

  it('6. 显式传 userPath 但文件损坏 (非 TOML) → 抛 PricingConfigParseError', async () => {
    const badPath = join(tmpdir(), `bad-pricing-${Date.now()}.toml`);
    await writeFile(badPath, 'this is not [valid toml', 'utf-8');
    try {
      await expect(loadPricingConfig(badPath)).rejects.toThrow(PricingConfigParseError);
    } finally {
      await unlink(badPath);
    }
  });
});

describe('computeCost (R7 纯函数, 3 种返回路径)', () => {
  it('7. 命中 model → 完整 4 字段 (含 cost_currency)', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, V4FlashCNY, 1000, 100, 800);
    expect(result).toBeDefined();
    expect(result?.cache_hit_rate).toBeCloseTo(0.8);
    expect(result?.tokens_uncached).toBe(200);
    expect(result?.cost_turn).toBeCloseTo(0.00028);
    expect(result?.cost_currency).toBe('CNY');
  });

  it('8. cached=undefined → 整体 undefined', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, V4FlashCNY, 1000, 100, undefined);
    expect(result).toBeUndefined();
  });

  it('9. cached 有但 pricing 找不到 model → base 2 字段, cost 字段 absent', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, 'unknown-model' as ModelId, 1000, 100, 800);
    expect(result).toBeDefined();
    expect(result?.cache_hit_rate).toBeCloseTo(0.8);
    expect(result?.tokens_uncached).toBe(200);
    expect(result?.cost_turn).toBeUndefined();
    expect(result?.cost_currency).toBeUndefined();
  });

  it('10. pricing undefined 整个走 R7 中间路径 → base 2 字段, cost 字段 absent', () => {
    const result = computeCost(undefined, V4FlashCNY, 1000, 100, 800);
    expect(result).toBeDefined();
    expect(result?.cache_hit_rate).toBeCloseTo(0.8);
    expect(result?.cost_turn).toBeUndefined();
    expect(result?.cost_currency).toBeUndefined();
  });

  it('11. model undefined 走 R7 中间路径', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, undefined, 1000, 100, 800);
    expect(result?.cost_turn).toBeUndefined();
  });

  it('12. cached=prompt 返 cache_hit_rate=1 (全 hit)', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, V4FlashCNY, 1000, 100, 1000);
    expect(result?.cache_hit_rate).toBe(1);
    expect(result?.tokens_uncached).toBe(0);
  });

  it('13. cost_turn 精度: 1M token cache miss + 1M completion (V4-Flash CNY) → 0.5 + 1.0 = 1.5', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, V4FlashCNY, 1_000_000, 1_000_000, 0);
    expect(result?.cost_turn).toBeCloseTo(1.5, 5);
    expect(result?.cost_currency).toBe('CNY');
  });

  it('14. Anthropic USD: Sonnet 4.5 cache miss 1M + completion 1M → 3 + 15 = 18', () => {
    const cfg = parsePricingConfig(`
[models.claude-sonnet-4-5]
cache_miss_per_m = 3.0
cache_hit_per_m  = 0.30
completion_per_m = 15.0
currency         = "USD"
`);
    const result = computeCost(cfg, SonnetUSD, 1_000_000, 1_000_000, 0);
    expect(result?.cost_turn).toBeCloseTo(18, 5);
    expect(result?.cost_currency).toBe('USD');
  });

  it('15. Anthropic USD cache hit: Sonnet 4.5 cached=1M + uncached=0 + completion=1M → 0.30 + 15 = 15.30', () => {
    const cfg = parsePricingConfig(`
[models.claude-sonnet-4-5]
cache_miss_per_m = 3.0
cache_hit_per_m  = 0.30
completion_per_m = 15.0
currency         = "USD"
`);
    const result = computeCost(cfg, SonnetUSD, 1_000_000, 1_000_000, 1_000_000);
    expect(result?.cost_turn).toBeCloseTo(15.3, 5);
    expect(result?.cost_currency).toBe('USD');
  });

  it('16. Anthropic Opus 4.5 (P1 corrected): cache_miss=1M + completion=1M → 5 + 25 = 30 USD', () => {
    const cfg = parsePricingConfig(`
[models.claude-opus-4-5]
cache_miss_per_m = 5.0
cache_hit_per_m  = 0.50
completion_per_m = 25.0
currency         = "USD"
`);
    const result = computeCost(cfg, OpusUSD, 1_000_000, 1_000_000, 0);
    expect(result?.cost_turn).toBeCloseTo(30, 5);
    expect(result?.cost_currency).toBe('USD');
  });

  it('17. prompt=0 边界 (避免除零) → cache_hit_rate=0, cost 仍算', () => {
    const cfg = parsePricingConfig(`
[models.deepseek-v4-flash]
cache_miss_per_m = 0.5
cache_hit_per_m  = 0.1
completion_per_m = 1.0
currency         = "CNY"
`);
    const result = computeCost(cfg, V4FlashCNY, 0, 10, 0);
    expect(result?.cache_hit_rate).toBe(0);
    expect(result?.tokens_uncached).toBe(0);
    // 0 + 0 + 10 * 1/1e6 = 0.00001
    expect(result?.cost_turn).toBeCloseTo(0.00001, 6);
  });
});
