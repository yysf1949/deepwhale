/**
 * Session ↔ Tool Loop 适配器（Sprint 1a）
 *
 * 把 tool loop 的 ToolLoopStep 事件 → SessionEvent JSONL 持久化，
 * 同时支持从已有 JSONL 重建 messages 列表（让 LLM 看到"上次聊到哪"）。
 *
 * Sprint 1a 范围（极简）：
 *   - assistant step → 'assistant' event（保留 tool_calls）
 *   - tool step → 'tool' event（保留 tool_call_id + name + result）
 *   - 不持久化 user 消息（REPL 层自己 append 'user'）
 *   - 不持久化 limit/error 事件（runtime 状态，不进 LLM context）
 *   - 不做 compaction、加密、压缩、分片（v1.5+）
 *
 * 重建 messages 规则（让 LLM 续聊）：
 *   - 遍历 events，遇到 user/assistant/tool 都 push 成 ChatMessage
 *   - tool 消息需保留 tool_call_id
 *   - assistant 消息需保留 tool_calls
 *   - 系统提示由 caller 单独组装（repl.ts 拼），不存 JSONL
 *
 * @module @deepwhale/coding-agent/session-adapter
 */

import type { ChatMessage, ToolCall } from '@deepwhale/llm';
import type { SessionEvent, SessionWriter, SessionReader } from '@deepwhale/core';
import type { ToolLoopStep } from './tool-loop.js';

/**
 * 把 tool loop step 翻译成 SessionEvent。
 *
 * 只翻译能放进 LLM context 的 step:
 *   - 'assistant' → { kind: 'assistant', ts, content, tool_calls }
 *   - 'tool'      → { kind: 'tool', ts, tool_call_id, name, result }
 *
 * limit/error 是 runtime 状态，**不**持久化（避免重启时把它们当 LLM context 喂回）。
 */
export function toolLoopStepToSessionEvent(step: ToolLoopStep): SessionEvent | null {
  if (step.kind === 'assistant') {
    return {
      kind: 'assistant',
      ts: step.ts,
      content: step.message.content,
      ...(step.message.tool_calls ? { tool_calls: [...step.message.tool_calls] } : {}),
    };
  }
  if (step.kind === 'tool') {
    return {
      kind: 'tool',
      ts: step.ts,
      tool_call_id: step.tool_call.id,
      name: step.tool_call.name,
      result: {
        success: step.result.success,
        content: step.result.content,
        ...(step.result.success === false && step.result.error !== undefined
          ? { error: step.result.error }
          : {}),
      },
      duration_ms: step.duration_ms,
    };
  }
  // 'limit' / 'error' 不持久化
  return null;
}

/**
 * 把 SessionEvent 列表重建为 LLM 的 ChatMessage 列表（用于 LLM 续聊）。
 *
 * 跳过 'system' 事件（system prompt 由 caller 重新组装）。
 * 'user' → ChatMessage({ role: 'user' })
 * 'assistant' → ChatMessage({ role: 'assistant', content, tool_calls? })
 * 'tool'      → ChatMessage({ role: 'tool', content, tool_call_id, name })
 */
export function sessionEventsToMessages(events: ReadonlyArray<SessionEvent>): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const ev of events) {
    if (ev.kind === 'user') {
      out.push({ role: 'user', content: ev.content });
    } else if (ev.kind === 'assistant') {
      const msg: ChatMessage = { role: 'assistant', content: ev.content };
      if (ev.tool_calls) msg.tool_calls = [...ev.tool_calls] as ToolCall[];
      out.push(msg);
    } else if (ev.kind === 'tool') {
      out.push({
        role: 'tool',
        content: ev.result.content,
        tool_call_id: ev.tool_call_id,
        name: ev.name,
      });
    }
    // 'system' 跳过 — caller 决定要不要用
  }
  return out;
}

/**
 * 写一个 user event 到 session。
 * Sprint 1a 简化：user 消息也走 SessionWriter（统一审计）。
 */
export async function appendUserEvent(
  writer: SessionWriter,
  content: string,
  ts: number = Date.now(),
): Promise<void> {
  await writer.append({ kind: 'user', ts, content });
}

/**
 * 把 tool loop 跑完后产出的 steps 全部落盘（assistant + tool）。
 * limit/error 跳过（toSessionEvent 返回 null 时不 append）。
 */
export async function persistToolLoopSteps(
  writer: SessionWriter,
  steps: ReadonlyArray<ToolLoopStep>,
): Promise<void> {
  for (const step of steps) {
    const ev = toolLoopStepToSessionEvent(step);
    if (ev !== null) {
      await writer.append(ev);
    }
  }
}

/**
 * 加载已有 session 并重建 messages。
 *
 * Sprint 1a 简化：返回 (events, messages) 两份数据，caller 决定要不要 ignore events。
 */
export async function loadSession(
  reader: SessionReader,
): Promise<{ events: ReadonlyArray<SessionEvent>; messages: ChatMessage[] }> {
  const events = await reader.readAll();
  return { events, messages: sessionEventsToMessages(events) };
}
