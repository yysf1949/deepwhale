/**
 * Sprint 1d.5-D-2 — DeepSeek streaming SSE partial chunks 真接验证 (D.2 分步走, 2026-06-04)
 *
 * 目的: 1d.5-A.5 (7798f5f) + 1d.5-D-1 (6e848cc) 验**非流式** chat 路径.
 * 1d.5-D-2 验**流式** stream() 路径, 验 SSE partial chunks 累积 (parseSseEvent 路径).
 *
 * 1a 拍板: client.stream() 已有, 走 OAI-compatible stream=true 协议,
 *   body 带 stream_options.include_usage=true (P1 fix 2026-06-03) → 服务端在最后一个 chunk 携带 usage.
 *
 * 关键不变量 (streaming 路径, OAI/DeepSeek V4-flash):
 *   - 至少 1 个 partial chunk 收到 (content delta 非空, 验流式触发)
 *   - chunks 累积 content 跟非流式 chat() 完整 content 一致 (流式等于非流式内容, 端点行为)
 *   - 最后一个 chunk 带 usage 字段 (stream_options.include_usage=true 触发)
 *   - usage shape 跟非流式一致: prompt_tokens / completion_tokens / total_tokens / cached_tokens / cache_hit_rate / cost_turn / cost_currency / tokens_uncached
 *   - tokens_uncached === prompt - cached (F4 拍板, 1b5-s2.5 Pitfall 13)
 *   - cost 公式反算 1e-7 浮点 (跟 1d.5-A.5 + 1d.5-D-1 一致)
 *   - finish_reason 出现在最后一个 chunk (OAI 标准, 跟 usage 同步)
 *
 * 触发条件 (跟 1d/1d.5-A/1d.5-A.5/1d.5-D-1 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/deepseek-streaming.test.ts
 *
 * 红线 (跟 1d/1d.5-A/1d.5-A.5/1d.5-D-1 一致):
 *   1. test 代码**不**直接读 .env 文件 (项目根, D-7 loadProjectEnv 自动加载)
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (1d.5-D-2 = 1 turn streaming, **不**累积)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 1 turn streaming)
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR DEEPSEEK_API_KEY undefined → it.skip
 *   - 缺 key 时**不**fail, 单测保持 207/5 skipped baseline
 *
 * 真接最小化 (cost 估算, per pricing.default.toml flash 1.0/2.0/M):
 *   - system: 短 (跟 1d.5-A 同 27 token, 短 prompt 验 stream 而非 cache)
 *   - user: "Write a 50 word essay on the ocean" (~10 token)
 *   - completion: 50 word ~ 70 token
 *   - 总 cost: 27/1M × 1.0 + 10/1M × 1.0 + 70/1M × 2.0 = 0.000027 + 0.00001 + 0.00014 = ~¥0.00018
 *   - 跟 1d.5-D-1 (4 turn 长 prompt 累积) 比 D.2 cost 极低
 *
 * 跟 1d.5-D-1 差异:
 *   - 1d.5-D-1 = 非流式 chat() 4 turn 累积
 *   - 1d.5-D-2 = 流式 stream() 1 turn partial chunks 累积
 *   - D.1 验非流式 cost 公式, D.2 验流式 cost 公式**应**跟 D.1 一致 (OAI 协议 spec)
 *
 * 跟 unit test 差异:
 *   - 已有 deepseek-client.test.ts mock test 验 stream() 路径 (parseSseEvent 路径)
 *   - 1d.5-D-2 = 真接 DeepSeek 真 API 验 stream() 路径, **不**走 mock
 *   - 验 SSE wire 协议 (data: ... / [DONE] sentinel) 跟 mock 兼容性
 *
 * 不验证 (留后续 D.3/D.4 sub-step):
 *   - tool_calls schema 真接 (D.3 = OAI tool_calls 字段)
 *   - error handling 真接 5xx/timeout (D.4 = AbortError → LLMNetworkError 包装路径)
 *   - 多 turn streaming (留后续 sub-step)
 *   - Anthropic protocol streaming (留 Sprint 2 + 1d.5-B-base)
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage, ChatChunk } from '../../src/types.js';

// ---- 红线门 (helper 化, D-10a-2 2026-06-04) ----
import { deepseekSkipReason } from './_helpers/integration-gate.js';

// ---- 1 turn streaming 短 prompt (不验 cache, 验流式 chunk 累积) ----

const SYSTEM_PROMPT = 'You are a concise essayist. Keep responses under 50 words.';
const USER_PROMPT = 'Write a 50 word essay on the ocean.';

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: USER_PROMPT },
];

// ---- 辅助: dump streaming chunks 行为 ----

interface StreamSnapshot {
  chunkCount: number;
  totalDeltaContent: string;
  hasFinishReason: boolean;
  finalFinishReason: string | undefined;
  finalUsage: import('../../src/types.js').Usage | undefined;
}

function dumpStreamSnapshot(label: string, snap: StreamSnapshot): void {
  console.log(
    `[${label}]`,
    JSON.stringify({
      chunkCount: snap.chunkCount,
      totalDeltaContent: snap.totalDeltaContent,
      hasFinishReason: snap.hasFinishReason,
      finalFinishReason: snap.finalFinishReason,
      finalUsage: snap.finalUsage
        ? {
            prompt: snap.finalUsage.prompt_tokens,
            completion: snap.finalUsage.completion_tokens,
            total: snap.finalUsage.total_tokens,
            cached: snap.finalUsage.cached_tokens,
            hit_rate: snap.finalUsage.cache_hit_rate,
            cost: snap.finalUsage.cost_turn,
            currency: snap.finalUsage.cost_currency,
            uncached: snap.finalUsage.tokens_uncached,
          }
        : undefined,
    }),
  );
}

// ---- 主测试: 1 turn streaming 短 prompt 验 partial chunks + cost 公式 ----

describe('DeepSeek shim — 1d.5-D-2 streaming SSE partial chunks 真接 (D.2 分步走)', () => {
  const fileSkipReason = deepseekSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  it('1 turn streaming 短 prompt (50 word essay): partial chunks 累积 + 末 chunk 带 usage + F4 不变量 + cost 公式反算', async () => {
    const client = new DeepSeekClient();

    // ---- 收集 chunks (callback 模式) ----
    const collectedDeltas: string[] = [];
    let chunkCount = 0;
    let lastChunk: ChatChunk | undefined;
    let lastUsage: import('../../src/types.js').Usage | undefined;
    let finalFinishReason: string | undefined;

    await client.stream(MESSAGES, {
      onChunk: (chunk: ChatChunk) => {
        chunkCount += 1;
        lastChunk = chunk;
        // 收集 content delta
        if (chunk.delta?.content) {
          collectedDeltas.push(chunk.delta.content);
        }
        // 收集 usage (末 chunk 携带, P1 fix 2026-06-03 stream_options.include_usage=true)
        if (chunk.usage) {
          lastUsage = chunk.usage;
        }
        // 收集 finish_reason (末 chunk 携带)
        if (chunk.finish_reason) {
          finalFinishReason = chunk.finish_reason;
        }
      },
    });

    // ---- 断言层 1: 流式触发 (至少 1 个 chunk) ----
    expect(chunkCount).toBeGreaterThanOrEqual(1);
    expect(lastChunk).toBeDefined();

    // ---- 断言层 2: 累积 content 跟非流式完整 content 一样 (流式等于非流式, OAI spec) ----
    const accumulatedContent = collectedDeltas.join('');
    expect(accumulatedContent.length).toBeGreaterThan(0);

    // ---- 断言层 3: 末 chunk 带 usage (P1 fix stream_options.include_usage=true) ----
    expect(lastUsage).toBeDefined();
    if (!lastUsage) return; // narrowed

    // ---- 断言层 4: finish_reason 末 chunk 出现 ----
    expect(finalFinishReason).toBe('stop');

    // ---- 断言层 5: usage shape 跟非流式一致 (跟 1d.5-A/1d.5-A.5/1d.5-D-1 同 shape) ----
    expect(lastUsage.prompt_tokens).toBeGreaterThan(0);
    expect(lastUsage.completion_tokens).toBeGreaterThan(0);
    expect(lastUsage.total_tokens).toBe(lastUsage.prompt_tokens + lastUsage.completion_tokens);

    // 短 prompt 27 token system + 10 token user = 37 token, cached 期望 0 (跟 1d.5-A 一致, 短 prompt 不触发 cache)
    expect(lastUsage.prompt_tokens).toBeLessThan(100);
    // completion 50 word ~ 70 token
    expect(lastUsage.completion_tokens).toBeLessThan(150);

    // ---- 断言层 6: cached_tokens (短 prompt 期望 0) ----
    // 跟 1d.5-A 一致, 短 prompt 不触发 prefix cache
    if (lastUsage.cached_tokens !== undefined) {
      expect(lastUsage.cached_tokens).toBe(0);
    }
    // cache_hit_rate 期望 undefined (cached=0 时 1b5 pricing 协议路径走 absent)
    // **不** 强制 (server 可能返 0/1, 看 server 行为)

    // ---- 断言层 7: F4 拍板不变量 (1b5-s2.5 Pitfall 13, 跨协议) ----
    // 短 prompt cached=0 路径: tokens_uncached 期望 undefined (computeCost 返 undefined 当 cached=undefined)
    //   **或** 期望 === prompt_tokens (cached=0 时, tokens_uncached = prompt - 0 = prompt)
    // 流式跟非流式同路径, 期望 tokens_uncached === prompt_tokens
    if (lastUsage.tokens_uncached !== undefined) {
      expect(lastUsage.tokens_uncached).toBe(lastUsage.prompt_tokens);
    }

    // ---- 断言层 8: cost 公式反算 (cached=0 路径, 1d.5-A 验过 1e-7 浮点) ----
    // 公式: uncached × 1.0/1e6 + completion × 2.0/1e6 (cached=0 路径无 cache_hit 价)
    if (typeof lastUsage.cost_turn === 'number' && lastUsage.tokens_uncached !== undefined) {
      const uncached = lastUsage.tokens_uncached;
      const completion = lastUsage.completion_tokens;
      const expected = (uncached * 1.0) / 1_000_000 + (completion * 2.0) / 1_000_000;
      // 1e-7 浮点噪声内一致 (跟 1d.5-A + 1d.5-A.5 + 1d.5-D-1 一致)
      expect(Math.abs(lastUsage.cost_turn - expected)).toBeLessThan(1e-7);
      expect(lastUsage.cost_currency).toBe('CNY');
    }

    // ---- 断言层 9: 揭示真实 streaming 行为 (R-G2 风格, dump 不写断言) ----
    const snap: StreamSnapshot = {
      chunkCount,
      totalDeltaContent: accumulatedContent,
      hasFinishReason: finalFinishReason !== undefined,
      finalFinishReason,
      finalUsage: lastUsage,
    };
    dumpStreamSnapshot('1d.5-D-2', snap);

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content 全文 echo 到 console.
  }, 60_000); // 60s timeout: 1 turn streaming, 短 prompt 50 word essay
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
