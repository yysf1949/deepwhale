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
 * Sprint 1c P2 修复: 过滤 dangling tool_call transcript.
 *
 * 背景: 二次启动恢复时, JSONL 里可能存在 "assistant(tool_calls=[c2]) 但
 * tool(c2) 没落盘" 的孤立 assistant (crash 写完 assistant 还没写 tool result
 * 就被杀). 旧实现直接 push 这个 assistant → LLM continuation 看到无对应
 * tool result 的 tool_call, 形成非法 transcript, OpenAI API 拒收.
 *
 * 修复规则 (按 user 拍板 2026-06-04):
 *   1. assistant(tool_calls): 只有在下一个 user/assistant 前, 所有
 *      tool_call_id 都有对应 tool event, 才保留 (整个 assistant message)
 *   2. tool: 只有它的 tool_call_id 属于"当前未结算的 assistant tool_calls",
 *      才保留; 否则丢 (孤儿)
 *   3. 普通 assistant(content) / user 不受影响
 *   4. **不改写 JSONL events**, 只在重建 messages 时过滤 — 后续补 tool
 *      result 后完整 tool_call 组自然重新合法化 (Sprint 1c P2 spec)
 *
 * 实现: 延迟 push 模式 — assistant(tool_calls) 进入 buffer, tool events
 * 配对删除 pending. user/assistant 边界触发 buffer 结算: pending 非空
 * → 整体 roll back (不 push); pending 空 → push buffer.
 */
export function sessionEventsToMessages(events: ReadonlyArray<SessionEvent>): ChatMessage[] {
  const out: ChatMessage[] = [];
  let buffer: ChatMessage[] = [];
  let pendingToolCalls = new Set<string>();

  const flushBuffer = (): void => {
    if (pendingToolCalls.size > 0) {
      // 上一个 assistant(tool_calls) 未完成 (user/assistant 边界), 整个 roll back
      buffer = [];
    } else {
      out.push(...buffer);
      buffer = [];
    }
    pendingToolCalls = new Set();
  };

  for (const ev of events) {
    if (ev.kind === 'user') {
      flushBuffer();
      out.push({ role: 'user', content: ev.content });
    } else if (ev.kind === 'assistant') {
      flushBuffer();
      if (ev.tool_calls && ev.tool_calls.length > 0) {
        // 进入延迟 push 模式
        pendingToolCalls = new Set(ev.tool_calls.map((tc) => tc.id));
        const msg: ChatMessage = { role: 'assistant', content: ev.content };
        msg.tool_calls = [...ev.tool_calls] as ToolCall[];
        buffer.push(msg);
      } else {
        // 普通 assistant(content) 无 tool_calls, 立即 commit
        out.push({ role: 'assistant', content: ev.content });
      }
    } else if (ev.kind === 'tool') {
      if (pendingToolCalls.has(ev.tool_call_id)) {
        pendingToolCalls.delete(ev.tool_call_id);
        buffer.push({
          role: 'tool',
          content: ev.result.content,
          tool_call_id: ev.tool_call_id,
          name: ev.name,
        });
      }
      // 孤儿 tool (没匹配 assistant tool_call): 丢 — 不会出现无主 tool message
    }
    // 'system' 跳过 — caller 决定要不要用
  }
  // EOF: 调 flushBuffer 而非硬清空.
  // 修复: 旧实现 `buffer = []` 把"assistant(tool_calls) → tool 已配对完成但
  // final assistant 还没落盘" 的合法 transcript 也丢了 — 这种 crash 真实存在
  // (工具结果已 fsync, 进程在生成最终回答前被杀, LLM 续聊需要看到 tool result
  // 才能继续生成). 现在 EOF 走 flushBuffer, pending 空时正常 push buffer.
  flushBuffer();
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
 * 写一条 'compaction' event 到 session (Sprint 1c-revive-2-D-5-1 拍板).
 *
 * 用途: agent-compaction.ts 在 runCompactionWithLatch 返 kind='ok' 时调,
 * 把 summary 拍板落盘 (供 reload 重建 messages 时知道哪段被总结过).
 *
 * 拍板: SessionReader 读到 kind='compaction' 时**不**重放进 LLM context
 * (跟 sessionEventsToMessages L132 'system' 跳过 一致 — compaction event 是 metadata,
 *  不是 LLM 看到的对话轮次).
 */
export async function appendCompactionEvent(
  writer: SessionWriter,
  summary: string,
  replacedRange: readonly [number, number],
  meta?: Record<string, unknown>,
  ts: number = Date.now(),
): Promise<void> {
  await writer.append({
    kind: 'compaction',
    ts,
    summary,
    replaced_range: replacedRange,
    ...(meta !== undefined ? { meta } : {}),
  });
}

/**
 * 写一条 'compaction_paused' event 到 session (Sprint 1c-revive-2-D-5-2 拍板).
 *
 * 用途: agent-compaction.ts 在 CompactionState latch 触发时调,
 * 记录"自动暂停, 防 death loop" 拍板 (供 reload 时 caller 知道状态).
 *
 * 拍板: SessionReader 读到 kind='compaction_paused' 时**不**重放进 LLM context
 * (caller 该决定是否 reset CompactionState / 改 summaryFn / 改 config).
 */
export async function appendCompactionPausedEvent(
  writer: SessionWriter,
  consecutiveFailures: number,
  reason: string,
  lastError: string,
  meta?: Record<string, unknown>,
  ts: number = Date.now(),
): Promise<void> {
  await writer.append({
    kind: 'compaction_paused',
    ts,
    consecutive_failures: consecutiveFailures,
    reason,
    last_error: lastError,
    ...(meta !== undefined ? { meta } : {}),
  });
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
 * Sprint 1b: 内部自动调 reader.truncate() 把 partial last line 清掉。
 * 之前 caller 必须自己记得调, Sprint 1a 全部漏调 → partial line 累积,
 * 下次 append 拼坏 JSON。Sprint 1b 闭环在 adapter 里, 3 个 mode (repl/print/rpc) 自动受益。
 *
 * 行为契约:
 * - 加载完整 events + 重建 messages
 * - 若文件末尾有 partial line(崩溃恢复), 自动 truncate
 * - truncate 失败不抛(不阻塞 agent 启动, 跟 Sprint 1a 容错语义一致)
 *
 * Sprint 1a 简化:返回 (events, messages) 两份数据, caller 决定要不要 ignore events。
 */
export async function loadSession(
  reader: SessionReader,
): Promise<{ events: ReadonlyArray<SessionEvent>; messages: ChatMessage[] }> {
  const events = await reader.readAll();
  // Sprint 1b: 闭环 truncate, 防止 partial line 累积污染下次 append
  try {
    await reader.truncate();
  } catch {
    // truncate 失败不阻塞启动(可能是权限/磁盘满等, 但 events 已读到内存)
  }
  return { events, messages: sessionEventsToMessages(events) };
}
