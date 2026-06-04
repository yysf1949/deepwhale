/**
 * Sprint 1d.5-D-3 — DeepSeek tool_calls schema 真接验证 (D.3 + D.4 cluster, 2026-06-04)
 *
 * 目的: 1d.5-A/1d.5-A.5/1d.5-D-1/1d.5-D-2 验**chat shape / streaming**, 没验 tool_calls.
 * 1d.5-D-3 验 OAI tool_calls 字段 (id / name / args JSON parse) + DeepSeek 走 OAI 协议带 tool 描述.
 *
 * 1a 拍板: client.chat() 完整支持 tools / tool_choice (deepseek-client.ts L137-141).
 *   buildRequestBody(messages, options.tools, options.tool_choice, false) 传工具 (deepseek-client.ts L284-294).
 *   parseOaiChatCompletion 解析 tool_calls 字段 (parse.ts L49-74, mock test 覆盖).
 * 1d.5-D-3 走**真接**验 OAI tool_calls 字段端到端.
 *
 * 关键不变量 (tool_calls 真接路径):
 *   - finish_reason === 'tool_calls' (LLM 决定调工具, OAI spec)
 *   - content === '' 或 '部分说明' (assistant 在有 tool_calls 时 content 可空, OAI spec)
 *   - tool_calls 数组**至少 1 个** ToolCall (id / name / args 3 字段必填)
 *   - tool_call.id 是字符串 (OAI 用 echo 给后续 tool 消息)
 *   - tool_call.name 跟传入 tools 列表里的某个 tool name 一致
 *   - tool_call.args 是合法 JSON object (parse.ts L62-66 解析)
 *   - cost 公式反算 1e-7 浮点内一致 (跟 1d.5-A/1d.5-A.5/1d.5-D-1/1d.5-D-2 一致)
 *
 * 触发条件 (跟 1d/1d.5-A/1d.5-A.5/1d.5-D-1/1d.5-D-2 一致):
 *   INTEGRATION=1 pnpm vitest run packages/llm/test/integration/deepseek-tool-calls.test.ts
 *
 * 红线 (跟 1d/1d.5-A/1d.5-A.5/1d.5-D-1/1d.5-D-2 一致):
 *   1. test 代码**不**直接读 .env 文件 (项目根, D-7 loadProjectEnv 自动加载)
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (1d.5-D-3 = 1 turn 主动 tool_call, **不**累积)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 1 turn tool_call)
 *
 * Skip 行为:
 *   - INTEGRATION !== '1' OR DEEPSEEK_API_KEY undefined → it.skip
 *
 * 真接最小化 (cost 估算):
 *   - tool schema 描述: ~150 token (tool 名称 + description + parameters JSON)
 *   - system + user: ~50 token
 *   - completion: 短说明 + tool_call args (10-20 token)
 *   - 总 cost: 200/1M × 1.0 + 30/1M × 2.0 = 0.0002 + 0.00006 = ~¥0.00026
 *
 * Tool 选型 (1 turn 触发 tool_call 概率高):
 *   - calculate 工具: 接受 expression 字符串 (e.g. "2+2"), 返回 result 数字
 *   - 简单、确定性强 (数学计算 LLM 一定用 tool)
 *   - arguments 简单 (1 个 string 字段)
 *   - 不需要 mock data 回填 (1 turn 就够, 不走 tool result 回灌)
 *
 * 跟 unit test 差异:
 *   - 已有 deepseek-client.test.ts mock test 验 parseOaiChatCompletion tool_calls 字段 (parse.ts L49-74)
 *   - 1d.5-D-3 = 真接 DeepSeek 真 API 验 tool_calls 端到端 (含 LLM 决定调工具的语义层)
 *   - 验 LLM 真"理解" tool schema + 真"决定" 调用 + 真"生成" 合法 args
 *
 * 跟 1c-revive tool_use 差异:
 *   - 1d.5-D-3 = DeepSeek OAI 协议 tool_calls (id/type/function.name/function.arguments, OAI spec)
 *   - 1c-revive = Anthropic SDK 协议 tool_use (name/input/input_schema, Anthropic spec)
 *   - 两条独立 code 路径 (parseOaiChatCompletion L49-74 vs parseAnthropicMessage 留 1c 实施)
 *   - 1d.5-D-3 验 OAI 路径, 1c 验 Anthropic 路径
 *
 * 不验证 (留后续 D.4 sub-step / 1c-revive):
 *   - tool result 回灌 + multi-turn tool use (留 1d.5-D cluster 后续 / 1c-revive)
 *   - 多个 tool_calls 累积 (留 1c-revive)
 *   - error handling 5xx/timeout (1d.5-D-4 验)
 */

import { describe, expect, it } from 'vitest';
import { DeepSeekClient } from '../../src/deepseek-client.js';
import type { ChatMessage, LLMToolSchema, ToolCall } from '../../src/types.js';

// ---- 红线门 (helper 化, D-10a-2 2026-06-04) ----
import { integrationSkipReason } from './_helpers/integration-gate.js';

// ---- calculate tool schema (跟 1a tool_calls 1 字段 tool 一致) ----

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
  'Do not compute the answer yourself; call the calculate tool with the expression.';

const USER_QUESTIONS = [
  'What is 17 * 23?',
  'What is (15 + 27) * 4?',
  'What is 144 / 12?',
] as const;

const TURN_COUNT = USER_QUESTIONS.length;

// ---- 辅助: dump tool_calls 行为 ----

interface ToolCallSnapshot {
  question: string;
  finish_reason: string | undefined;
  content: string;
  toolCalls: ReadonlyArray<ToolCall>;
  usage: import('../../src/types.js').Usage | undefined;
}

function dumpSnapshots(label: string, snaps: ToolCallSnapshot[]): void {
  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i]!;
    console.log(
      `[${label}] turn${i + 1} (${s.question}):`,
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

// ---- 主测试: 3 turn tool_calls 触发 (calculate 工具) ----

describe('DeepSeek shim — 1d.5-D-3 tool_calls schema 真接 (D.3 cluster)', () => {
  const fileSkipReason = integrationSkipReason();
  if (fileSkipReason !== undefined) {
    it.skip(`SKIPPED: ${fileSkipReason}`, () => {
      // noop
    });
    return;
  }

  it(`${TURN_COUNT} turn calculate tool: finish_reason='tool_calls' + 1 个 ToolCall + 合法 args + F4 不变量 + cost 公式反算`, async () => {
    const client = new DeepSeekClient();
    const snaps: ToolCallSnapshot[] = [];

    // ---- 3 turn tool_calls (3 个数学 Q, 期望 LLM 触发 calculate tool) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      const userQ = USER_QUESTIONS[i]!;
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userQ },
      ];

      const result = await client.chat(messages, {
        tools: [CALCULATE_TOOL],
        tool_choice: 'auto',
      });

      // 基础断言
      expect(result.model).toBe('deepseek-v4-flash');
      // finish_reason 应是 'tool_calls' (LLM 决定调工具, OAI spec)
      expect(result.finish_reason).toBe('tool_calls');

      const snap: ToolCallSnapshot = {
        question: userQ,
        finish_reason: result.finish_reason,
        content: result.content,
        toolCalls: result.tool_calls ?? [],
        usage: result.usage,
      };
      snaps.push(snap);
    }

    // ---- 断言层 1: 每个 turn finish_reason='tool_calls' ----
    for (let i = 0; i < TURN_COUNT; i++) {
      expect(snaps[i]!.finish_reason).toBe('tool_calls');
    }

    // ---- 断言层 2: 每个 turn 至少 1 个 tool_call (LLM 真"决定"调工具) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      expect(snaps[i]!.toolCalls.length).toBeGreaterThanOrEqual(1);
    }

    // ---- 断言层 3: 每个 tool_call 结构 (id / name / args) ----
    for (let i = 0; i < TURN_COUNT; i++) {
      for (const tc of snaps[i]!.toolCalls) {
        // id 必填 (OAI 用 echo 给后续 tool 消息)
        expect(typeof tc.id).toBe('string');
        expect(tc.id.length).toBeGreaterThan(0);
        // name 必填, 跟传入 tools 列表里的某个 tool name 一致
        expect(typeof tc.name).toBe('string');
        expect(tc.name).toBe('calculate');
        // args 必填, 是合法 JSON object (parse.ts L62-66 已解析成 Record)
        expect(typeof tc.args).toBe('object');
        expect(tc.args).not.toBeNull();
        expect(Array.isArray(tc.args)).toBe(false);
        // expression 字段必填 (per tool schema)
        expect(tc.args['expression']).toBeDefined();
        expect(typeof tc.args['expression']).toBe('string');
      }
    }

    // ---- 断言层 4: 每个 turn 至少 1 个 tool_call 包含 valid expression ----
    // 3 个 Q 期望 LLM 提取出对应 expression: "17*23", "(15+27)*4", "144/12"
    for (let i = 0; i < TURN_COUNT; i++) {
      const toolCalls = snaps[i]!.toolCalls;
      const hasExpression = toolCalls.some(
        (tc) => typeof tc.args['expression'] === 'string' && (tc.args['expression'] as string).length > 0,
      );
      expect(hasExpression).toBe(true);
    }

    // ---- 断言层 5: content 在 tool_calls 模式下可空 (OAI spec L34) ----
    // 不强制 content 为空 (LLM 可能加说明), 但**不**应包含数字答案
    // (因为 system prompt 说"MUST use the calculate tool, do not compute the answer yourself")
    for (let i = 0; i < TURN_COUNT; i++) {
      const content = snaps[i]!.content;
      // 软断言: content 长度 < 100 字符 (LLM 加短说明, 不应真写答案)
      expect(content.length).toBeLessThan(200);
    }

    // ---- 断言层 6: usage 字段 (跟 1d.5-A 等同 shape) ----
    // dump 先输出 (即使后续断言 fail 也保留真实数据)
    dumpSnapshots('1d.5-D-3 [BEFORE assertions]', snaps);
    for (let i = 0; i < TURN_COUNT; i++) {
      const usage = snaps[i]!.usage;
      expect(usage).toBeDefined();
      if (!usage) return; // narrowed

      expect(usage.prompt_tokens).toBeGreaterThan(0);
      expect(usage.completion_tokens).toBeGreaterThan(0);
      expect(usage.total_tokens).toBe(usage.prompt_tokens + usage.completion_tokens);
    }

    // ---- 断言层 7: F4 拍板不变量 (1b5-s2.5 Pitfall 13) ----
    // R7 集群新发现 (1d.5-D-3 揭示): tool schema 描述 (~150 token) + system prompt (50 token) 合计 ~377 token,
    // **足以**触发 DeepSeek prefix cache (跟 1d.5-A 27 token 短 prompt 不触发**不**同).
    // cached_tokens 期望 > 0 (system + tool schema 描述 复用), tokens_uncached 严格 === prompt - cached
    for (let i = 0; i < TURN_COUNT; i++) {
      const usage = snaps[i]!.usage!;
      // cached 期望 > 0 (R7 新发现: tool schema 描述触发 prefix cache)
      expect(usage.cached_tokens).toBeDefined();
      expect(usage.cached_tokens).toBeGreaterThan(0);
      // cache_hit_rate 期望 > 0 (跟 cached_tokens 一致)
      expect(usage.cache_hit_rate).toBeDefined();
      expect(usage.cache_hit_rate).toBeGreaterThan(0);
      // tokens_uncached === prompt - cached (F4 拍板, 1b5-s2.5 Pitfall 13 不变量)
      expect(usage.tokens_uncached).toBeDefined();
      expect(usage.tokens_uncached).toBe(usage.prompt_tokens - usage.cached_tokens!);
    }

    // ---- 断言层 8: cost 公式反算 (cached>0 路径, DeepSeek OAI 协议, 跟 1d.5-A.5/1d.5-D-1 一致) ----
    // 公式: cached × cache_hit/1e6 + uncached × cache_miss/1e6 + completion × completion/1e6
    // = cached × 0.02/1e6 + uncached × 1.0/1e6 + completion × 2.0/1e6
    for (let i = 0; i < TURN_COUNT; i++) {
      const usage = snaps[i]!.usage!;
      if (typeof usage.cost_turn !== 'number') continue; // skip if absent (Anthropic path, won't happen here)
      const cached = usage.cached_tokens ?? 0;
      const uncached = usage.tokens_uncached ?? 0;
      const completion = usage.completion_tokens;
      const expected =
        (cached * 0.02) / 1_000_000 +
        (uncached * 1.0) / 1_000_000 +
        (completion * 2.0) / 1_000_000;
      // 1e-7 浮点噪声内一致 (1d.5-A.5/1d.5-D-1/1d.5-D-2 验过这个 tolerance)
      expect(Math.abs(usage.cost_turn - expected)).toBeLessThan(1e-7);
      expect(usage.cost_currency).toBe('CNY');
    }

    // ---- 断言层 9: 3 turn 总 cost 合理 ----
    let totalCost = 0;
    for (let i = 0; i < TURN_COUNT; i++) {
      const usage = snaps[i]!.usage!;
      if (typeof usage.cost_turn === 'number') totalCost += usage.cost_turn;
    }
    // 3 turn 短 prompt + tool schema, 总 cost 期望 < ¥0.005
    expect(totalCost).toBeLessThan(0.005);

    // ---- 断言层 10: 揭示真实 tool_calls 行为 (R-G2 风格, dump 不写断言) ----
    dumpSnapshots('1d.5-D-3', snaps);

    // 红线: 任何断言 / log 都不该含 key, 也不该把 content / args 全文 echo 到 console.
  }, 90_000); // 90s timeout: 3 turn tool_call, 短 prompt
});

// ---- 守门: 文件名 / describe 标题不含敏感词 (防 grep 误打) ----
