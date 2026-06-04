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
 *
 * Sprint 1c-revive-2-D-5+ reload 修复 (review P1, 2026-06-04):
 *   - JSONL 中的 'compaction' event 必须 **replay** 到 LLM context, 否则
 *     reload 后 messages 会从原始 user/assistant/tool events 重建, 旧
 *     compacted head 重新出现, 上下文不被压缩 (内存压缩成功但 reload
 *     失效 = P1).
 *   - replay 协议: 见到 'compaction' event 时, 把当前累积 messages 的
 *     `replaced_range[0..replaced_range[1])` 段 (按 JSONL 累积 index)
 *     替换为 1 条 system summary.
 *   - index 空间 (拍板 2026-06-04 review): compact() 入参 messages 来自
 *     caller 的 working 列表. REPL 路径下 working = loadSession() 返回
 *     的 JSONL 累积 (纯 user/assistant/tool) + REPL startup 拼的 system
 *     prompt. 拍板 compact() 只对 working[0..end] 操作, 不含外部 system
 *     prompt, 所以 replaced_range 索引的就是 "JSONL 累积 messages" 的
 *     index. reload 时 messages 仍按 JSONL 累积重建, replaced_range 同
 *     index 空间, 不偏移. (多个 'compaction' event 串行: 第 1 次 applied
 *     后累积 messages = 1 summary + N tail, 第 2 次 compact 入参就是
 *     reload 后的累积, index 重新从 0 计 — protocol 自洽.)
 *   - 'compaction_paused' event: 不入 messages. caller 决定是否 reset
 *     latch; UI/footer 可读 paused event 显式提示.
 */
export function sessionEventsToMessages(events: ReadonlyArray<SessionEvent>): ChatMessage[] {
  // Sprint 1c P2 修复: 过滤 dangling tool_call transcript. 延迟 push 模式
  // — assistant(tool_calls) 进入 buffer, tool events 配对删除 pending.
  // user/assistant 边界触发 flushBuffer 结算: pending 非空 → 整体 roll
  // back; pending 空 → push buffer.
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
    } else if (ev.kind === 'compaction') {
      // Sprint 1c-revive-2-D-5+ (review P1 修复, 2026-06-04): replay 到 messages.
      // 协议 (see header comment L88-L102 for index space):
      //   1. flushBuffer first, to flush any un-settled assistant(tool_calls)
      //      and prevent a dangling transcript (tool_call mid-way + compaction
      //      event = invalid half-transcript).
      //   2. replaced_range is the JSONL-accumulated index space, equal to
      //      the current out accumulation.
      //   3. Splice out[start..end) and insert 1 system summary at position
      //      start.
      // 容错 (safe-fail):
      //   - start > out.length: skip (replaced_range is the trailing-tail
      //     index, already covered by a prior compaction; this event
      //     shouldn't occur unless JSONL was hand-edited, we take the
      //     safe path).
      //   - end > out.length but start <= out.length: splice out the
      //     remaining tail and insert summary at position start (a new
      //     user event may have pushed the tail off the end).
      //   - start < 0 or end < start: skip (corrupt event).
      // 'compaction_paused' event: does NOT enter messages. The caller
      // decides whether to reset the latch; UI/footer reads paused event
      // explicitly for status display.
      flushBuffer();
      const [start, end] = ev.replaced_range;
      if (start < 0 || end < start) continue; // 损坏 event
      if (start > out.length) continue; // out 没积累到, 跳过 (见上)
      const removeCount = Math.min(end - start, out.length - start);
      out.splice(start, removeCount, {
        role: 'system',
        content: `[Session compaction summary]\n${ev.summary}`,
      });
    }
    // 'system' / 'compaction_paused' / 'verification' 跳过 — 三种都是 metadata, 不进 LLM context:
    //   - 'system' caller 决定要不要用
    //   - 'compaction_paused' UI/footer 显式读
    //   - 'verification' (Sprint 1c-revive-2-D-11-3, 2026-06-04) audit log / viewer 显式读
    //     reload session 时验证历史不污染 LLM 看到的 messages 列表
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

/**
 * 写一个 'verification' event 到 session (Sprint 1c-revive-2-D-11-3, 2026-06-04).
 *
 * 调用场景: `deepwhale --verify` 或 REPL `/verify` 跑完, 把 VerificationReport
 * 摘要写 1 条到 session JSONL. 跟 `appendUserEvent` / `appendCompactionEvent` 模式一致.
 *
 * 字段 (跟 core/src/session/jsonl.ts 'verification' union 一致):
 *   - status: 整体结果 passed / failed
 *   - durationMs: 整体耗时
 *   - command_count: 跑的 step 数
 *   - failed_count: 失败 step 数
 *   - summary: 人类可读 summary (来自 formatter.buildSummaryAndNext)
 *   - meta: 可选扩展 (e.g. log file path, git sha)
 *
 * 不变量 (跟其它 event 写入一致):
 *   - ts 默认 Date.now(), 单测可注入
 *   - 走 SessionWriter.append → fsync 串行化, 顺序保证
 *   - 'verification' 是 metadata, reload session 时 sessionEventsToMessages 跳过
 *     (跟 compaction_paused 同语义), 不污染 LLM 看到的 messages
 */
export async function appendVerificationEvent(
  writer: SessionWriter,
  args: {
    status: 'passed' | 'failed';
    durationMs: number;
    commandCount: number;
    failedCount: number;
    summary: string;
    meta?: Record<string, unknown>;
    ts?: number;
  },
): Promise<void> {
  await writer.append({
    kind: 'verification',
    ts: args.ts ?? Date.now(),
    status: args.status,
    durationMs: args.durationMs,
    command_count: args.commandCount,
    failed_count: args.failedCount,
    summary: args.summary,
    ...(args.meta !== undefined ? { meta: args.meta } : {}),
  });
}
