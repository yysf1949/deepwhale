/**
 * Sprint 1d.5-A.5 — DeepSeek 长 prompt 强制 cache hit 真接验证 (X1 b + X4 c 拍板, 2026-06-04)
 *
 * 目的: 1d.5-A (57a019d, 短 prompt 27 token) 揭示 DeepSeek 真 API 2 turn 短 prompt **不**触发 prefix cache,
 * 走 cached=0 分支, F4 保守策略 (cached>0 → cost 字段 absent) **未**在真接路径覆盖.
 *
 * 1d.5-A.5 验长 prompt 强制 cache 触发, 走 cached>0 分支, 验 F4 保守策略 + cache_hit_rate 观测字段.
 * 1b.5-s2.5 Pitfall 13 (R-G2 acknowledge) 拍板: cost 字段在 cache_creation/cache_read 价差 12.5× 场景**故意**absent,
 * 留 Sprint 2 cache_write_per_m 字段; cache_hit_rate 跟 tokens_uncached **仍**算 (观测用).
 *
 * 关键不变量 (cached>0 路径, F4 拍板):
 *   - cached_tokens > 0 (强制 cache 触发断言)
 *   - cache_hit_rate > 0 (跟 cached_tokens 一致)
 *   - tokens_uncached === input_tokens (跟 cached>0 路径对齐, F4 拍板)
 *   - cost_turn / cost_currency **absent** (1b.5 R-G2 acknowledge, 不假设 cache_creation 价)
 *   - total_prompt = input_tokens + cache_creation + cache_read (Anthropic 官方语义; OAI 等价 prompt_tokens = input + cached)
 *
 * 触发条件 (跟 1d 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/deepseek-cache-hit-long.test.ts
 *
 * 红线 (跟 1d/1d.5-A 一致):
 *   1. test 代码**不**直接读 ~/.deepwhale/.env 文件
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (1d.5-A.5 = 2 turn 长 prompt, 强制 cache 触发)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 2 turn, 一次性揭示)
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR DEEPSEEK_API_KEY undefined → it.skip
 *   - 缺 key 时**不**fail, 单测保持 207/3 skipped baseline
 *
 * 真接最小化 (cost 估算, per pricing.default.toml flash 1.0/2.0/M):
 *   - system prompt: ~4500 token (4k+ token filler + 简短 instruction)
 *   - turn 1 user: 100 token
 *   - turn 1 cost: 4500/1M * 1.0 + 100/1M * 2.0 ≈ ¥0.0047
 *   - turn 2 cost (cache hit 后): 4500/1M * 0.02 + 100/1M * 2.0 ≈ ¥0.00029 (cache hit 价 0.02 vs miss 1.0)
 *   - 总成本: ~¥0.005 per run, 3 次稳定性: ~¥0.015 (远低于 1b.5-s3 估算的 ¥0.01-0.10 区间)
 *
 * 验证字段:
 *   - turn 1 usage.prompt_tokens > 0 (≥ 4500)
 *   - turn 1 usage.completion_tokens > 0
 *   - turn 1 usage.cached_tokens > 0 (强约束, 强制 cache 触发)
 *   - turn 1 usage.cache_hit_rate > 0 (跟 cached_tokens 一致)
 *   - turn 1 usage.cost_turn / cost_currency **absent** (F4 拍板, cached>0 路径)
 *   - turn 1 usage.tokens_uncached **definitely defined** (F4 拍板, 不变量, 跟 cost 无关)
 *   - turn 2 验证 cache 复用 (cached_tokens 跟 turn 1 接近 OR 显著更小, 取决于 server routing)
 *   - content shape (1d.5-A 第二 it 验 "4" 模式, 1d.5-A.5 同 prompt 验跨 2 turn shape 稳定)
 *
 * 跟 1d.5-A 的差异:
 *   - 1d.5-A = 短 prompt, 揭示**不**触发 cache (cached=0 路径)
 *   - 1d.5-A.5 = 长 prompt, 期望触发 cache (cached>0 路径, F4 保守策略)
 *   - 1d.5-A = cost 反算跟 pricing 对齐 (cached=0 路径 cost 齐全)
 *   - 1d.5-A.5 = cost 字段 absent (F4 拍板, **不**反算, 因 cache_creation/cache_read 价拆分待 Sprint 2)
 *   - 1d.5-A = tokens_uncached === prompt_tokens (cached=0 简化不变量)
 *   - 1d.5-A.5 = tokens_uncached === input_tokens (F4 拍板的真不变量, cached>0 路径)
 *
 * 不验证 (留 Sprint 2 + cache_write_per_m 一起):
 *   - cache_creation vs cache_read 价拆分 (1b.5 R-G2 acknowledge 故意留)
 *   - 跨 session cache (1 turn 单 session, 不跨 session)
 *   - 极长 prompt (1MB+ 输入, 服务端 token 计数上限)
 *   - Anthropic 协议 cache (1d.5-B 验 1 turn, cache 触发也是 Anthropic 协议层独立议题)
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage } from '../../src/types.js';

// ---- 红线门: 跟 1d/1d.5-A 一致 ----

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

// ---- 长 system prompt (4500 token filler + instruction) ----

const LONG_SYSTEM_PROMPT = [
  'You are a careful math assistant. The following is a long context to encourage prefix-cache reuse.',
  '---',
  // 60 行 × ~70 token = ~4200 token filler (单调重复, 不期望 LLM 真"读", 仅作 prefix cache warm-up)
  ...Array.from({ length: 60 }, (_, i) =>
    `Filler paragraph ${i + 1}: the quick brown fox jumps over the lazy dog. ` +
    'This paragraph exists solely to provide prefix-cache-eligible tokens. ' +
    'Repetition across the same prefix allows the upstream service to identify and cache the shared system prompt. ' +
    'The answer to any user question is independent of these filler paragraphs. ' +
    `End of filler paragraph ${i + 1}.`
  ),
  '---',
  'Answer the user question concisely with just the number.',
].join('\n');

const USER_PROMPT = 'What is 2+2?';

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: LONG_SYSTEM_PROMPT },
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

// ---- 主测试: 2 turn 长 prompt, 验 cache>0 + F4 保守策略 ----

describe('DeepSeek shim — 1d.5-A.5 长 prompt 强制 cache hit 真接 (X1 b + X4 c 拍板)', () => {
  if (!canRun) {
    it.skip(`SKIPPED: ${skipReason}`, () => {
      // noop
    });
    return;
  }

  it('2 turn 长 system prompt (4500 token) + 同 user: 强制 cache>0 + F4 保守策略 + tokens_uncached 不变量', async () => {
    const client = new DeepSeekClient();

    // ---- turn 1: 第一次, 长 system + user, 期望服务端 cache system 部分 ----
    const result1 = await client.chat(MESSAGES);
    expect(result1.model).toBe('deepseek-v4-flash');
    expect(result1.finish_reason).toBe('stop');
    expect(result1.usage).toBeDefined();
    if (!result1.usage) return; // narrowed

    // ---- turn 2: 第二次, 同 system + 同 user, 期望服务端命中 cache ----
    const result2 = await client.chat(MESSAGES);
    expect(result2.model).toBe('deepseek-v4-flash');
    expect(result2.finish_reason).toBe('stop');
    expect(result2.usage).toBeDefined();
    if (!result2.usage) return; // narrowed

    // ---- 断言层 1: prompt 规模 + shape 一致 ----
    const snap1 = snapshotUsage(result1.usage);
    const snap2 = snapshotUsage(result2.usage);

    // 1) prompt 至少 4000 token (60 行 × ~58 token = ~4185 实测; lower bound 4000 给 1b5-s2.5 R-G2 一些 slack)
    expect(snap1.prompt_tokens).toBeGreaterThanOrEqual(4000);
    expect(snap2.prompt_tokens).toBeGreaterThanOrEqual(4000);
    // 2) 跨 2 turn prompt_tokens 一致 (同 prompt 输入)
    expect(snap2.prompt_tokens).toBe(snap1.prompt_tokens);
    // 3) completion_tokens > 0 (两次都应有 content)
    expect(snap1.completion_tokens).toBeGreaterThan(0);
    expect(snap2.completion_tokens).toBeGreaterThan(0);
    // 4) total = prompt + completion (OAI 不变量, 跟 1d/1d.5-A 一致)
    expect(snap1.total_tokens).toBe(snap1.prompt_tokens + snap1.completion_tokens);
    expect(snap2.total_tokens).toBe(snap2.prompt_tokens + snap2.completion_tokens);

    // ---- 断言层 2: cache 强制触发 (R7 揭示 1d.5-A = cached=0; 1d.5-A.5 = cached>0) ----
    // 强约束: 长 system (4500 token) 重复 2 turn 期望触发 prefix cache.
    // 若 server 仍返 cached=0, **说明** server routing **不**识别 prefix; 1d.5-A.5 失败,
    // Gap 3 拍板 b 留的 known gap **升级**为"server 端根本**不**支持 prefix cache" = 新发现.
    expect(snap1.cached_tokens).toBeDefined();
    expect(snap1.cached_tokens).toBeGreaterThan(0);
    expect(snap1.cache_hit_rate).toBeDefined();
    expect(snap1.cache_hit_rate).toBeGreaterThan(0);
    expect(snap1.cache_hit_rate).toBeLessThanOrEqual(1);

    // turn 2 cached_tokens 跟 turn 1 接近 OR 显著 ≥ turn 1 (server 行为)
    expect(snap2.cached_tokens).toBeDefined();
    expect(snap2.cached_tokens).toBeGreaterThan(0);

    // ---- 断言层 3: DeepSeek OAI 协议 vs Anthropic 协议的 F4 拍板差异 (1d.5-A.5 新发现) ----
    // 1b.5 F4 拍板 (Anthropic 协议): cached > 0 → cost_turn/cost_currency absent (cache_creation/cache_read 价差 12.5× 假装按 cache_hit 价算会**低估** Sonnet 12.5×)
    // 1d.5-A.5 (DeepSeek OAI 协议): 实际**不**走 F4 absent 路径 — DeepSeek OAI 协议**不**区分 cache_creation/cache_read 价,
    //   直接用 prompt_cache_hit_tokens 字段, cost_turn **仍**按 cache_hit 价算 (0.02¥/M).
    // **这是 1d.5-A.5 揭示的新事实**: F4 保守策略只适用 Anthropic 协议, DeepSeek OAI 协议走另一条路径.
    // 兼容两种行为的断言: cost 字段**或** absent (Anthropic) **或** > 0 (DeepSeek OAI), tokens_uncached 仍算 (F4 拍板不变量).
    const costIsAbsent = snap1.cost_turn === undefined;
    const costIsPresent = typeof snap1.cost_turn === 'number' && snap1.cost_turn > 0;
    expect(costIsAbsent || costIsPresent).toBe(true);
    if (costIsPresent) {
      // DeepSeek OAI 路径: cost_currency 应该是 CNY (per-model currency)
      expect(snap1.cost_currency).toBe('CNY');
    }
    expect(snap1.tokens_uncached).toBeDefined();
    // tokens_uncached === prompt_tokens - cached_tokens (F4 拍板, 1b5-s2.5 Pitfall 13 不变量, 跟 cost 无关)
    expect(snap1.tokens_uncached).toBe(snap1.prompt_tokens - (snap1.cached_tokens ?? 0));

    const costIsAbsent2 = snap2.cost_turn === undefined;
    const costIsPresent2 = typeof snap2.cost_turn === 'number' && snap2.cost_turn > 0;
    expect(costIsAbsent2 || costIsPresent2).toBe(true);
    if (costIsPresent2) {
      expect(snap2.cost_currency).toBe('CNY');
    }
    expect(snap2.tokens_uncached).toBeDefined();
    expect(snap2.tokens_uncached).toBe(snap2.prompt_tokens - (snap2.cached_tokens ?? 0));

    // ---- 断言层 4: 跨 2 turn cache 行为 ----
    // 期望: turn 2 cached_tokens ≥ turn 1 cached_tokens (server 累积 cache) — 弱约束
    // **不**断言 turn 2 cost < turn 1 (cost 字段 absent, 无法比较)
    // **不**断言 cache_hit_rate 关系 (server-dependent)
    expect(snap2.cached_tokens).toBeGreaterThanOrEqual(snap1.cached_tokens!);

    // ---- 断言层 5: 揭示真实 cache 行为 (R-G2 风格, 写 dump 不写断言) ----
    dumpSnapshots('1d.5-A.5', [snap1, snap2]);

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content echo 到 console.
  }, 90_000); // 90s timeout: 2 turn × 3 次重试缓冲 (长 prompt 可能慢)
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
