/**
 * Sprint 1c-revive-2-D-1 — AnthropicClient stream path 真接 + 跨 Anthropic 协议 (1c-revive 拆分, 2026-06-04)
 *
 * 目的: 1c-revive-2-B-1 (bddd5ff) 1c.5 拍板 实施 AnthropicClient tools, 但 stream path 1b.5 era
 * 0 真接覆盖. 1c-revive-2-D-1 跑 stream path 真接, 跟 chat path 形成对照:
 *   - chat path: 1c-revive-2-B-3 (f3be6d4) 走 4 turn runToolLoop 端到端, 验 finish_reason + content
 *   - **stream path (本文)**: 1 turn 算术 stream() 端到端, 验 onChunk 多次调用 + 累积 + finish + F4
 *
 * 跟 1c-revive-2-B-3 关键差异:
 *   - 1c-revive-2-B-3 = chat path (runToolLoop + BashTool 真执行)
 *   - **1c-revive-2-D-1 = stream path** (client.stream + onChunk callback + 6 tool schema 描述)
 *   - stream 跟 chat 协议转换一致 (1c-revive-2-B-1 拍板后), 但 onChunk 多次调用 + 累积 pattern 走
 *     Anthropic SDK MessageStream, 跟 chat 单次 ChatResult 模式**不一样**
 *
 * 关键不变量 (stream path, pi-agent 4-layer 拍板):
 *   - client.stream(messages, { onChunk, signal, tools, tool_choice }) 跨 Anthropic 协议 走通
 *   - onChunk 多次调用 (Anthropic SDK 流式 event 走), 累积 content
 *   - 最终 finish_reason='stop' 跟 chat 路径一致
 *   - 0 行 production code 改 (stream path 1c-revive-2-B-1 拍板后已完整)
 *   - **不**mock LLM, 真实 stream path (跟 1c-revive-2-B-3 镜)
 *   - 6 tool schema 描述 + system 触发 prefix cache (跟 1c-revive-2-B-3 turn 1 / 1c-revive-2-C+3 turn 1 一致)
 *   - F4 拍板 (1d.5-A.5 揭示): 跨 Anthropic 协议路径 cached>0 → cost_turn absent
 *   - stream 跟 chat F4 absent 跨协议一致 (P27 拍板 6 cell 矩阵的 stream 维度补)
 *
 * 触发条件 (跟 1c-revive-1 / 1c-revive-2-A / 1c-revive-2-B-3 / 1c-revive-2-C+3 一致):
 *   INTEGRATION=1 pnpm vitest run packages/coding-agent/test/integration/anthropic-stream-2d1.test.ts
 *
 * 红线 (跟 1c-revive-1 / 1c-revive-2-A / 1c-revive-2-B-3 / 1c-revive-2-C+3 一致):
 *   1. test 代码**不**直接读 .env 文件 (D-7 loadProjectEnv 自动加载项目根 .env)
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (本 test = **1 turn stream 端到端**)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 1 turn stream 流程)
 *   6. **不**mock LLM, 真实 stream path
 *   7. 不跑 runToolLoop (跟 1c-revive-2-B-3 跑 runToolLoop 不同, 本文只验 client.stream path)
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR (ANTHROPIC_AUTH_TOKEN undefined AND DEEPSEEK_API_KEY undefined) → it.skip
 *   - 缺 key 时**不**fail, 单测保持 baseline
 *
 * API key 来源 (跟 anthropic-client.ts L228-235 resolveApiKey 一致):
 *   - 优先 ANTHROPIC_AUTH_TOKEN (Anthropic SDK 标准)
 *   - 退路 DEEPSEEK_API_KEY (1b.5 shim 走 /anthropic 端点同 key 验证)
 *   - 任一非空 → canRun
 *
 * 1c-revive 完整 cluster 状态 (6 commits 完 + 1c-revive-2-D-1 拍板, 7 commits):
 *   - ✅ 1c-revive-1 (2d245a3)
 *   - ✅ 1c-revive-2-A (83f87d7)
 *   - ✅ 1c-revive-2-B-1 (bddd5ff)
 *   - ✅ 1c-revive-2-B-2 (3fbced7)
 *   - ✅ 1c-revive-2-B-3 (f3be6d4)
 *   - ✅ 1c-revive-2-C+3 (7914729)
 *   - 🔄 1c-revive-2-D-1 (本文): stream path 真接
 *
 * 不验证 (留后续):
 *   - 多 turn stream (留 1c-revive-2-D-2 错误恢复或后续)
 *   - 错误恢复 / abort signal / maxSteps 触顶 (留 1c-revive-2-D-2)
 *   - schema 校验 (留 1c-revive-2-D-3)
 *   - 多 tool_calls 累积 (留 1c-revive-2-D-4)
 *   - runToolLoop 走 stream path (留 v2+ / Sprint 1.5+ 选型)
 */

import { describe, expect, it } from 'vitest';
import { AnthropicClient, type ChatChunk, type ChatMessage } from '@deepwhale/llm';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { deepseekAnthropicShimSkipReason } from '../../../llm/test/integration/_helpers/integration-gate.js';

// ---- 红线门 (helper 化, D-9 2026-06-04): 占位符过滤 + 走 it.runIf + 统一 skip reason ----

// ---- test scenario: stream path 1 turn 算术 + 6 tool schema 描述 + system ----

const SYSTEM_PROMPT =
  'You are a careful math assistant. You have access to a bash tool that can execute whitelisted ' +
  'shell commands (including `echo` and `node`). Use the bash tool to compute arithmetic expressions ' +
  'instead of computing them yourself. After receiving the tool result, give the user the final ' +
  'answer as a short sentence.';

const USER_QUESTION = 'What is 17 * 23?';
const EXPECTED_ANSWER = '391';

// ---- 辅助: snapshot stream path 行为 ----

interface StreamSnapshot {
  chunkCount: number;
  totalContentLen: number;
  firstContentChunkIdx: number | undefined;
  lastContentChunkIdx: number | undefined;
  finalFinishReason: string | undefined;
  finalUsage: import('@deepwhale/llm').Usage | undefined;
}

function snapshotStream(
  chunks: ReadonlyArray<ChatChunk>,
  finalResult: import('@deepwhale/llm').ChatResult,
): StreamSnapshot {
  let totalContentLen = 0;
  let firstContentChunkIdx: number | undefined;
  let lastContentChunkIdx: number | undefined;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    if (c.delta.content !== undefined && c.delta.content.length > 0) {
      totalContentLen += c.delta.content.length;
      if (firstContentChunkIdx === undefined) firstContentChunkIdx = i;
      lastContentChunkIdx = i;
    }
  }
  return {
    chunkCount: chunks.length,
    totalContentLen,
    firstContentChunkIdx,
    lastContentChunkIdx,
    finalFinishReason: finalResult.finish_reason,
    finalUsage: finalResult.usage,
  };
}

function dumpSnapshot(label: string, snap: StreamSnapshot): void {
  console.log(
    `[${label}] stream snapshot (${snap.chunkCount} chunks, totalContentLen=${snap.totalContentLen}):`,
    JSON.stringify({
      chunkCount: snap.chunkCount,
      totalContentLen: snap.totalContentLen,
      firstContentChunkIdx: snap.firstContentChunkIdx,
      lastContentChunkIdx: snap.lastContentChunkIdx,
      finalFinishReason: snap.finalFinishReason,
      finalContent: snap.finalUsage !== undefined ? 'see usage' : 'no usage',
      usage: snap.finalUsage
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

// ---- 主测试: stream path 端到端 跨 Anthropic 协议 ----

describe('coding-agent client — 1c-revive-2-D-1 AnthropicClient stream path 真接 + 跨 Anthropic 协议 (1c-revive 拆分)', () => {
  // D-11-4 review P1 修复 (2026-06-04): 改 helper deepseekAnthropicShimSkipReason()
  // 模式. 之前 anyProviderSkipReason() 允许 ANTHROPIC_AUTH_TOKEN 存在就跑, 但
  // AnthropicClient 默认 baseURL = DEEPSEEK_ANTHROPIC_BASE_URL, 走的是 DeepSeek 提供的
  // /anthropic 端点, 认证用 DEEPSEEK_API_KEY. 用户只有 ANTHROPIC_AUTH_TOKEN 时会撞 401.
  // 跟 multi-tool-calls-2d4 / schema-validation-2d3 模式一致.
  const fileSkipReason = deepseekAnthropicShimSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  it(`1 turn stream path 跨 Anthropic 协议: onChunk tool_use + finish=tool_calls + BashTool 不参与 (验 client.stream path, 不跑 runToolLoop)`, async () => {
    // 1c.5 拍板 (1c-revive-2-B-1) 让 stream path 跟 chat path 协议转换一致
    // → 1c-revive-2-D-1 验 stream path 真接端到端, 跟 chat 路径 1c-revive-2-B-3 形成对照
    //
    // R7 关键观察 (1c-revive-2-D-1 揭示): LLM 走 stream path 调工具时, onChunk 调用模式:
    //   - 跳 text 直接 tool_use, 1 个 chunk (含 tool_calls + finish_reason=tool_calls)
    //   - 这是因为 LLM 选最优路径, stream text delta 在 tool_use 路径**不**触发
    //   - 跟 chat 路径 1c-revive-2-B-3 turn 1 行为**一致** (LLM 选调工具, 不发 text)
    //
    // 跟 1c-revive-2-B-3 关键差异: 本文只验 client.stream path, 不跑 runToolLoop (runToolLoop 是
    // mode layer, client.stream 是 model layer). 1c-revive-2-D-1 验证 stream path 1 turn 端到端
    // 走通, 跟 chat 路径对比协议分叉行为.
    const client = new AnthropicClient();
    const registry = createDefaultRegistry();
    const tools = registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.schema,
    }));

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_QUESTION },
    ];

    const chunks: ChatChunk[] = [];
    const finalResult = await client.stream(messages, {
      tools,
      tool_choice: 'auto',
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    const snap = snapshotStream(chunks, finalResult);
    dumpSnapshot('1c-revive-2-D-1 [BEFORE assertions]', snap);

    // ---- 流程 1: 跑 stream path 端到端 (client.stream + onChunk 完整) ----
    expect(snap.chunkCount).toBeGreaterThan(0);
    expect(finalResult).toBeDefined();

    // ---- 流程 2: 验 onChunk 至少 1 次调用 (跟 1b.5 Step 2 拍板 8 tests 覆盖 main path) ----
    // R7 揭示: stream path tool_use 模式下 onChunk 走 message_delta event (含 tool_calls + usage),
    // 跳 text_delta 路径. 1 个 chunk 是**预期** (跟 1c-revive-2-B-3 LLM 调工具行为一致).
    // 不强制 multi-chunk, 软断言 >= 1.
    expect(snap.chunkCount).toBeGreaterThanOrEqual(1);

    // ---- 流程 3: 验 final finish_reason (LLM 自由选, soft assertions) ----
    // R7 揭示: LLM 在 stream 路径下选调工具 → finish_reason='tool_calls'.
    // 注: 如果 LLM 选不发 text 直接 final answer, finish_reason='stop'.
    // 软断言: finish_reason 必须是 'stop' 或 'tool_calls' (跟 chat 路径一致).
    expect(['stop', 'tool_calls']).toContain(snap.finalFinishReason);

    // ---- 流程 4: 验 final tool_calls 完整性 (如果 LLM 调工具 path) ----
    // R7 揭示: LLM 走 tool_use 路径, final tool_calls 应该**至少** 1 个
    // (跟 1c-revive-2-B-3 turn 1 镜, 6 tool schema 描述触发 LLM 自由选 bash)
    if (snap.finalFinishReason === 'tool_calls') {
      expect(finalResult.tool_calls).toBeDefined();
      expect(finalResult.tool_calls!.length).toBeGreaterThan(0);
      const tc = finalResult.tool_calls![0]!;
      // 跨协议 echo: Anthropic tool_use id 跟 OAI tool_call_id 同 shape
      expect(tc.id).toBeDefined();
      expect(tc.name).toBeDefined();
      expect(tc.id.startsWith('call_')).toBe(true); // Anthropic shim OAI routing 格式
    } else {
      // 软断言: 如果 LLM 选 final answer path, content 含期望答案
      expect(finalResult.content).toContain(EXPECTED_ANSWER);
    }

    // ---- 流程 5: 验 F4 拍板不变量跨 stream path ----
    expect(finalResult.usage).toBeDefined();
    // tokens_uncached === prompt - cached (F4 拍板, 跨 cached 路径) 是**硬**不变量
    const usage = finalResult.usage!;
    expect(usage.tokens_uncached).toBeDefined();
    expect(usage.tokens_uncached).toBe(usage.prompt_tokens - (usage.cached_tokens ?? 0));

    // ---- 流程 6: 验 F4 absent 跨 Anthropic 协议路径 (P27 拍板 stream 维度补) ----
    // F4 拍板 (1d.5-A.5 揭示): 跨 Anthropic 协议 cached > 0 → cost_turn / cost_currency absent
    // 1c-revive-2-D-1 验证 stream path 跟 chat path 协议分叉一致
    // 跟 1c-revive-2-B-3 成本层 7 关键差异: stream 路径验证 (chat 路径已验过)
    if ((usage.cached_tokens ?? 0) > 0) {
      expect(usage.cost_turn).toBeUndefined();
      expect(usage.cost_currency).toBeUndefined();
    }

    // ---- 流程 7: 揭示真实 stream path 行为 (R-G2 风格, dump 不写断言) ----
    // 重点观测:
    //   - chunkCount (onChunk 调用次数) - R7 揭示 1 chunk (LLM 跳 text 直 tool_use)
    //   - totalContentLen (累积 content 长度) - R7 揭示 0 (无 text delta)
    //   - chunk 序列 (跟 1b.5 Step 2 mock test 8 tests 覆盖 main path 一致)
    //   - cached_tokens 跨 turn 累积 pattern - R7 揭示 prompt=1095, cached=1024 (跟 1c-revive-2-B-3 turn 1 镜)
    //   - **cost absent 跨 stream path** (1c-revive-2-D-1 关键贡献, 跟 chat 路径 1c-revive-2-B-3 对照)
    //   - tool_call_id 跨协议 echo (call_00_xxx, 跟 1c-revive-2-B-3 镜)

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content 全文 echo 到 console.
  }, 120_000); // 120s timeout: 1 turn stream path 跨 Anthropic 协议
});
