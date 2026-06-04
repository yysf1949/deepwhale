/**
 * Sprint 1c-revive-2-C + 1c-revive-3 — 跨包 session module 集成 + 跨 Anthropic 协议路径真接
 * (1c-revive 拆分, pi-agent 4-layer, 2026-06-04)
 *
 * 目的: 1 个大 commit (按 user 拍板 2026-06-04), 跨包 session module 集成 mode layer 端
 * (1c-revive-2-C) + session module 端 (1c-revive-3). 跑端到端真接 session + 跨 Anthropic 协议.
 *
 * 跨包集成拍板:
 *   - packages/coding-agent/src/agent/session-adapter.ts (mode layer 端, 1c.0 era 拍板)
 *   - packages/core/src/session/jsonl.ts (session module 端, 0.2 era + 1c.6 修 truncate 漏洞)
 *   - 集成点: runToolLoop (mode layer) → SessionWriter (session module) → SessionReader
 *     → sessionEventsToMessages → runToolLoop (续聊) → SessionWriter → ...
 *
 * 跟 1c-revive-1 / 1c-revive-2-A / 1c-revive-2-B cluster 差异:
 *   - 1c-revive-1 (2d245a3): DeepSeek OAI 2 turn tool_use 端到端 (client-only)
 *   - 1c-revive-2-A (83f87d7): DeepSeek OAI runToolLoop 端到端 (mode layer + 6 tools + BashTool)
 *   - 1c-revive-2-B-1 (bddd5ff): AnthropicClient tools 1c.5 拍板 (1c.5 拍板 28 行 net production 改)
 *   - 1c-revive-2-B-2 (3fbced7): 5 mock fetch 单测验证 schema 转换
 *   - 1c-revive-2-B-3 (f3be6d4): runToolLoop 端到端 跨 Anthropic 协议路径真接 (mode layer only, 0 session)
 *   - **1c-revive-2-C+3 (本文)**: 跨包 session module 集成 + 跨 Anthropic 协议路径真接
 *     (mode layer 端 + session module 端, 1 大 commit, 0 行 production 改, 1c-revive 拆分完毕)
 *
 * 跟 1c-revive-2-B-3 关键差异:
 *   - 1c-revive-2-B-3 = mode layer 端到端, **0** session (走内存 messages 累积, 2 run 各自独立)
 *   - **1c-revive-2-C+3 = mode layer 端 + session module 端 集成, 4 turn 跨 session reload**
 *     (turn 1+2 走 runToolLoop → 持久化 → reload → turn 3+4 续 runToolLoop → 持久化)
 *
 * 关键不变量 (跨包集成, pi-agent 4-layer 拍板, 跟 1c-revive-2-B-3 一致):
 *   - runToolLoop (mode layer) → SessionWriter (session module) 跨包集成走通
 *   - SessionReader → sessionEventsToMessages → runToolLoop (续聊) 跨包集成走通
 *   - tool_call_id 跨 session reload 保持 (跨协议 echo path)
 *   - 4 turn 端到端 (turn 1+2 续 turn 3+4, 跨 session)
 *   - 0 行 production code 改 (session-adapter.ts + jsonl.ts 已完整, 1c.0 era + 1c.6 truncate fix)
 *   - **不**mock LLM, **不**mock BashTool, 真实 mode layer + session module 集成 path
 *   - BashTool 真执行, 走 execFile + echo builtin
 *   - F4 拍板 (1d.5-A.5 揭示): 跨 Anthropic 协议路径 cached>0 → cost_turn absent (跟 1c-revive-2-B cluster 一致)
 *   - cost 公式层 7 + 层 8 软断言 cost absent, 不反算 cost (跟 1c-revive-2-A cost present 路径分叉)
 *
 * 续聊新题 (按 user 拍板 2026-06-04): '继续算 (8+9)*7', 期望答案 119
 *
 * 触发条件 (跟 1c-revive-1 / 1c-revive-2-A / 1c-revive-2-B 一致):
 *   INTEGRATION=1 pnpm vitest run packages/coding-agent/test/integration/runToolLoop-session-2c3.test.ts
 *
 * 红线 (跟 1c-revive-1 / 1c-revive-2-A / 1d.5 等真接 test 一致):
 *   1. test 代码**不**直接读 ~/.deepwhale/.env 文件
 *   2. test 代码**不**接受 apiKey 选项
 *   3. test 任何断言 / log**不**含 key 字符串
 *   4. 1 turn 不出 1 turn (本 test = **4 turn 跨 session**, turn 1+2 + turn 3+4 reload 续)
 *   5. 不循环, 不再发 prompt 收集更多数据 (单次 4 turn 跨 session 流程)
 *   6. **不**mock LLM, **不**mock BashTool, **不**mock session module, 真实集成 path
 *   7. BashTool 允许 echo + node (跟 1c-revive-2-A / 1c-revive-2-B-3 一样)
 *   8. session 走临时 .jsonl 文件 (/tmp/session-2c3-<uuid>.jsonl, 测试完删除, 跟 1a 模式一致)
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
 * 1c-revive 拆分 cluster 总账 (1c-revive 2-A + 2-B + 2-C + 3, 6 commits 拍板, 1c-revive 拆分完毕):
 *   - ✅ 1c-revive-1 (2d245a3): DeepSeek OAI 2 turn tool_use 端到端 (client-only)
 *   - ✅ 1c-revive-2-A (83f87d7): DeepSeek OAI runToolLoop 端到端 (mode layer + 6 tools + BashTool)
 *   - ✅ 1c-revive-2-B-1 (bddd5ff): AnthropicClient tools 1c.5 拍板
 *   - ✅ 1c-revive-2-B-2 (3fbced7): 5 mock fetch 单测验证 schema 转换
 *   - ✅ 1c-revive-2-B-3 (f3be6d4): runToolLoop 端到端 跨 Anthropic 协议路径真接
 *   - 🔄 1c-revive-2-C+3 (本 test): 跨包 session module 集成 + 跨 Anthropic 协议路径真接
 *
 * 不验证 (留后续):
 *   - compaction 钩子 (Sprint 1+ 扩展, 留 v1.5+)
 *   - 加密 / 压缩 / 分片 (Sprint 1+ 扩展, 留 v1.5+)
 *   - Session DAG (v2.0, arch §3.5, 跟 Sprint 1a Linear 协议不混)
 *   - 错误 expression 处理 (e.g. BashTool sandbox 拒绝, 留 mode layer 后续)
 *   - maxSteps 触顶 (留 mode layer 后续)
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnthropicClient, type ChatMessage, type ToolCall } from '@deepwhale/llm';
import { runToolLoop, type ToolLoopStep } from '../../src/agent/tool-loop.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import {
  appendUserEvent,
  loadSession,
  persistToolLoopSteps,
} from '../../src/agent/session-adapter.js';
import { SessionReader, SessionWriter } from '@deepwhale/core';

// ---- 红线门: 跟 1c-revive-1 / 1c-revive-2-A / 1c-revive-2-B-3 等真接 test 一致 ----

const INTEGRATION_ENABLED = process.env['INTEGRATION'] === '1';
const HAS_ANTHROPIC_KEY =
  typeof process.env['ANTHROPIC_AUTH_TOKEN'] === 'string' &&
  process.env['ANTHROPIC_AUTH_TOKEN'] !== '';
const HAS_DEEPSEEK_KEY =
  typeof process.env['DEEPSEEK_API_KEY'] === 'string' &&
  process.env['DEEPSEEK_API_KEY'] !== '';

const canRun = INTEGRATION_ENABLED && (HAS_ANTHROPIC_KEY || HAS_DEEPSEEK_KEY);

const skipReason = !INTEGRATION_ENABLED
  ? 'INTEGRATION !== 1 (set INTEGRATION=1 to run; see README "integration tests")'
  : !HAS_ANTHROPIC_KEY && !HAS_DEEPSEEK_KEY
    ? 'process.env.ANTHROPIC_AUTH_TOKEN and DEEPSEEK_API_KEY both unset ' +
      '(source ~/.deepwhale/.env first; see README "integration tests")'
    : 'unknown reason';

// ---- test scenario: 跨包 session module 集成 + 跨 Anthropic 协议 ----

const SYSTEM_PROMPT =
  'You are a careful math assistant. You have access to a bash tool that can execute whitelisted ' +
  'shell commands (including `echo` and `node`). Use the bash tool to compute arithmetic expressions ' +
  'instead of computing them yourself. After receiving the tool result, give the user the final ' +
  'answer as a short sentence.';

const USER_QUESTIONS: ReadonlyArray<{
  question: string;
  expectedAnswer: string;
}> = [
  // turn 1+2: 第一题 (跨 session, 走 runToolLoop → SessionWriter → SessionReader → reload)
  { question: 'What is 17 * 23?', expectedAnswer: '391' },
  { question: 'What is (15 + 27) * 4?', expectedAnswer: '168' },
  // turn 3+4: 续聊 (跨 session reload, 走 SessionReader → messages 重建 → runToolLoop 续)
  { question: '继续算 (8+9)*7', expectedAnswer: '119' },
] as const;

const TURN_COUNT = USER_QUESTIONS.length;

// ---- 辅助: snapshot mode layer runToolLoop 行为 ----

interface TurnSnapshot {
  turnIndex: number;
  question: string;
  finishReason: string | undefined;
  content: string;
  toolCalls: ReadonlyArray<ToolCall>;
  toolResult: string | undefined;
  toolName: string | undefined;
  toolSuccess: boolean | undefined;
  usage: import('@deepwhale/llm').Usage | undefined;
  messageCount: number;
  stepCount: number;
}

function snapshotTurn(
  turnIndex: number,
  question: string,
  result: import('@deepwhale/llm').ChatResult,
  toolResult: { name?: string; success?: boolean; content?: string } | undefined,
  messageCount: number,
  stepCount: number,
): TurnSnapshot {
  return {
    turnIndex,
    question,
    finishReason: result.finish_reason,
    content: result.content,
    toolCalls: result.tool_calls ?? [],
    toolResult: toolResult?.content,
    toolName: toolResult?.name,
    toolSuccess: toolResult?.success,
    usage: result.usage,
    messageCount,
    stepCount,
  };
}

function dumpSnapshots(label: string, snaps: TurnSnapshot[]): void {
  for (const s of snaps) {
    console.log(
      `[${label}] turn${s.turnIndex + 1} (${s.question}, msgCount=${s.messageCount}, stepCount=${s.stepCount}):`,
      JSON.stringify({
        finish_reason: s.finishReason,
        content_len: s.content.length,
        tool_call_count: s.toolCalls.length,
        tool_call_names: s.toolCalls.map((tc) => tc.name),
        tool_result_name: s.toolName,
        tool_result_success: s.toolSuccess,
        tool_result_content: s.toolResult?.slice(0, 100),
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

function dumpSteps(
  label: string,
  steps: ReadonlyArray<ToolLoopStep>,
  finalResult: {
    final: { content: string; finish_reason: string | undefined; usage: unknown };
    messages: ReadonlyArray<ChatMessage>;
  },
): void {
  console.log(
    `[${label}] runToolLoop step sequence (${steps.length} steps, ${finalResult.messages.length} messages):`,
  );
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.kind === 'assistant') {
      const tcs = s.result.tool_calls ?? [];
      console.log(
        `  step${i} [assistant] turnIdx=${i} tool_calls=${tcs.length} names=${tcs.map((tc) => `${tc.name}(${JSON.stringify(tc.args).slice(0, 80)})`).join(',')} content_len=${s.result.content.length} finish=${s.result.finish_reason}`,
      );
    } else if (s.kind === 'tool') {
      // ToolResult 是 discriminated union: success: false 时才有 error. 软断言.
      const errStr = s.result.success === false && s.result.error !== undefined
        ? ` error="${s.result.error.slice(0, 80)}"`
        : '';
      console.log(
        `  step${i} [tool] name=${s.tool_call.name} args=${JSON.stringify(s.tool_call.args).slice(0, 80)} success=${s.result.success} content="${s.result.content.slice(0, 100)}" duration_ms=${s.duration_ms}${errStr}`,
      );
    } else if (s.kind === 'limit') {
      console.log(`  step${i} [limit] steps=${s.steps}`);
    } else if (s.kind === 'error') {
      console.log(`  step${i} [error] error=${s.error.message.slice(0, 100)}`);
    }
  }
  console.log(
    `  [final] content_len=${finalResult.final.content.length} content="${finalResult.final.content.slice(0, 200)}" finish=${finalResult.final.finish_reason}`,
  );
  for (let i = 0; i < finalResult.messages.length; i++) {
    const m = finalResult.messages[i]!;
    if (m.role === 'tool') {
      console.log(
        `  msg${i} [tool] name=${m.name ?? '?'} tool_call_id=${m.tool_call_id?.slice(0, 20) ?? '?'} content="${(m.content ?? '').slice(0, 100)}"`,
      );
    } else if (m.role === 'assistant' && m.tool_calls) {
      console.log(
        `  msg${i} [assistant+tool_calls] tool_call_count=${m.tool_calls.length} names=${m.tool_calls.map((tc) => tc.name).join(',')}`,
      );
    } else {
      console.log(
        `  msg${i} [${m.role}] content_len=${(m.content ?? '').length} content="${(m.content ?? '').slice(0, 80)}"`,
      );
    }
  }
}

// ---- 主测试: 跨包 session module 集成 + 跨 Anthropic 协议 ----

describe('coding-agent mode layer — 1c-revive-2-C+3 跨包 session module 集成 + 跨 Anthropic 协议 (1c-revive 拆分完毕, 1 commit)', () => {
  if (!canRun) {
    it.skip(`SKIPPED: ${skipReason}`, () => {
      // noop
    });
    return;
  }

  it(`${TURN_COUNT} × runToolLoop 跨 session reload: turn 1+2 走 SessionWriter → reload → turn 3 续 SessionReader → SessionWriter`, async () => {
    // 1c-revive-2-C+3 拍板 (user 2026-06-04): 1 大 commit 跨包 session module 集成 + 跨 Anthropic 协议.
    // AnthropicClient 跟 DeepSeekClient 同 LLMClient 契约 (1c.5 拍板, 1c-revive-2-B-1)
    // → runToolLoop 跨 Anthropic 协议 干净 separation 走通 (1c-revive-2-B-3)
    // → session-adapter.ts (mode layer 端) 跟 jsonl.ts (session module 端) 跨包集成 (本文)
    const client = new AnthropicClient();
    const registry = createDefaultRegistry();

    // 临时 .jsonl session 路径 (Sprint 1a 模式, 测试完删除)
    const sessionPath = join(tmpdir(), `session-2c3-${randomUUID()}.jsonl`);

    const snaps: TurnSnapshot[] = [];
    const allRuns: {
      question: string;
      result: Awaited<ReturnType<typeof runToolLoop>>;
      mode: 'first-run' | 'session-reload';
    }[] = [];

    try {
      // ---- turn 1+2: 第一题, 走 runToolLoop → SessionWriter 持久化 ----
      const firstWriter = new SessionWriter(sessionPath);
      await firstWriter.open();

      for (let i = 0; i < 2; i++) {
        const { question, expectedAnswer } = USER_QUESTIONS[i]!;
        // turn 1: messages 从空开始
        // turn 2: messages 累积 (turn 1 的 assistant + tool + final)
        const baseMessages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
        if (i === 0) {
          baseMessages.push({ role: 'user', content: question });
        } else {
          // turn 2: 累积 turn 1 的 messages (内存累积模式, 跟 1c-revive-2-B-3 一致)
          // 走完 turn 1 后, allRuns[0].result.messages 累积
          const prevMessages = allRuns[0]!.result.messages;
          for (const m of prevMessages) {
            if (m.role !== 'system') baseMessages.push(m);
          }
          baseMessages.push({ role: 'user', content: question });
        }

        // appendUserEvent 写 user event (跟 1a 模式一致, 统一审计)
        await appendUserEvent(firstWriter, question);

        // ---- runToolLoop mode layer 端到端 ----
        const result = await runToolLoop(client, baseMessages, {
          registry,
          maxSteps: 5,
        });

        // ---- 持久化 steps (assistant + tool events) ----
        await persistToolLoopSteps(firstWriter, result.steps);
        allRuns.push({ question, result, mode: 'first-run' });

        // ---- 流程 1: 跑 mode layer 端到端 ----
        expect(result.messages.length).toBeGreaterThan(2);
        expect(result.steps.length).toBeGreaterThanOrEqual(2);

        // ---- 流程 2: 验 BashTool 真执行 (success=true) ----
        const assistantSteps = result.steps.filter((s) => s.kind === 'assistant');
        const toolSteps = result.steps.filter((s) => s.kind === 'tool');
        const successCount = toolSteps.filter((s) => s.result.success).length;
        expect(successCount).toBeGreaterThanOrEqual(1);

        // ---- 流程 3: 验 runToolLoop 累积 messages 完整 ----
        expect(result.messages.length).toBeGreaterThanOrEqual(5);

        // 找到 tool_call assistant message
        const toolCallAssistantMsgs = result.messages.filter(
          (m) => m.role === 'assistant' && m.tool_calls !== undefined && m.tool_calls.length > 0,
        );
        expect(toolCallAssistantMsgs.length).toBeGreaterThanOrEqual(1);
        const toolCallAssistantMsg = toolCallAssistantMsgs[toolCallAssistantMsgs.length - 1]!;

        // 找到 tool messages
        const toolMsgs = result.messages.filter(
          (m) => m.role === 'tool' && m.tool_call_id !== undefined,
        );
        expect(toolMsgs.length).toBeGreaterThanOrEqual(1);
        const tc0 = toolCallAssistantMsg.tool_calls![0]!;
        // 跨协议 echo: assistant tool_calls[0].id (OAI) === tool tool_call_id (跨 Anthropic routing)
        const matchingToolMsg = toolMsgs.find((m) => m.tool_call_id === tc0.id);
        expect(matchingToolMsg).toBeDefined();

        // 验 final assistant message 不带 tool_calls
        const finalAssistantMsg = result.messages[result.messages.length - 1]!;
        expect(finalAssistantMsg.role).toBe('assistant');
        expect(finalAssistantMsg.tool_calls).toBeUndefined();
        expect(finalAssistantMsg.content).toContain(expectedAnswer);

        // ---- 流程 4: 验 LLM 给最终答案 ----
        expect(result.final.finish_reason).toBe('stop');
        expect(result.final.content).toContain(expectedAnswer);

        // ---- 流程 5: 验 F4 拍板不变量跨 mode layer 全验证 ----
        expect(result.final.usage).toBeDefined();

        // ---- 收集 turn snapshot ----
        // 跟 1c-revive-2-A 镜: 取**最后**一个 tool step (LLM 收敛后)
        const lastToolStep = toolSteps[toolSteps.length - 1]?.result;
        const toolResultInfo = lastToolStep ?? toolSteps[0]?.result;
        snaps.push(
          snapshotTurn(
            i * 2,
            question,
            assistantSteps[0]?.result ?? result.final,
            toolResultInfo
              ? {
                  name: toolSteps[toolSteps.length - 1]?.tool_call.name,
                  success: toolResultInfo.success,
                  content: toolResultInfo.content,
                }
              : undefined,
            2,
            assistantSteps.length + toolSteps.length,
          ),
        );
        snaps.push(
          snapshotTurn(
            i * 2 + 1,
            question,
            result.final,
            undefined,
            result.messages.length,
            result.steps.length,
          ),
        );
      }

      // close first writer (turn 1+2 持久化完毕)
      await firstWriter.close();

      // ---- turn 3 续聊: 跨 session reload 走 SessionReader ----
      // (1c-revive-3 核心: session module 端 集成, 跨 session 续聊)
      // 用 loadSession() 代替手动 readAll + truncate: 1c P2 修复 dangling tool_call,
      // 1b truncate 闭环, 1c.6 truncate atomic rename — loadSession() 全部包含
      const { messages: reloadedMessages, events: reloadedEvents } = await loadSession(
        new SessionReader(sessionPath),
      );

      // 1c-revive-3 跨包集成验证 1: events 持久化完整
      expect(reloadedEvents.length).toBeGreaterThan(0);
      // 期望至少: 2 user events + 2 assistant(tool_calls) + 2 tool + 2 final assistant = 8 events
      // (跟 1c-revive-2-B-3 4 turn 模式一致, 实际可能更多, 软断言 >= 8)
      expect(reloadedEvents.length).toBeGreaterThanOrEqual(8);

      // 1c-revive-3 跨包集成验证 2: messages 重建完整
      expect(reloadedMessages.length).toBeGreaterThan(0);
      // loadSession() returns only JSONL-backed messages; caller prepends system separately below.
      // 期望: 2 user + 2 assistant(tool_calls) + 2 tool + 2 final assistant = 8 messages
      // (跟 session-adapter.ts 协议一致: system prompt 不进 JSONL)
      expect(reloadedMessages.length).toBeGreaterThanOrEqual(8);

      // 1c-revive-3 跨包集成验证 3: 跨 session tool_call_id 保持
      const allToolCallIds = reloadedMessages
        .filter((m) => m.role === 'assistant' && m.tool_calls)
        .flatMap((m) => m.tool_calls!.map((tc) => tc.id));
      const allToolMsgIds = reloadedMessages
        .filter((m) => m.role === 'tool' && m.tool_call_id)
        .map((m) => m.tool_call_id!);
      // 至少 1 个 tool_call_id 跨 session 保持
      expect(allToolCallIds.length).toBeGreaterThan(0);
      expect(allToolMsgIds.length).toBeGreaterThan(0);
      // 至少 1 个 assistant tool_call_id 跟 1 个 tool tool_call_id 匹配 (跨 session)
      const matchedIds = allToolCallIds.filter((id) => allToolMsgIds.includes(id));
      expect(matchedIds.length).toBeGreaterThan(0);

      // 1c-revive-3 跨包集成验证 4: 重建 messages 跑续 runToolLoop
      // turn 3: 用 reload 后的 messages + 新 user event
      const thirdWriter = new SessionWriter(sessionPath);
      await thirdWriter.open();

      const { question: question3, expectedAnswer: expectedAnswer3 } = USER_QUESTIONS[2]!;

      // appendUserEvent 写 turn 3 user event (append 模式, file 已存在)
      await appendUserEvent(thirdWriter, question3);

      // 重建 messages 走续 runToolLoop (跨 session reload)
      const reloadedMessagesWithSystem: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...reloadedMessages,
        { role: 'user', content: question3 },
      ];
      const result3 = await runToolLoop(client, reloadedMessagesWithSystem, {
        registry,
        maxSteps: 5,
      });
      allRuns.push({ question: question3, result: result3, mode: 'session-reload' });

      // 持久化 turn 3 steps
      await persistToolLoopSteps(thirdWriter, result3.steps);

      // ---- 流程 1 (turn 3): 跑 mode layer 跨 session 端到端 ----
      expect(result3.messages.length).toBeGreaterThan(reloadedMessages.length);
      expect(result3.steps.length).toBeGreaterThanOrEqual(2);

      // ---- 流程 2 (turn 3): 验 BashTool 真执行 ----
      const toolSteps3 = result3.steps.filter((s) => s.kind === 'tool');
      const successCount3 = toolSteps3.filter((s) => s.result.success).length;
      expect(successCount3).toBeGreaterThanOrEqual(1);

      // ---- 流程 3 (turn 3): 验 final answer ----
      const finalAssistantMsg3 = result3.messages[result3.messages.length - 1]!;
      expect(finalAssistantMsg3.role).toBe('assistant');
      expect(finalAssistantMsg3.tool_calls).toBeUndefined();
      expect(finalAssistantMsg3.content).toContain(expectedAnswer3);

      expect(result3.final.finish_reason).toBe('stop');
      expect(result3.final.content).toContain(expectedAnswer3);

      // ---- 收集 turn 3 snapshot ----
      const assistantSteps3 = result3.steps.filter((s) => s.kind === 'assistant');
      const lastToolStep3 = toolSteps3[toolSteps3.length - 1]?.result;
      const toolResultInfo3 = lastToolStep3 ?? toolSteps3[0]?.result;
      snaps.push(
        snapshotTurn(
          4,
          question3,
          assistantSteps3[0]?.result ?? result3.final,
          toolResultInfo3
            ? {
                name: toolSteps3[toolSteps3.length - 1]?.tool_call.name,
                success: toolResultInfo3.success,
                content: toolResultInfo3.content,
              }
            : undefined,
          reloadedMessages.length + 2,
          assistantSteps3.length + toolSteps3.length,
        ),
      );
      snaps.push(
        snapshotTurn(
          5,
          question3,
          result3.final,
          undefined,
          result3.messages.length,
          result3.steps.length,
        ),
      );

      await thirdWriter.close();

      // ---- 断言层 1: TURN_COUNT × 2 = 6 turn 全部完成 (turn 1+2 + turn 3+4) ----
      // 注意: USER_QUESTIONS 只有 3 个, 但每个 question 拆 tool_call turn + final turn = 6 turn snapshots
      expect(snaps.length).toBe(TURN_COUNT * 2);

      // 提前 dump 真实数据
      dumpSnapshots('1c-revive-2-C+3 [BEFORE assertions]', snaps);
      for (let i = 0; i < allRuns.length; i++) {
        const label = `1c-revive-2-C+3 [BEFORE assertions run ${i + 1} (${allRuns[i]!.mode})]`;
        dumpSteps(label, allRuns[i]!.result.steps, {
          final: {
            content: allRuns[i]!.result.final.content,
            finish_reason: allRuns[i]!.result.final.finish_reason,
            usage: allRuns[i]!.result.final.usage,
          },
          messages: allRuns[i]!.result.messages,
        });
      }

      // ---- 断言层 2: 偶数 turn (tool_call 触发) finish_reason='tool_calls' ----
      for (let i = 0; i < TURN_COUNT; i++) {
        const toolCallTurn = snaps[i * 2]!;
        expect(toolCallTurn.finishReason).toBe('tool_calls');
        expect(toolCallTurn.toolCalls.length).toBeGreaterThanOrEqual(1);
      }

      // ---- 断言层 3: 奇数 turn (final answer) finish_reason='stop', content 包含答案 ----
      for (let i = 0; i < TURN_COUNT; i++) {
        const finalTurn = snaps[i * 2 + 1]!;
        const expectedAnswer = USER_QUESTIONS[i]!.expectedAnswer;
        expect(finalTurn.finishReason).toBe('stop');
        expect(finalTurn.content).toContain(expectedAnswer);
      }

      // ---- 断言层 4: 跨 6 turn toolCalls + tool 累积 不变量 ----
      for (let i = 0; i < TURN_COUNT; i++) {
        const toolCallTurn = snaps[i * 2]!;
        expect(toolCallTurn.toolCalls.length).toBeGreaterThanOrEqual(1);
        const toolNames = toolCallTurn.toolCalls.map((tc) => tc.name);
        expect(toolNames.length).toBeGreaterThan(0);

        const finalTurn = snaps[i * 2 + 1]!;
        expect(finalTurn.toolCalls.length).toBe(0);
      }

      // ---- 断言层 5: BashTool 真执行 (toolResult.success) ----
      for (let i = 0; i < TURN_COUNT; i++) {
        const toolCallTurn = snaps[i * 2]!;
        expect(toolCallTurn.toolResult).toBeDefined();
        expect(toolCallTurn.toolResult!.length).toBeGreaterThan(0);
      }

      // ---- 断言层 6: F4 拍板不变量跨 6 turn 全验证 (cached 路径) ----
      // tokens_uncached === prompt - cached (F4 拍板, 跨 cached 路径) 是**硬**不变量
      for (let i = 0; i < TURN_COUNT; i++) {
        const toolCallTurn = snaps[i * 2]!.usage!;
        const finalTurn = snaps[i * 2 + 1]!.usage!;

        // 偶数 turn (tool_call): cached **可** = 0, tokens_uncached === prompt - cached 仍**硬**不变量
        expect(toolCallTurn.tokens_uncached).toBeDefined();
        expect(toolCallTurn.tokens_uncached).toBe(
          toolCallTurn.prompt_tokens - (toolCallTurn.cached_tokens ?? 0),
        );
        if (toolCallTurn.cached_tokens !== undefined && toolCallTurn.cached_tokens > 0) {
          expect(toolCallTurn.cache_hit_rate).toBeGreaterThan(0);
        }

        // 奇数 turn (final, messages 累积): cached 期望 > 0
        expect(finalTurn.cached_tokens).toBeDefined();
        expect(finalTurn.cached_tokens).toBeGreaterThan(0);
        expect(finalTurn.cache_hit_rate).toBeDefined();
        expect(finalTurn.cache_hit_rate).toBeGreaterThan(0);
        expect(finalTurn.tokens_uncached).toBeDefined();
        expect(finalTurn.tokens_uncached).toBe(finalTurn.prompt_tokens - finalTurn.cached_tokens!);
      }

      // ---- 断言层 7: F4 absent 跨 Anthropic 协议路径 (1c-revive-2-C+3 关键贡献) ----
      // F4 拍板 (1d.5-A.5 揭示): 跨 Anthropic 协议 cached > 0 → cost_turn / cost_currency absent
      // 1c-revive-2-C+3 验证这个 absent 跨 6 turn 都生效 (跟 1c-revive-2-A DeepSeek OAI cost present
      // 形成对照, 揭示 Architecture 协议分叉)
      // 跟 1c-revive-2-B-3 成本层 7 关键差异: 6 turn 验证 (4 turn × 1.5)
      for (let i = 0; i < TURN_COUNT; i++) {
        const toolCallTurn = snaps[i * 2]!.usage!;
        const finalTurn = snaps[i * 2 + 1]!.usage!;

        for (const usage of [toolCallTurn, finalTurn]) {
          // 跨 Anthropic 协议 (1c-revive-2-B-1 拍板): cached > 0 → cost 字段 absent
          if ((usage.cached_tokens ?? 0) > 0) {
            expect(usage.cost_turn).toBeUndefined();
            expect(usage.cost_currency).toBeUndefined();
          }
        }
      }

      // ---- 断言层 8: 总 cost 软断言 (跨 Anthropic 协议, cost absent) ----
      // 跟 1c-revive-2-A 关键差异: 跨 Anthropic 协议 cost absent, 不反算 cost.
      // 软断言: cached 字段都 >= 0 (6 turn 都验过, 跨 cached 路径)
      let totalCached = 0;
      for (const snap of snaps) {
        if (typeof snap.usage?.cached_tokens === 'number') totalCached += snap.usage.cached_tokens;
      }
      // 6 turn totalCached 期望 > 0 (累积 messages 触发 prefix cache)
      expect(totalCached).toBeGreaterThan(0);

      // ---- 断言层 9: 跨包 session module 集成 验证 (1c-revive-2-C+3 关键贡献) ----
      // 1. session 文件**实际**存在并可读 (走 fs 真接)
      const sessionStat = await fs.stat(sessionPath);
      expect(sessionStat.size).toBeGreaterThan(0);

      // 2. session 文件**实际**包含 3 个 user events (turn 1+2+3)
      // 用 loadSession() 走完整路径 (readAll + truncate, 跟持久化端一致)
      const { events: verifyEvents } = await loadSession(new SessionReader(sessionPath));
      const userEvents = verifyEvents.filter((e) => e.kind === 'user');
      expect(userEvents.length).toBe(3); // turn 1 + turn 2 + turn 3 (in-memory turn 2 也走 SessionWriter)
      // 注: turn 2 走 in-memory 累积 + appendUserEvent, 实际也可能写到 .jsonl
      // 软断言: >= 2 (turn 1 + turn 2 必写, turn 3 必写, 至少 3)

      // 3. session 文件**实际**包含 turn 3 续聊的 assistant + tool events
      const assistantEvents = verifyEvents.filter((e) => e.kind === 'assistant');
      const toolEvents = verifyEvents.filter((e) => e.kind === 'tool');
      // 期望: 至少 4 assistant events (turn 1+2 各 tool_call + final + turn 3 续 + final = 6)
      expect(assistantEvents.length).toBeGreaterThanOrEqual(4);
      // 期望: 至少 2 tool events (turn 1+2 各 1 工具)
      expect(toolEvents.length).toBeGreaterThanOrEqual(2);

      // ---- 断言层 10: 揭示真实跨包集成行为 (R-G2 风格) ----
      // 重点观测:
      //   - session 文件大小 (持久化字节数)
      //   - events 计数 (user/assistant/tool 各几条)
      //   - 跨 session tool_call_id 保持 (跨 reload 不变)
      //   - **cost absent 跨 6 turn** (1c-revive-2-C+3 关键贡献, 跟 1c-revive-2-A cost present 对照)

      // 红线: 任何断言 / log 都不该含 key, 也不该把 content / args 全文 echo 到 console.
    } finally {
      // 测试完删除临时 .jsonl (Sprint 1a 模式, 不污染 /tmp)
      try {
        await fs.unlink(sessionPath);
      } catch {
        // 文件可能已被删除或不存在, 忽略
      }
    }
  }, 300_000); // 300s timeout: 6 turn 跨 session + 跨 Anthropic 协议 + 真接 (turn 1+2 + reload + turn 3 续 + 2 sub-turn)
});
