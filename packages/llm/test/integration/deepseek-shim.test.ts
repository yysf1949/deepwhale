/**
 * Sprint 1b.5 Step 3 — DeepSeek shim 集成测 (X1+X4 拍板, 2026-06-04)
 *
 * 目的: 1b.5 修了 6 个 P1/P2 之后, 验证"测试绿 + 真实 API 绿"两端对齐.
 * 之前 X3 mock-only 风险 (1b.5-s2.5 meta-rule "test passed ≠ production works")
 * 要求 1 个真接验证 Step 2.5 的 cache_hit_rate / cost_turn 公式在真实响应上对得上.
 *
 * 触发条件 (X4 拍板 c: key 永不出 ~/.deepwhale/, 只通过 process.env):
 *   INTEGRATION=1 pnpm test           # 用户先 source ~/.deepwhale/.env
 *
 * 红线 (X1 b + X4 c 拍板):
 *   1. test 代码**不**直接读 ~/.deepwhale/.env 文件 — 用户自己 source
 *   2. test 代码**不**接受 apiKey 选项 — 只能通过 process.env['DEEPSEEK_API_KEY']
 *   3. test 任何断言 / log**不**含 key 字符串 — 防 console.log 误打
 *   4. 文件权限: 写 key 文件必须是 mode 600 (用户责任, 文档提示)
 *
 * Skip 行为 (避免污染 pnpm test):
 *   - INTEGRATION !== '1'           → it.skip (整个文件)
 *   - process.env.DEEPSEEK_API_KEY undefined → it.skip
 *   - 缺 key 时**不**fail, 单测保持 191/191 绿
 *
 * 真接最小化:
 *   - 1 turn: "Reply with the single word: OK"
 *   - model: deepseek-v4-flash (最便宜, 单 turn < ¥0.001)
 *   - 流式 (跟生产路径一致, 验 SSE 解析)
 *
 * 验证字段 (Step 2.5 R7 链路):
 *   - ChatResult.model: 'deepseek-v4-flash'
 *   - ChatResult.content: 含 'OK' (case-insensitive)
 *   - ChatResult.finish_reason: 'stop'
 *   - ChatResult.usage.prompt_tokens: > 0
 *   - ChatResult.usage.completion_tokens: > 0
 *   - ChatResult.usage.total_tokens: === prompt + completion
 *   - ChatResult.usage.cost_turn: > 0 (有 pricing.default.toml)
 *   - ChatResult.usage.cost_currency: 'CNY' (DeepSeek V4 是 ¥)
 *   - ChatResult.usage.tokens_uncached: === prompt_tokens - cached_tokens (不变量,
 *     P3 fix 2026-06-04, 跟 cached_tokens undefined / 0 / >0 都兼容, 不再假设 "无 cache")
 *
 * 不验证 (留 Step 3.5):
 *   - cache_hit_rate > 0 (需要重复同 prompt 触发 prefix cache, 多 turn 才有意义)
 *   - Anthropic shim (DeepSeek 用 deepseek-chat, Anthropic SDK 路径单独跑)
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage } from '../../src/types.js';

// ---- 红线门: INTEGRATION=1 + DEEPSEEK_API_KEY 都满足才进 describe ----

const INTEGRATION_ENABLED = process.env['INTEGRATION'] === '1';
const HAS_DEEPSEEK_KEY =
  typeof process.env['DEEPSEEK_API_KEY'] === 'string' &&
  process.env['DEEPSEEK_API_KEY'] !== '';

const canRun = INTEGRATION_ENABLED && HAS_DEEPSEEK_KEY;

// ---- skip 描述: 不写 'skip' (写消息让用户知道为什么) ----

const skipReason = !INTEGRATION_ENABLED
  ? 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")'
  : !HAS_DEEPSEEK_KEY
    ? 'process.env.DEEPSEEK_API_KEY is unset (source ~/.deepwhale/.env first; see README "integration tests")'
    : 'unknown reason';

// ---- 主测试: 1 turn 流式真接, 验 shape + cost 公式 ----

describe('DeepSeek shim — Step 3 真接 1 turn (X1 b + X4 c 拍板)', () => {
  if (!canRun) {
    it.skip(`SKIPPED: ${skipReason}`, () => {
      // noop — vitest 看见 it.skip 就标 skipped, 不进 beforeEach / 调 client
    });
    return;
  }

  it('1 turn 流式: 返回 content "OK" + usage 字段完整 + cost_currency=CNY', async () => {
    // 不传 apiKey: 强制走 process.env['DEEPSEEK_API_KEY'] (X4 c 红线).
    // 不传 pricing: 让 client constructor 走内置 ship-in default (loadDefaultPricing).
    const client = new DeepSeekClient();

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Reply with the single word: OK' },
    ];

    const chunks: string[] = [];
    const result = await client.stream(messages, {
      onChunk: (chunk) => {
        // 红线: 增量只打长度, 不打 content (防误判成"打 key" — content 不会含 key, 但习惯)
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
      },
    });

    // 1) 基础 shape
    expect(result.model).toBe('deepseek-v4-flash');
    expect(result.finish_reason).toBe('stop');
    expect(result.content).toBeTruthy();
    // 2) 内容验证 (case-insensitive, 允许 'OK' / 'ok' / 'Sure, OK' / 'OK.' 等)
    expect(result.content.toLowerCase()).toContain('ok');
    // 3) 流式 = 总长度 = final content 长度 (Sprint 1a P2-A 修)
    expect(chunks.join('')).toBe(result.content);

    // 4) usage 字段完整
    expect(result.usage).toBeDefined();
    if (!result.usage) return; // narrowed
    expect(result.usage.prompt_tokens).toBeGreaterThan(0);
    expect(result.usage.completion_tokens).toBeGreaterThan(0);
    // 5) OAI 不变量: total === prompt + completion
    expect(result.usage.total_tokens).toBe(
      result.usage.prompt_tokens + result.usage.completion_tokens,
    );
    // 6) Step 2.5 R7 链路: pricing loaded + cost 字段**应该**齐 (不是 R7 中间路径)
    //    1 turn 没 cache → cost_turn > 0, cost_currency = 'CNY' (DeepSeek V4 default)
    expect(result.usage.cost_turn).toBeGreaterThan(0);
    expect(result.usage.cost_currency).toBe('CNY');
    // 7) tokens_uncached 不变量: tokens_uncached = prompt_tokens - cached_tokens
    //    (P3 fix 2026-06-04, R-G1 经验: 预条件式断言 line 116 旧版 `=== prompt_tokens`
    //    假设了 "无 cache", 如果真实服务某天返非零 cached_tokens, line 116 会先失败
    //    即便客户端公式是对的. 修后只断言不变量, 跟 cached_tokens undefined / 0 / >0 都兼容.)
    //    本次 1 turn 通常 cached_tokens === undefined (DeepSeek V4 行为), 但不强制.
    expect(result.usage.tokens_uncached).toBe(
      result.usage.prompt_tokens - (result.usage.cached_tokens ?? 0),
    );

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content echo 到 console.
    // 此处不调用 console.log(result.content) — 字段断言足够.
  }, 60_000); // 60s timeout: 包含 3 次重试缓冲 (Sprint 1a RETRYABLE 3x)
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
// 注释里出现 "DEEPSEEK_API_KEY" 没事 — 那是 env 变量名, 不是 key 值.
