/**
 * Sprint 1d.5-A — DeepSeek 多 turn cache hit 真接验证 (X1 b + X4 c 拍板, 2026-06-04)
 *
 * 目的: 1d 验了 1 turn 0-cache 场景的 cost 公式 (cost_turn = 0.000055 CNY, 跟
 * pricing.default.toml cache_miss 1.0 + completion 2.0 手算到浮点噪声内一致).
 *
 * 1d.5-A 验 multi-turn cache 路径:
 * - turn 1: 同 system + user message
 * - turn 2: **同** system + **同** user message (DeepSeek 文档: prefix match 触发 cache)
 *
 * 关键风险 (1b.5-s2.5 R7 "test passed ≠ production works" cousin):
 * mock 用 `prompt_cache_hit_tokens: 800` 灌入, 真实 API **不保证**触发 cache ——
 * 取决于服务端内部 routing / 跨请求 prefix 复用策略. 真接的预期行为是:
 *   - cached_tokens 字段**存在** (API 返, parse 路径对)
 *   - cache_hit_rate 字段**存在** (>= 0, 不强求 > 0, **揭示**真实行为)
 *   - 两次调用都返回完整 usage (shape 不变)
 *
 * 触发条件 (跟 1d 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/deepseek-cache-hit.test.ts
 *
 * 红线 (跟 1d 一致):
 *   1. test 代码**不**直接读 ~/.deepwhale/.env 文件
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR DEEPSEEK_API_KEY undefined → it.skip
 *   - 缺 key 时**不**fail, 单测保持 baseline 绿
 *
 * 真接最小化:
 *   - 2 turn, 都用 deepseek-v4-flash (最便宜, 总成本 < ¥0.002)
 *   - 同 system prompt + 同 user message ("What is 2+2?")
 *   - 非流式 (用 chat() 而非 stream(), 简化 usage 拿取路径)
 *
 * 验证字段:
 *   - 两次都返回 usage
 *   - turn 1 usage.prompt_tokens > 0
 *   - turn 2 usage.prompt_tokens === turn 1 (同 prompt)
 *   - cached_tokens 字段类型正确 (number | undefined)
 *   - cache_hit_rate 字段类型正确 (number | undefined, 0 ≤ r ≤ 1)
 *   - **不**强求 cache_hit_rate > 0 — 真实 API 行为可能 0, 这是观察不是断言
 *   - turn 2 cost_turn 行为: 1b.5 拍板 cache_creation/cache_read 非零时 cost 故意 absent;
 *     若 cached_tokens 仍 === 0 (无 cache 命中), cost 字段应齐全, 跟 1d 公式一致
 *
 * 不验证 (留 1d.5.5+):
 *   - Anthropic 协议下 cache hit (1d.5-B 单独跑)
 *   - 跨 model cache (flash → pro 不复用)
 *   - 跨 session cache
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage } from '../../src/types.js';

// ---- 红线门: 跟 1d 一致 ----

const INTEGRATION_ENABLED = process.env['INTEGRATION'] === '1';
const HAS_DEEPSEEK_KEY =
  typeof process.env['DEEPSEEK_API_KEY'] === 'string' &&
  process.env['DEEPSEEK_API_KEY'] !== '';

const canRun = INTEGRATION_ENABLED && HAS_DEEPSEEK_KEY;

const skipReason = !INTEGRATION_ENABLED
  ? 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")'
  : !HAS_DEEPSEEK_KEY
    ? 'process.env.DEEPSEEK_API_KEY is unset (source ~/.deepwhale/.env first; see README "integration tests")'
    : 'unknown reason';

// ---- 共享 prompt: 触发 prefix cache 的最小设置 ----

const SYSTEM_PROMPT =
  'You are a helpful math assistant. Answer concisely with just the number.';
const USER_PROMPT = 'What is 2+2?';
const MESSAGES: ChatMessage[] = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: USER_PROMPT },
];

// ---- 辅助: 打印字段做基线 (不 echo key, 不 echo content 全文, 只打 usage 数字) ----

interface TurnSnapshot {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens: number | undefined;
  cache_hit_rate: number | undefined;
  cost_turn: number | undefined;
  cost_currency: string | undefined;
  tokens_uncached: number | undefined;
}

function snapshotUsage(u: import('../../src/types.js').Usage | undefined): TurnSnapshot {
  if (u === undefined) {
    return {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cached_tokens: undefined,
      cache_hit_rate: undefined,
      cost_turn: undefined,
      cost_currency: undefined,
      tokens_uncached: undefined,
    };
  }
  return {
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    total_tokens: u.total_tokens,
    cached_tokens: u.cached_tokens,
    cache_hit_rate: u.cache_hit_rate,
    cost_turn: u.cost_turn,
    cost_currency: u.cost_currency,
    tokens_uncached: u.tokens_uncached,
  };
}

function dumpSnapshots(label: string, snaps: TurnSnapshot[]): void {
  // 红线: 只打数字 + label, 不打 env / key / content / 模型细节
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i];
    console.log(
      `[${label}] turn${i + 1}:`,
      JSON.stringify({
        prompt: s.prompt_tokens,
        completion: s.completion_tokens,
        total: s.total_tokens,
        cached: s.cached_tokens,
        hit_rate: s.cache_hit_rate,
        cost: s.cost_turn,
        currency: s.cost_currency,
        uncached: s.tokens_uncached,
      }),
    );
  }
}

// ---- 主测试: 2 turn 同 prompt, 验 shape 稳定 + cache 字段类型 + 揭示真实行为 ----

describe('DeepSeek shim — 1d.5-A 多 turn cache hit 真接 (X1 b + X4 c 拍板)', () => {
  if (!canRun) {
    it.skip(`SKIPPED: ${skipReason}`, () => {
      // noop
    });
    return;
  }

  it('2 turn 同 prompt: 两次 usage shape 一致 + cache 字段类型正确 + 揭示真实 cache 行为', async () => {
    const client = new DeepSeekClient();

    // ---- turn 1: 第一次, 服务端**可能**返 cached_tokens=0 (冷启动) 或 >0 (warm) ----
    const result1 = await client.chat(MESSAGES);
    expect(result1.model).toBe('deepseek-v4-flash');
    expect(result1.finish_reason).toBe('stop');
    expect(result1.usage).toBeDefined();
    if (!result1.usage) return; // narrowed

    // ---- turn 2: 第二次, 同 prompt, 服务端**应该**返 cached_tokens > 0 (prefix match) ----
    // 但**不**强求 — 真实行为由 R7 揭示.
    const result2 = await client.chat(MESSAGES);
    expect(result2.model).toBe('deepseek-v4-flash');
    expect(result2.finish_reason).toBe('stop');
    expect(result2.usage).toBeDefined();
    if (!result2.usage) return; // narrowed

    // ---- 断言层 1: 两次 shape 完全一致 (类型 + 字段) ----
    const snap1 = snapshotUsage(result1.usage);
    const snap2 = snapshotUsage(result2.usage);

    // 1) 两次 prompt_tokens 一致 (同 prompt 输入, 服务端 tokenize 应一致)
    expect(snap2.prompt_tokens).toBe(snap1.prompt_tokens);
    // 2) completion_tokens > 0 (两次都应有 content)
    expect(snap1.completion_tokens).toBeGreaterThan(0);
    expect(snap2.completion_tokens).toBeGreaterThan(0);
    // 3) total = prompt + completion (OAI 不变量, 跟 1d 一致)
    expect(snap1.total_tokens).toBe(snap1.prompt_tokens + snap1.completion_tokens);
    expect(snap2.total_tokens).toBe(snap2.prompt_tokens + snap2.completion_tokens);

    // ---- 断言层 2: cache 字段**类型**正确, 数值合法 (揭示真实, 不强求) ----
    // cached_tokens: number | undefined, 0 ≤ n
    if (snap1.cached_tokens !== undefined) {
      expect(snap1.cached_tokens).toBeGreaterThanOrEqual(0);
      expect(snap1.cached_tokens).toBeLessThanOrEqual(snap1.prompt_tokens);
    }
    if (snap2.cached_tokens !== undefined) {
      expect(snap2.cached_tokens).toBeGreaterThanOrEqual(0);
      expect(snap2.cached_tokens).toBeLessThanOrEqual(snap2.prompt_tokens);
    }

    // cache_hit_rate: number | undefined, 0 ≤ r ≤ 1
    if (snap1.cache_hit_rate !== undefined) {
      expect(snap1.cache_hit_rate).toBeGreaterThanOrEqual(0);
      expect(snap1.cache_hit_rate).toBeLessThanOrEqual(1);
    }
    if (snap2.cache_hit_rate !== undefined) {
      expect(snap2.cache_hit_rate).toBeGreaterThanOrEqual(0);
      expect(snap2.cache_hit_rate).toBeLessThanOrEqual(1);
    }

    // ---- 断言层 3: 1b.5 R-G2 acknowledge — cache 非零时 cost 故意 absent ----
    // 规则 (F4 拍板): cached_tokens > 0 → cost_turn/cost_currency absent
    // cached_tokens = 0 或 undefined → cost 字段齐全
    const t2Cached = snap2.cached_tokens ?? 0;
    if (t2Cached > 0) {
      // cache 触发场景: 1b.5 拍板 cost 字段 absent (cache_write vs cache_read 价不同, 假装按 cache_hit
      // 算会**低估** Sonnet 12.5×). tokens_uncached 仍**可**算 (= input_tokens, 不受 cost 限制).
      expect(snap2.cost_turn).toBeUndefined();
      expect(snap2.cost_currency).toBeUndefined();
      expect(snap2.tokens_uncached).toBeDefined();
    } else {
      // 无 cache 场景: cost 字段齐全, 跟 1d 公式一致
      expect(snap2.cost_turn).toBeGreaterThan(0);
      expect(snap2.cost_currency).toBe('CNY');
      expect(snap2.tokens_uncached).toBe(snap2.prompt_tokens);
    }

    // ---- 断言层 4: turn 2 cost 跟 turn 1 cost 的关系 (揭示真实, 不强求) ----
    // 期望: 触发 cache → turn 2 cost < turn 1 cost (因为 cached 部分按 0.02 ¥/M 而非 1.0 ¥/M 计)
    // 不触发 → turn 2 cost ≈ turn 1 cost (同 prompt 同 cost)
    // **不**断言 turn 2 < turn 1 (R7 揭示), 只**记录**两个数字让你看.
    dumpSnapshots('1d.5-A', [snap1, snap2]);

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content echo 到 console.
    // 此处不调用 console.log(result.content) — 字段断言足够.
  }, 60_000); // 60s timeout: 2 turn × 3 次重试缓冲

  it('content 跟 1d 一致: "4" 或 "four" (case-insensitive)', async () => {
    // 单独一个 it 验 content shape — 1d 用 "Reply with the single word: OK", 1d.5-A 用
    // 2+2=4 验基本问答能力. 这是 1d 漏覆盖的 (1d 只验 "OK" 复读).
    const client = new DeepSeekClient();
    const result = await client.chat(MESSAGES);
    expect(result.content).toBeTruthy();
    // "4" / "four" / "Four" / "4." / "The answer is 4." 都行
    const lower = result.content.toLowerCase();
    const hasFour = lower.includes('4') || lower.includes('four');
    expect(hasFour).toBe(true);
  }, 60_000);
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
// 注释里出现 "DEEPSEEK_API_KEY" 没事 — 那是 env 变量名, 不是 key 值.
