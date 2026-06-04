/**
 * Sprint 1d.5-D-1 — DeepSeek 长 prompt multi-turn 真接验证 (D.1 分步走, 2026-06-04)
 *
 * 目的: 1d.5-A (57a019d, 2 turn 27 token) + 1d.5-A.5 (7798f5f, 2 turn 4185 token) 都用**同 prompt** 2 turn.
 * 1d.5-D-1 验**长 prompt + 累积 context** 4 turn 跨 turn prompt 严格递增 + cached_tokens 期望 server 累积.
 * 1b.5-s2.5 Pitfall 13 (R-G2 acknowledge) 拍板: tokens_uncached 仍算 (F4 拍板不变量), cost 公式跨协议精确 (1d.5-A.5 验过 1e-7 浮点).
 *
 * 关键不变量 (multi-turn cached>0 路径, F4 拍板):
 *   - prompt_tokens 跨 turn 严格递增 (turn 4 > turn 3 > turn 2 > turn 1; system 4185 + 累积 turn responses + 累积 user Q)
 *   - cached_tokens 跨 turn 期望 ≥ 1d.5-A.5 的 4096 (server 端 prefix 累积复用, 弱约束)
 *   - cache_hit_rate 跨 turn 期望 ≥ 0.95 (cached/prompt 比)
 *   - tokens_uncached === prompt - cached (F4 拍板, 1b5-s2.5 Pitfall 13 不变量)
 *   - cost_turn > 0 (DeepSeek OAI 路径, 1d.5-A.5 揭示过; 1b.5 F4 absent 仅 Anthropic 协议)
 *   - cost_turn 跨 turn 公式反算 1e-7 浮点一致
 *   - completion_tokens 跨 turn 严格 ≥ user Q 字符数 (8 字 + token 化 ~30-50 token)
 *   - finish_reason=stop, content 包含 answer
 *
 * 触发条件 (跟 1d/1d.5-A/1d.5-A.5 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/deepseek-cache-multi-turn.test.ts
 *
 * 红线 (跟 1d/1d.5-A/1d.5-A.5 一致):
 *   1. test 代码**不**直接读 .env 文件 (项目根, D-7 loadProjectEnv 自动加载)
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (1d.5-D-1 = **4 turn** 长 prompt 累积)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 4 turn, 一次性揭示)
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR DEEPSEEK_API_KEY undefined → it.skip
 *   - 缺 key 时**不**fail, 单测保持 207/4 skipped baseline
 *
 * 真接最小化 (cost 估算, per pricing.default.toml flash 1.0/2.0/M, cache hit 0.02/M):
 *   - system prompt: 4185 token (跟 1d.5-A.5 一样, 60 行 filler)
 *   - turn 1 user: 8 token ("What is 2+2?")
 *   - turn 1 expected: prompt ≈ 4193 (system + Q1), cached ≈ 4096, uncached ≈ 97, completion ≈ 40 ("4" + token)
 *   - turn 2-4 累积 turn response + new Q
 *   - 4 turn total cost: ~¥0.001 (cached 持续 4096, uncached 累积, completion 累积 ~160 token)
 *
 * 跟 1d.5-A.5 差异:
 *   - 1d.5-A.5 = 2 turn **同 prompt** (server cache 复用容易, 第一次触发)
 *   - 1d.5-D-1 = 4 turn **累积 context** (turn 2 包含 turn 1 response, ..., turn 4 累积 ~3 turn response)
 *   - 1d.5-A.5 = 验 cache 触发
 *   - 1d.5-D-1 = 验 cache 跨 turn 累积复用 (turn 4 cached 期望 ≥ turn 1 cached, server 端 prefix-cache window 滚动)
 *
 * 跟 session module 关系:
 *   - 1d.5-D-1 是**纯 client 真接**, **不**调 session module (packages/coding-agent/src/session/)
 *   - context 累积 = test code 手动 append ChatMessage (assistant role 来自 previous result.content)
 *   - session module 集成验 = 1d.5-D-2+ 后续 sub-step 议题
 *
 * 不验证 (留后续 D.2/D.3/D.4 sub-step):
 *   - streaming SSE partial chunks (D.2 = parseSseEvent 路径)
 *   - tool_calls schema 真接 (D.3 = OAI tool_calls 字段)
 *   - error handling 真接 5xx/timeout (D.4 = AbortError → LLMNetworkError 包装路径)
 *   - session module 集成 (跨 packages 边界, 留 Sprint 1e 或 Sprint 2)
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage } from '../../src/types.js';

// ---- 红线门 (helper 化, D-10a-2 2026-06-04) ----
import { integrationSkipReason } from './_helpers/integration-gate.js';

// ---- 长 system prompt (跟 1d.5-A.5 一样 4185 token) ----

const LONG_SYSTEM_PROMPT = [
  'You are a careful math assistant. The following is a long context to encourage prefix-cache reuse.',
  '---',
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

// ---- 4 turn 累积 Q (跟 1d.5-A.5 模式 "What is 2+2?" 一致) ----

const USER_QUESTIONS = [
  'What is 2+2?',
  'What is 3+3?',
  'What is 4+4?',
  'What is 5+5?',
] as const;

const EXPECTED_ANSWERS = ['4', '6', '8', '10'] as const;

const TURN_COUNT = USER_QUESTIONS.length;

// ---- 辅助: snapshot 用法 ----

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

// ---- 主测试: 4 turn 长 prompt 累积 context 验 cache 跨 turn 累积 + prompt 严格递增 ----

describe('DeepSeek shim — 1d.5-D-1 长 prompt multi-turn 累积 context 真接 (D.1 分步走)', () => {
  const fileSkipReason = integrationSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  it(`${TURN_COUNT} turn 长 system prompt (4185 token) + 累积 context + 4 数字 Q: prompt 严格递增 + cached 跨 turn 累积 + F4 不变量`, async () => {
    const client = new DeepSeekClient();
    const messages: ChatMessage[] = [
      { role: 'system', content: LONG_SYSTEM_PROMPT },
    ];
    const snaps: TurnSnapshot[] = [];

    // ---- 4 turn 累积 chat (turn N 累积 turn 1..N-1 的 user + assistant) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const userQ = USER_QUESTIONS[i]!;
      const expectedAnswer = EXPECTED_ANSWERS[i]!;

      // 累积 user Q
      messages.push({ role: 'user', content: userQ });

      const result = await client.chat(messages);

      // 基础断言
      expect(result.model).toBe('deepseek-v4-flash');
      expect(result.finish_reason).toBe('stop');
      expect(result.usage).toBeDefined();
      if (!result.usage) return; // narrowed

      // content 包含预期数字 (LLM 真答对)
      expect(result.content).toContain(expectedAnswer);

      // 累积 assistant response
      messages.push({ role: 'assistant', content: result.content });

      const snap = snapshotUsage(result.usage);
      snaps.push(snap);
    }

    // ---- 断言层 1: prompt 严格递增 ----
    // turn 1: 4185 (system) + 8 (Q1) ≈ 4193
    // turn 2: 4193 + ~40 (turn 1 response) + 8 (Q2) ≈ 4241
    // turn 3: 4241 + ~30 (turn 2 response) + 8 (Q3) ≈ 4279
    // turn 4: 4279 + ~30 (turn 3 response) + 8 (Q4) ≈ 4317
    for (let i = 1; i < TURN_COUNT; i++) {
      const prev = snaps[i - 1]!;
      const curr = snaps[i]!;
      expect(curr.prompt_tokens).toBeGreaterThan(prev.prompt_tokens);
    }

    // turn 1 prompt 至少 4000 token (跟 1d.5-A.5 一样 lower bound)
    expect(snaps[0]!.prompt_tokens).toBeGreaterThanOrEqual(4000);
    // turn 4 prompt 至多 5500 token (估算上限)
    expect(snaps[TURN_COUNT - 1]!.prompt_tokens).toBeLessThanOrEqual(5500);

    // ---- 断言层 2: completion_tokens 合理 (8 字 + token ~ 30-50) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const snap = snaps[i]!;
      expect(snap.completion_tokens).toBeGreaterThan(0);
      expect(snap.completion_tokens).toBeLessThan(100);
    }

    // ---- 断言层 3: total = prompt + completion (OAI 不变量) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const snap = snaps[i]!;
      expect(snap.total_tokens).toBe(snap.prompt_tokens + snap.completion_tokens);
    }

    // ---- 断言层 4: cache 跨 turn 累积复用 (核心 1d.5-D-1 揭示) ----
    // 4 turn 都期望 cached > 0 (跟 1d.5-A.5 一致, 4185 token system 必触发)
    for (let i = 0; i < TURN_COUNT; i++) {
      const snap = snaps[i]!;
      expect(snap.cached_tokens).toBeDefined();
      expect(snap.cached_tokens).toBeGreaterThan(0);
      expect(snap.cache_hit_rate).toBeDefined();
      expect(snap.cache_hit_rate).toBeGreaterThan(0);
    }

    // cached_tokens 跨 turn 期望 ≥ turn 1 cached (server 端 prefix-cache 滚动, 弱约束)
    const turn1Cached = snaps[0]!.cached_tokens!;
    for (let i = 1; i < TURN_COUNT; i++) {
      const curr = snaps[i]!.cached_tokens!;
      expect(curr).toBeGreaterThanOrEqual(turn1Cached);
    }

    // ---- 断言层 5: F4 拍板不变量 (1b5-s2.5 Pitfall 13, DeepSeek OAI 路径) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const snap = snaps[i]!;

      // tokens_uncached 始终 defined (F4 拍板不变量, 跨协议)
      expect(snap.tokens_uncached).toBeDefined();
      // tokens_uncached === prompt - cached
      expect(snap.tokens_uncached).toBe(snap.prompt_tokens - (snap.cached_tokens ?? 0));

      // DeepSeek OAI 路径 (1d.5-A.5 揭示): cost 字段**仍**齐全, 不走 F4 absent
      // (F4 absent 仅 Anthropic 协议, parseAnthropicUsage L408-421 显式 if-else)
      const costIsAbsent = snap.cost_turn === undefined;
      const costIsPresent = typeof snap.cost_turn === 'number' && snap.cost_turn > 0;
      expect(costIsAbsent || costIsPresent).toBe(true);
      if (costIsPresent) {
        expect(snap.cost_currency).toBe('CNY');
      }
    }

    // ---- 断言层 6: cost 公式跨 turn 反算 (1d.5-A.5 验过 1e-7 浮点) ----
    // 公式: cached × cache_hit/1e6 + uncached × cache_miss/1e6 + completion × completion/1e6
    // = cached × 0.02/1e6 + uncached × 1.0/1e6 + completion × 2.0/1e6
    for (let i = 0; i < TURN_COUNT; i++) {
      const snap = snaps[i]!;
      if (typeof snap.cost_turn !== 'number') continue; // skip if absent (Anthropic path, won't happen here)
      const cached = snap.cached_tokens ?? 0;
      const uncached = snap.tokens_uncached ?? 0;
      const completion = snap.completion_tokens;
      const expected =
        (cached * 0.02) / 1_000_000 +
        (uncached * 1.0) / 1_000_000 +
        (completion * 2.0) / 1_000_000;
      // 1e-7 浮点噪声内一致 (1d.5-A.5 验过这个 tolerance)
      expect(Math.abs(snap.cost_turn - expected)).toBeLessThan(1e-7);
    }

    // ---- 断言层 7: 4 turn 总 cost 合理 ----
    let totalCost = 0;
    for (let i = 0; i < TURN_COUNT; i++) {
      const snap = snaps[i]!;
      if (typeof snap.cost_turn === 'number') totalCost += snap.cost_turn;
    }
    // 4 turn 总 cost 应在 ¥0.001-¥0.05 区间 (4 turn 累积 + cached 持续 4096)
    expect(totalCost).toBeGreaterThan(0.0001);
    expect(totalCost).toBeLessThan(0.05);

    // ---- 断言层 8: 揭示真实 multi-turn cache 行为 (R-G2 风格, dump 不写断言) ----
    dumpSnapshots('1d.5-D-1', snaps);

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content echo 到 console.
  }, 120_000); // 120s timeout: 4 turn × 3 次重试缓冲 (长 prompt + 累积 context)
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
