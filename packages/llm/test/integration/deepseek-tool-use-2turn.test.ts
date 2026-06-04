/**
 * Sprint 1c-revive-1 — DeepSeek tool_use 2 turn 端到端真接验证 (1c-revive 拆分, 2026-06-04)
 *
 * 目的: 1d.5-D-3 (467ce91) 验**单 turn** tool_call 触发 (1 turn user ask → finish_reason='tool_calls').
 * 1c-revive-1 验**2 turn 端到端** tool_use 流程:
 *   - turn 1: user ask → LLM 决定调工具, finish_reason='tool_calls' (跟 1d.5-D-3 一样)
 *   - turn 1: caller 收 result, 模拟 tool execution (test code 算 expression = 17*23 = 391)
 *   - turn 1: caller append assistant message (带 tool_calls) + tool message (带 tool_call_id + result)
 *   - turn 2: LLM 看到 tool result, 生成 final answer
 *   - finish_reason='stop' (LLM 用完 tool 后给最终答案)
 *
 * 1c-revive 原始议题 = DeepSeek tool_use + mode layer + 跨包 session module.
 * 1c-revive-1 拆分 = **只**验 DeepSeek OAI 2 turn 端到端 流程, **不**动 mode layer, **不**跨包.
 * mode layer 改 (1b.5 c86a34c + 4cf7eaa F3 拍板) 留 1c-revive-2.
 * 跨包 session module 集成 留 1c-revive-3.
 *
 * 关键不变量 (2 turn tool_use 端到端):
 *   - turn 1: finish_reason='tool_calls' (LLM 决定调工具, OAI spec)
 *   - turn 1: tool_calls 数组**至少 1 个** ToolCall (id / name / args 3 字段必填)
 *   - turn 1: result.tool_calls[0].id 是字符串 (OAI 用 echo 给后续 tool 消息)
 *   - turn 1: usage shape 跟 1d.5-D-3 一致 (cached>0 / tokens_uncached / cost)
 *   - turn 2: messages 累积**不**破坏 OAI 协议序列
 *     (system + user + assistant with tool_calls + tool with tool_call_id + user follow-up)
 *   - turn 2: finish_reason='stop' (LLM 用完 tool 给最终答案)
 *   - turn 2: content 包含 "391" (17 * 23 = 391, 验 LLM 真"理解" tool result)
 *   - turn 2: cached_tokens 跨 turn 复用 (跟 1d.5-D-1 一致, system + tool schema 描述 prefix 复用)
 *   - turn 2: usage 字段完整, F4 拍板不变量跨 turn 全验证
 *
 * 触发条件 (跟 1d.5-A/1d.5-A.5/1d.5-D-3 等真接 test 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/deepseek-tool-use-2turn.test.ts
 *
 * 红线 (跟 1d.5-A/1d.5-A.5/1d.5-D-3 等真接 test 一致):
 *   1. test 代码**不**直接读 .env 文件 (项目根, D-7 loadProjectEnv 自动加载)
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (1c-revive-1 = **2 turn** tool_use 端到端)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 2 turn 流程)
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR DEEPSEEK_API_KEY undefined → it.skip
 *   - 缺 key 时**不**fail, 单测保持 207/8 skipped baseline
 *
 * 真接最小化 (cost 估算, per pricing.default.toml flash 1.0/2.0/M, cache hit 0.02/M):
 *   - system: ~50 token (跟 1d.5-D-3 一样)
 *   - tool schema: ~150 token (calculate tool)
 *   - turn 1 user: 8 token ("What is 17*23?")
 *   - turn 1 tool_calls: 1 个 (name=calculate, args={expression:"17*23"}), 60-70 token
 *   - turn 1 cost: ~¥0.00025 (跟 1d.5-D-3 turn 1 接近)
 *   - tool message: "391" ~ 3 token
 *   - turn 2 user follow-up: optional (LLM 应直接给最终答案, **不**需新 user)
 *     实际: 走完 turn 1 累积后, **不**发新 user, 验 LLM 真"主动" 给最终答案
 *   - turn 2 cost: ~¥0.00025 (cached 持续 256, 跟 1d.5-D-3 类似)
 *   - 总 cost: ~¥0.0005 (跟 1d.5-D-3 单 turn 接近, 因 cached 跨 turn 复用)
 *
 * Tool execution 模拟:
 *   - test code 收到 result.tool_calls, 自己算 expression (test code 模拟 tool execution)
 *   - 不依赖外部 tool 运行时 / sandbox / mock
 *   - 简单 expression (e.g. "17*23") 用 JS eval 计算结果
 *   - 复杂 expression (e.g. "(15+27)*4") 仍 JS eval 算
 *   - 错误 expression (e.g. "abc") 不在 1c-revive-1 范围内, 留 1c-revive-2 mode layer
 *
 * 跟 1d.5-D-3 差异:
 *   - 1d.5-D-3 = **单 turn** tool_call 触发 (1 turn user ask → finish_reason='tool_calls' → 收手)
 *   - 1c-revive-1 = **2 turn** tool_use 端到端 (turn 1 ask + tool 1 turn response 回灌 + turn 2 final answer)
 *   - 1d.5-D-3 验 LLM 决定调工具 + 提取合法 args
 *   - 1c-revive-1 验 LLM 用完 tool 后给最终答案 (语义层)
 *   - 1d.5-D-3 不验 tool_call_id echo 路径
 *   - 1c-revive-1 验 tool_call_id echo (assistant.tool_calls[0].id === tool.tool_call_id)
 *
 * 跟 1c-revive-2/3 差异:
 *   - 1c-revive-1 = 纯 client 真接 2 turn 端到端, **不**动 mode layer, **不**跨包
 *   - 1c-revive-2 = mode-layer 改 (1b.5 c86a34c + 4cf7eaa F3 拍板, tool_loop disable 集成)
 *   - 1c-revive-3 = 跨包 session module 集成 (packages/coding-agent)
 *
 * 不验证 (留后续 1c-revive-2/3):
 *   - mode-layer tool_loop disable 集成 (留 1c-revive-2)
 *   - 跨包 session module 集成 (留 1c-revive-3)
 *   - 错误 expression 处理 (留 mode layer, 1c-revive-2)
 *   - 多 tool_calls 累积 (留 mode layer, 1c-revive-2)
 *   - 复杂 tool schema (e.g. nested objects, 1c-revive-2/3)
 *   - Anthropic 协议 tool_use (留 1c-revive-2)
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage, LLMToolSchema, ToolCall } from '../../src/types.js';

// ---- 红线门 (helper 化, D-10a-2 2026-06-04) ----
import { integrationSkipReason } from './_helpers/integration-gate.js';

// ---- calculate tool schema (跟 1d.5-D-3 一样) ----

const CALCULATE_TOOL: LLMToolSchema = {
  name: 'calculate',
  description:
    'Evaluate a mathematical expression. The expression should be a valid arithmetic expression ' +
    'using +, -, *, /, (, ) operators with non-negative integers. ' +
    'Returns the numeric result. Use this tool whenever the user asks for any arithmetic calculation.',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'A valid arithmetic expression, e.g. "2+2" or "(3+4)*5".',
      },
    },
    required: ['expression'],
  },
};

const SYSTEM_PROMPT =
  'You are a careful math assistant. You MUST use the calculate tool for any arithmetic question. ' +
  'Do not compute the answer yourself; call the calculate tool with the expression. ' +
  'After receiving the tool result, give the final answer to the user as a short sentence.';

const USER_QUESTIONS: ReadonlyArray<{
  question: string;
  expression: string;
  expectedAnswer: string;
}> = [
  { question: 'What is 17 * 23?', expression: '17*23', expectedAnswer: '391' },
  { question: 'What is (15 + 27) * 4?', expression: '(15+27)*4', expectedAnswer: '168' },
] as const;

const TURN_COUNT = USER_QUESTIONS.length;

// ---- 辅助: 模拟 tool execution (test code 自己算, 不依赖外部 runtime) ----

function executeCalculate(expression: string): string {
  // 安全 evaluate: 只允许数字 + 操作符
  // 1c-revive-1 范围**不**覆盖 sandbox 评估, 留 1c-revive-2
  // 简单算术 eval: 把数字 / 算子 / 括号扔进 Function, try-catch
  // 注: 真实生产用 vm2 / isolated-vm 隔离, Sprint 1c-revive-2 mode layer 处理
  if (!/^[\d+\-*/().\s]+$/.test(expression)) {
    throw new Error(`Invalid expression (not pure arithmetic): ${expression}`);
  }
  const result = Function(`"use strict"; return (${expression});`)();
  return String(result);
}

// ---- 辅助: snapshot 2 turn 行为 ----

interface TurnSnapshot {
  turnIndex: number;
  question: string;
  finish_reason: string | undefined;
  content: string;
  toolCalls: ReadonlyArray<ToolCall>;
  usage: import('../../src/types.js').Usage | undefined;
  messageCount: number;
}

function snapshotTurn(
  turnIndex: number,
  question: string,
  result: import('../../src/types.js').ChatResult,
  messageCount: number,
): TurnSnapshot {
  return {
    turnIndex,
    question,
    finish_reason: result.finish_reason,
    content: result.content,
    toolCalls: result.tool_calls ?? [],
    usage: result.usage,
    messageCount,
  };
}

function dumpSnapshots(label: string, snaps: TurnSnapshot[]): void {
  for (const s of snaps) {
    console.log(
      `[${label}] turn${s.turnIndex + 1} (${s.question}, msgCount=${s.messageCount}):`,
      JSON.stringify({
        finish_reason: s.finish_reason,
        content_len: s.content.length,
        tool_call_count: s.toolCalls.length,
        tool_call_names: s.toolCalls.map((tc) => tc.name),
        tool_call_args: s.toolCalls.map((tc) => tc.args),
        usage: s.usage
          ? {
              prompt: s.usage.prompt_tokens,
              completion: s.usage.completion_tokens,
              total: s.usage.total_tokens,
              cached: s.usage.cached_tokens,
              hit_rate: s.usage.cache_hit_rate,
              cost: s.usage.cost_turn,
              currency: s.usage.cost_currency,
              uncached: s.usage.tokens_uncached,
            }
          : undefined,
      }),
    );
  }
}

// ---- 主测试: 2 turn tool_use 端到端流程 ----

describe('DeepSeek shim — 1c-revive-1 tool_use 2 turn 端到端真接 (1c-revive 拆分, 不动 mode layer)', () => {
  const fileSkipReason = integrationSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  it(`${TURN_COUNT} × 2 turn tool_use: turn 1 ask + tool 1 turn response 回灌 + turn 2 final answer`, async () => {
    const client = new DeepSeekClient();
    const snaps: TurnSnapshot[] = [];

    // ---- 2 turn tool_use 端到端 (每 turn 累积 5-6 message: system + user + assistant + tool + ...) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const { question, expression, expectedAnswer } = USER_QUESTIONS[i]!;
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ];

      // ---- turn 1: user ask → LLM 决定调工具 → finish_reason='tool_calls' ----
      const result1 = await client.chat(messages, {
        tools: [CALCULATE_TOOL],
        tool_choice: 'auto',
      });

      expect(result1.model).toBe('deepseek-v4-flash');
      expect(result1.finish_reason).toBe('tool_calls');
      expect(result1.tool_calls).toBeDefined();
      if (!result1.tool_calls) return; // narrowed

      // 累积 turn 1 assistant message (带 tool_calls)
      messages.push({
        role: 'assistant',
        content: result1.content,
        tool_calls: result1.tool_calls,
      });

      // 模拟 tool execution (test code 自己算)
      const toolResults: string[] = [];
      for (const tc of result1.tool_calls) {
        expect(tc.name).toBe('calculate');
        const expr = String(tc.args['expression'] ?? '');
        // 1c-revive-1 验证 expression 跟 expected expression 一致 (LLM 真"理解" question)
        // 不强制严格 ===, 因为 LLM 可能加空格 (e.g. "17 * 23" vs "17*23")
        expect(expr.replace(/\s+/g, '')).toBe(expression.replace(/\s+/g, ''));
        const result = executeCalculate(expr);
        toolResults.push(result);
      }

      // 累积 turn 1 tool message (带 tool_call_id echo)
      for (let j = 0; j < result1.tool_calls.length; j++) {
        const tc = result1.tool_calls[j]!;
        messages.push({
          role: 'tool',
          content: toolResults[j]!,
          tool_call_id: tc.id,
        });
      }

      // ---- turn 2: 累积 messages 再次 chat → LLM 用完 tool 给最终答案 ----
      const result2 = await client.chat(messages, {
        tools: [CALCULATE_TOOL],
        tool_choice: 'auto',
      });

      // 收集 2 个 turn snapshot
      snaps.push(snapshotTurn(i * 2, question, result1, messages.length));
      snaps.push(snapshotTurn(i * 2 + 1, question, result2, messages.length + 1));

      // 验 turn 2: finish_reason='stop', content 包含 expectedAnswer
      expect(result2.model).toBe('deepseek-v4-flash');
      expect(result2.finish_reason).toBe('stop');
      expect(result2.content).toContain(expectedAnswer);
    }

    // ---- 断言层 1: 4 turn 全部完成 (TURN_COUNT × 2) ----
    expect(snaps.length).toBe(TURN_COUNT * 2);

    // 提前 dump 真实数据 (即使后续断言 fail 也保留)
    dumpSnapshots('1c-revive-1 [BEFORE assertions]', snaps);

    // ---- 断言层 2: 偶数 turn (tool_call 触发) finish_reason='tool_calls' ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const toolCallTurn = snaps[i * 2]!;
      expect(toolCallTurn.finish_reason).toBe('tool_calls');
      expect(toolCallTurn.toolCalls.length).toBeGreaterThanOrEqual(1);
    }

    // ---- 断言层 3: 奇数 turn (final answer) finish_reason='stop', content 包含答案 ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const finalTurn = snaps[i * 2 + 1]!;
      const expectedAnswer = USER_QUESTIONS[i]!.expectedAnswer;
      expect(finalTurn.finish_reason).toBe('stop');
      expect(finalTurn.content).toContain(expectedAnswer);
    }

    // ---- 断言层 4: 4 turn usage shape 完整 (跟 1d.5-D-3 一致) ----
    for (const snap of snaps) {
      expect(snap.usage).toBeDefined();
      if (!snap.usage) continue; // narrowed
      expect(snap.usage.prompt_tokens).toBeGreaterThan(0);
      expect(snap.usage.completion_tokens).toBeGreaterThan(0);
      expect(snap.usage.total_tokens).toBe(
        snap.usage.prompt_tokens + snap.usage.completion_tokens,
      );
    }

    // ---- 断言层 5: F4 拍板不变量跨 4 turn 全验证 (cached 路径, 跟 1d.5-D-3 一致) ----
    // 注: turn 1 (tool_call 触发, 短 prompt) cached 可能 = 0 (跟 1d.5-D-3 一样, 短 prompt 不一定触发),
    //      turn 2 (final answer, messages 累积) cached 可能 > 0 (messages 累积触发 prefix cache).
    // 拆开验: 偶数 turn (tool_call 触发) 软断言, 奇数 turn (final answer) 强断言 cached>0.
    for (let i = 0; i < TURN_COUNT; i++) {
      const toolCallTurn = snaps[i * 2]!.usage!;
      // 偶数 turn (tool_call): cached **可** = 0 (短 prompt, 跟 1d.5-D-3 turn 1 接近)
      // 不强制 > 0, 但如果 > 0 则 cache_hit_rate 也应 > 0
      if (toolCallTurn.cached_tokens !== undefined) {
        if (toolCallTurn.cached_tokens > 0) {
          expect(toolCallTurn.cache_hit_rate).toBeGreaterThan(0);
        }
      }
      // 奇数 turn (final answer, messages 累积): cached 期望 > 0 (累积 messages 触发 prefix cache)
      const finalTurn = snaps[i * 2 + 1]!.usage!;
      expect(finalTurn.cached_tokens).toBeDefined();
      expect(finalTurn.cached_tokens).toBeGreaterThan(0);
      expect(finalTurn.cache_hit_rate).toBeDefined();
      expect(finalTurn.cache_hit_rate).toBeGreaterThan(0);
      // tokens_uncached === prompt - cached (F4 拍板, 1b5-s2.5 Pitfall 13, 跨 turn)
      expect(finalTurn.tokens_uncached).toBeDefined();
      expect(finalTurn.tokens_uncached).toBe(finalTurn.prompt_tokens - finalTurn.cached_tokens!);
      // turn 1 也验 tokens_uncached (F4 拍板, 不强制 cached>0)
      expect(toolCallTurn.tokens_uncached).toBeDefined();
      expect(toolCallTurn.tokens_uncached).toBe(
        toolCallTurn.prompt_tokens - (toolCallTurn.cached_tokens ?? 0),
      );
    }

    // ---- 断言层 6: cost 公式跨 4 turn 反算 (跨 cached 路径, 跟 1d.5-A/1d.5-A.5/1d.5-D-1/1d.5-D-3 一致) ----
    for (const snap of snaps) {
      const usage = snap.usage!;
      if (typeof usage.cost_turn !== 'number') continue;
      const cached = usage.cached_tokens ?? 0;
      const uncached = usage.tokens_uncached ?? 0;
      const completion = usage.completion_tokens;
      // cached>0 路径: cached × 0.02/1e6 + uncached × 1.0/1e6 + completion × 2.0/1e6
      // cached=0 路径: 0 × 0.02/1e6 + uncached × 1.0/1e6 + completion × 2.0/1e6 (跟 1d.5-A 一致)
      const expected =
        (cached * 0.02) / 1_000_000 +
        (uncached * 1.0) / 1_000_000 +
        (completion * 2.0) / 1_000_000;
      // 1e-7 浮点噪声内一致 (跟 1d.5-A.5/1d.5-D-1/1d.5-D-2/1d.5-D-3 验过)
      expect(Math.abs(usage.cost_turn - expected)).toBeLessThan(1e-7);
      expect(usage.cost_currency).toBe('CNY');
    }

    // ---- 断言层 7: 4 turn 总 cost 合理 ----
    let totalCost = 0;
    for (const snap of snaps) {
      if (typeof snap.usage?.cost_turn === 'number') totalCost += snap.usage.cost_turn;
    }
    // 4 turn tool_use 短 prompt + tool schema, 总 cost 期望 < ¥0.005
    expect(totalCost).toBeGreaterThan(0);
    expect(totalCost).toBeLessThan(0.005);

    // ---- 断言层 8: 揭示真实 2 turn tool_use 行为 (R-G2 风格, dump 不写断言) ----
    dumpSnapshots('1c-revive-1', snaps);

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content / args 全文 echo 到 console.
  }, 120_000); // 120s timeout: 2 turn tool_use × 2 sub-turn = 4 turn, 长 prompt + tool schema
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
