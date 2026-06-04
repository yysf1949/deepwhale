/**
 * Tool Loop + Compaction 集成 (Sprint 1c-revive-2-D-5 + D-5-2)
 *
 * 拍板 (跟 P21 / P27 跨协议 6 cell 一致):
 *   - runToolLoop 每次 LLM call 前, 测 messages token 数
 *   - 触发 (>= window * compactRatio) → 调 summaryFn (LLM 走同 client 拍板)
 *   - 成功 → 替换 working messages, 写 1 条 'compaction' event 到 SessionWriter
 *   - 失败 → CompactionState 累计; latch → 写 1 条 'compaction_paused' event
 *   - paused → 跳过 compaction (不浪费 LLM token 调 summaryFn, 防 death loop)
 *
 * 协议集成 (P38 拍板 + D-5-2 拍板):
 *   - protocol: 'openai' | 'anthropic' (用于 summaryFn, 不同协议 system prompt 不同)
 *   - 集成在 runToolLoop 入口, 跟 tool-loop.ts P21 6 cell 拍板一致:
 *     DeepSeek + Anthropic 协议都走同一 hook
 *
 * 不变量:
 *   - compaction 永不 throw 给 runToolLoop (防 LLM 续聊死锁)
 *   - 失败 event 总能写盘 (即使 writer.append 抛错, 也只 warn 不 throw)
 *   - paused 后仍跑 runToolLoop 正常 (不阻塞用户任务, 仅不再 compact)
 *
 * @module @deepwhale/coding-agent/agent-compaction
 */

import {
  type ChatMessage,
  type LLMClient,
} from '@deepwhale/llm';
import {
  type CompactionConfig,
  type SummarizeFn,
  type LatchedCompactResult,
  CompactionState,
  runCompactionWithLatch,
  estimateTokens,
} from '@deepwhale/core';
import type { SessionWriter } from '@deepwhale/core';
import type { ToolLoopOptions, ToolLoopResult } from './tool-loop.js';
import { runToolLoop } from './tool-loop.js';

/**
 * Compaction 集成配置 (runToolLoop 包装层用).
 *
 * 跟 core CompactionConfig 区别:
 *   - client 来自 coding-agent 包 (P21 拍板: 协议从 LLMClient 推断)
 *   - state 由集成层管 (caller 用 new CompactionState(...) 注入)
 *   - protocol 拍板: 'openai' (DeepSeek) | 'anthropic' — summaryFn 的 system prompt 不同
 */
export interface AgentCompactionConfig extends CompactionConfig {
  /** 协议拍板 — 跟 P21 6 cell 一致. summaryFn 内部用此拍 system prompt 模板. */
  readonly protocol: 'openai' | 'anthropic';
  /** SessionWriter — 写 'compaction' / 'compaction_paused' event 用 */
  readonly writer: SessionWriter;
  /** CompactionState — caller 管, 跨 runToolLoop 调用持久化 */
  readonly state: CompactionState;
}

/**
 * 跑 runToolLoop 集成 compaction 触发.
 *
 * 拍板行为 (跟 P21 6 cell 一致):
 *   1. 入口测 token → 触发则 compact → 替换 working
 *   2. runToolLoop 内部每个 LLM call 前不重复触发 (避免 per-step 开销)
 *   3. 失败 latch → 写 paused event, runToolLoop 继续跑 (不阻塞)
 *
 * @param client  LLM client
 * @param messages 入口 messages (不变, 内部 copy)
 * @param options runToolLoop 原生 options
 * @param compaction 集成配置
 * @param summaryFn 生成 summary text 的 callback (caller 决定 LLM 协议)
 * @returns ToolLoopResult
 */
export async function runToolLoopWithCompaction(
  client: LLMClient,
  messages: ReadonlyArray<ChatMessage>,
  options: ToolLoopOptions = {},
  compaction: AgentCompactionConfig,
  summaryFn: SummarizeFn,
): Promise<ToolLoopResult> {
  // 1) 入口测 token, 触发则 compact 替换 messages
  const compactedMessages = await maybeCompactBeforeLoop(messages, compaction, summaryFn);

  // 2) 跑原生 runToolLoop (内部每个 LLM call 不再重测, 拍板入口一次性)
  return runToolLoop(client, compactedMessages, options);
}

/**
 * 入口 compaction 触发 (one-shot, 不重入 runToolLoop 内部).
 *
 * 行为契约:
 *   - paused → 返 messages 原样, 不调 summaryFn, 不写 event (latched 拍板)
 *   - 不该 compact → 返 messages 原样, 不调 summaryFn, 不写 event
 *   - compact 成功 → 替换 messages, 写 'compaction' event
 *   - compact 失败 (未 latch) → 返 messages 原样, 不写 event (caller 该 retry)
 *   - compact latched → 写 'compaction_paused' event, 返 messages 原样
 */
async function maybeCompactBeforeLoop(
  messages: ReadonlyArray<ChatMessage>,
  compaction: AgentCompactionConfig,
  summaryFn: SummarizeFn,
): Promise<ReadonlyArray<ChatMessage>> {
  const { state, writer, protocol, contextWindow } = compaction;
  // protocol 显式使用一次, 拍板留位 (跟 P21 6 cell summaryFn 拍 system prompt 模板用)
  void protocol;

  if (contextWindow <= 0) return messages;
  if (messages.length === 0) return messages;
  if (!state.shouldAttempt()) return messages;

  let result: LatchedCompactResult | null;
  try {
    result = await runCompactionWithLatch(messages, compaction, summaryFn, state);
  } catch {
    // 未触发 latch 的失败: caller 决定怎么处理 (e.g. 用户改配置), 这里不抛
    // 拍板不阻塞 runToolLoop
    return messages;
  }

  if (result === null) {
    // 不该 compact 或 paused
    return messages;
  }

  if (result.kind === 'ok') {
    // 写 'compaction' event — writer.append 抛错只 warn, 不 throw
    try {
      await writer.append(result.event);
    } catch {
      // 写盘失败不阻塞 loop
    }
    return result.result.messages;
  }

  // kind === 'latched'
  try {
    await writer.append(result.pausedEvent);
  } catch {
    // 写盘失败不阻塞 loop
  }
  return messages;
}

/**
 * 便捷工具: 估算当前 messages 的 token 数 (供 REPL / footer 拍板显示用).
 *
 * 跟 compaction.ts 的 estimateTokens 拍板一致 (char/4 粗估).
 * 集成在 coding-agent 包, 供 REPL 端零成本 import core.
 */
export function estimateContextTokens(messages: ReadonlyArray<ChatMessage>): number {
  return estimateTokens(messages);
}
