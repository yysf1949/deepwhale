/**
 * Sprint 1d.5-B — Anthropic shim 真接 1 turn (X1 b + X4 c 拍板, 2026-06-04)
 *
 * 目的: 1d 验了 DeepSeek OAI 协议路径 (api.deepseek.com, deepseek-v4-flash).
 * 1d.5-B 验 **Anthropic 协议路径** (api.deepseek.com/anthropic).
 *
 * **R7 揭示 (2026-06-04 1d.5-B 首次真接)**: DeepSeek /anthropic 端点**实际**走 OAI 协议兜底.
 * 客户端发起请求 model=claude-sonnet-4-5 (Anthropic SDK 协议), 服务端**返回** model=deepseek-v4-flash
 * (OAI 协议). 但 pricing 层**仍**按 client 声明的 claude-sonnet-4-5 算 (USD 3.0/15.0).
 *
 * 这意味着:
 * - 客户端**不会**用 mock 测发现这个 mismatch (mock 灌入的 response 字段可控)
 * - 真接**才**暴露 "协议声明 Anthropic + 实际响应 OAI + 计价 USD" 的混合行为
 * - 1b.5 D1 拍板时设想的"DeepSeek 提供真 /anthropic 兼容端点"在 2026-06-04 **不成立** —
 *   /anthropic 端点存在但 routing 到了 flash 实现
 *
 * 关键风险 (1b.5-s2.5 R7 "test passed ≠ production works" cousin):
 * mock 用 Anthropic Message 对象灌入, 真实 API 走 DeepSeek shim 的 /anthropic 端点 ——
 * shim 的协议层兼容性未在生产验过. 真接要验:
 *   - SDK 真实 HTTP 路径能拿到响应 (不抛 mapSdkError) — **通过** (2.0s 拿到)
 *   - parseAnthropicMessage 翻译的 content 跟 SDK .content 一致 — **通过** ("OK")
 *   - cost_currency === 'USD' (per-model currency, 按 client 声明的 sonnet 算) — **通过**
 *   - cost_turn 跟 pricing.default.toml 里 sonnet 3.0/15.0 USD 对齐 — **通过** (0.000363)
 *   - finish_reason === 'stop' (Anthropic 协议 stop_reason 翻译) — **通过**
 *
 * 触发条件 (跟 1d 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/anthropic-shim.test.ts
 *
 * 红线 (跟 1d 一致):
 *   1. test 代码**不**直接读 .env 文件 (项目根, D-7 loadProjectEnv 自动加载)
 *   2. test 代码**不**接受 apiKey 选项 — 走 ANTHROPIC_AUTH_TOKEN / DEEPSEEK_API_KEY env
 *   3. test 任何断言 / log**不**含 key 字符串
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR (ANTHROPIC_AUTH_TOKEN && DEEPSEEK_API_KEY) 都 unset → it.skip
 *
 * 真接最小化:
 *   - 1 turn: "Reply with the single word: OK" (跟 1d 同 prompt, 跨协议 shape 对比)
 *   - model (client 声明): claude-sonnet-4-5
 *   - model (server 返回): deepseek-v4-flash (R7 揭示, 服务端 routing 兜底)
 *   - 非流式 (用 chat() 而非 stream())
 *
 * 验证字段 (R7 揭示版本 — 跟 1d.5 前的设计**不同**):
 *   - ChatResult.model: 'deepseek-v4-flash' (R7: 服务端实际响应, **不是** client 声明的 sonnet)
 *   - ChatResult.finish_reason: 'stop' (Anthropic 协议 stop_reason 翻译对)
 *   - ChatResult.content: 含 'OK' (跨 SDK 协议翻译对)
 *   - ChatResult.usage.prompt_tokens: > 0
 *   - ChatResult.usage.completion_tokens: > 0
 *   - ChatResult.usage.total_tokens: === prompt + completion
 *   - ChatResult.usage.cost_turn: > 0 (按 sonnet USD 算)
 *   - ChatResult.usage.cost_currency: 'USD' (per-model currency, **不是** CNY)
 *   - ChatResult.usage.tokens_uncached: === prompt_tokens
 *
 * 不验证 (留 sprint 2+):
 *   - Anthropic tools 路径 (1c 实施, 当前 AnthropicClient.tools 抛 LLMUnknownError)
 *   - cache 命中 (1d.5-A 验 DeepSeek OAI cache, 1d.5-B 这里 1 turn 不触发)
 *   - 真实 Anthropic API (api.anthropic.com, 需 ANTHROPIC_AUTH_TOKEN 真 key, 不在 shim 范围)
 *   - 修复 R7 揭示: DeepSeek /anthropic 端点是否未来真提供 Anthropic 协议
 *     (这是 1b.5 D1 拍板的假设**不成立**, 1d.5-B 提交时**显式标记**为 known issue)
 */

import { describe, expect, it } from 'vitest';
import { AnthropicClient } from '../../src/anthropic-client.js';
import type { ChatMessage } from '../../src/types.js';

// ---- 红线门 (helper 化, D-10a-2 2026-06-04) ----
import { integrationSkipReason } from './_helpers/integration-gate.js';

// ---- 主测试: 1 turn 真接, 验 R7 揭示后的跨协议 shape ----

describe('Anthropic shim — 1d.5-B 1 turn 真接 (R7 揭示: DeepSeek /anthropic 当前是 OAI 兜底)', () => {
  const fileSkipReason = integrationSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  it('1 turn 真接: 跨 SDK 协议请求 + OAI 协议响应 + USD 计价 (R7 揭示)', async () => {
    // 不传 apiKey: 强制走 env (AnthropicClient.resolveApiKey → ANTHROPIC_AUTH_TOKEN || DEEPSEEK_API_KEY).
    // 不传 baseUrl: 默认走 DEEPSEEK_ANTHROPIC_BASE_URL.
    // 不传 pricing: 让 client constructor 走 loadDefaultPricing.
    //
    // client.model = 'claude-sonnet-4-5' (声明), pricing 按 sonnet USD 算.
    // server 返回 model='deepseek-v4-flash' (R7 揭示: 实际 routing 到 OAI flash).
    const client = new AnthropicClient();
    expect(client.model).toBe('claude-sonnet-4-5'); // client 声明

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Reply with the single word: OK' },
    ];

    const result = await client.chat(messages);

    // ---- 1) R7 揭示: server 返回的 model 字段是 flash (OAI 协议兜底) ----
    // 期望 'deepseek-v4-flash' (server 行为), **不**是 'claude-sonnet-4-5' (client 声明).
    expect(result.model).toBe('deepseek-v4-flash');
    // 跟 1d 跨协议 shape 对齐: OAI 协议 stop_reason → 'stop' 翻译对
    expect(result.finish_reason).toBe('stop');
    expect(result.content).toBeTruthy();
    // 内容验证 (case-insensitive, 跟 1d 同 prompt 跨 SDK 翻译对)
    expect(result.content.toLowerCase()).toContain('ok');

    // ---- 2) usage 字段完整 (跟 1d shape 对齐) ----
    expect(result.usage).toBeDefined();
    if (!result.usage) return; // narrowed
    expect(result.usage.prompt_tokens).toBeGreaterThan(0);
    expect(result.usage.completion_tokens).toBeGreaterThan(0);
    expect(result.usage.total_tokens).toBe(
      result.usage.prompt_tokens + result.usage.completion_tokens,
    );

    // ---- 3) cost 字段 (per-model currency 拍板: sonnet 是 USD, **不是** CNY) ----
    expect(result.usage.cost_turn).toBeGreaterThan(0);
    expect(result.usage.cost_currency).toBe('USD');

    // ---- 4) tokens_uncached 不变量 (cached=0 → tokens_uncached = prompt_tokens) ----
    expect(result.usage.tokens_uncached).toBe(result.usage.prompt_tokens);

    // ---- 5) R7 揭示打印 (揭示不掩盖): ----
    // - client 声明 sonnet (USD 计价)
    // - server 返回 flash (OAI 协议, **不**是 Anthropic 协议)
    // - cost 仍按 sonnet 算 (pricing layer 用 client.model 查表)
    console.log(
      '[1d.5-B R7 揭示] client.model=claude-sonnet-4-5 (USD 计价), server 返回 model=',
      JSON.stringify(result.model),
      '(OAI 协议 routing 兜底, **不**是 Anthropic 协议)',
    );
    console.log(
      '[1d.5-B] usage =',
      JSON.stringify({
        model: result.model,
        prompt: result.usage.prompt_tokens,
        completion: result.usage.completion_tokens,
        total: result.usage.total_tokens,
        cost: result.usage.cost_turn,
        currency: result.usage.cost_currency,
        uncached: result.usage.tokens_uncached,
      }),
    );

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content echo 到 console.
    // 此处不调用 console.log(result.content) — 字段断言足够.
  }, 60_000);
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
// 注释里出现 "ANTHROPIC_AUTH_TOKEN" 没事 — 那是 env 变量名, 不是 key 值.
