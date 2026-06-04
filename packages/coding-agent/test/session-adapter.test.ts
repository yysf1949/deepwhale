import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionReader, SessionWriter, type SessionEvent } from '@deepwhale/core';
import {
  toolLoopStepToSessionEvent,
  sessionEventsToMessages,
  appendUserEvent,
  persistToolLoopSteps,
  loadSession,
} from '../src/agent/session-adapter.js';
import type { ToolLoopStep } from '../src/agent/tool-loop.js';

describe('session-adapter', () => {
  describe('toolLoopStepToSessionEvent', () => {
    it('converts assistant step to assistant event with tool_calls', () => {
      const step: ToolLoopStep = {
        kind: 'assistant',
        ts: 1000,
        message: {
          role: 'assistant',
          content: 'calling echo',
          tool_calls: [{ id: 'c1', name: 'echo', args: { text: 'hi' } }],
        },
        result: {
          model: 'm' as never,
          content: 'calling echo',
          tool_calls: [{ id: 'c1', name: 'echo', args: { text: 'hi' } }],
          finish_reason: 'tool_calls',
        },
      };
      const ev = toolLoopStepToSessionEvent(step);
      expect(ev).toMatchObject({
        kind: 'assistant',
        ts: 1000,
        content: 'calling echo',
        tool_calls: [{ id: 'c1', name: 'echo', args: { text: 'hi' } }],
      });
    });

    it('converts successful tool step to tool event without error', () => {
      const step: ToolLoopStep = {
        kind: 'tool',
        ts: 2000,
        tool_call: { id: 'c1', name: 'echo', args: { text: 'hi' } },
        result: { success: true, content: 'hi-output', meta: { duration_ms: 5 } },
        duration_ms: 5,
      };
      const ev = toolLoopStepToSessionEvent(step);
      expect(ev).toMatchObject({
        kind: 'tool',
        ts: 2000,
        tool_call_id: 'c1',
        name: 'echo',
        result: { success: true, content: 'hi-output' },
        duration_ms: 5,
      });
      // error field should not be present (exactOptionalPropertyTypes)
      if (ev?.kind === 'tool') {
        expect('error' in ev.result).toBe(false);
      }
    });

    it('converts failed tool step to tool event WITH error', () => {
      const step: ToolLoopStep = {
        kind: 'tool',
        ts: 3000,
        tool_call: { id: 'c2', name: 'bad', args: {} },
        result: { success: false, content: '', error: 'oops' },
        duration_ms: 1,
      };
      const ev = toolLoopStepToSessionEvent(step);
      if (ev?.kind !== 'tool') throw new Error('expected tool event');
      expect(ev.result).toMatchObject({ success: false, content: '', error: 'oops' });
    });

    it('returns null for limit/error steps (runtime state, not persisted)', () => {
      const limitStep: ToolLoopStep = {
        kind: 'limit',
        ts: 0,
        steps: 5,
        lastResult: { model: 'm' as never, content: '' },
      };
      const errorStep: ToolLoopStep = {
        kind: 'error',
        ts: 0,
        error: new Error('x'),
      };
      expect(toolLoopStepToSessionEvent(limitStep)).toBeNull();
      expect(toolLoopStepToSessionEvent(errorStep)).toBeNull();
    });
  });

  describe('sessionEventsToMessages', () => {
    it('reconstructs ChatMessage list for LLM continuation', () => {
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'hi' },
        {
          kind: 'assistant',
          ts: 2,
          content: 'calling echo',
          tool_calls: [{ id: 'c1', name: 'echo', args: { text: 'hi' } }],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'echo',
          result: { success: true, content: 'hi-output' },
          duration_ms: 5,
        },
        { kind: 'assistant', ts: 4, content: 'got it' },
      ];
      const messages = sessionEventsToMessages(events);
      expect(messages).toEqual([
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: 'calling echo',
          tool_calls: [{ id: 'c1', name: 'echo', args: { text: 'hi' } }],
        },
        { role: 'tool', content: 'hi-output', tool_call_id: 'c1', name: 'echo' },
        { role: 'assistant', content: 'got it' },
      ]);
    });

    it('skips system events (caller controls system prompt separately)', () => {
      const events: SessionEvent[] = [
        { kind: 'system', ts: 0, content: 'you are a whale' },
        { kind: 'user', ts: 1, content: 'hi' },
      ];
      const messages = sessionEventsToMessages(events);
      expect(messages).toEqual([{ role: 'user', content: 'hi' }]);
    });
  });

  describe('Sprint 1c P2: dangling tool_call 过滤 (恢复正确性)', () => {
    // Sprint 1c P2 修复 (commit ref): 二次启动恢复时, JSONL 可能含 dangling
    // assistant(tool_calls) (crash 时还没写 tool result). 旧实现直接 push →
    // LLM continuation 看到无对应 tool result 的 tool_call, 非法 transcript.
    //
    // 修复规则 (commit ref 同步):
    //   1. assistant(tool_calls) 必须在下一个 user/assistant 前所有 tool_call_id
    //      都有对应 tool event, 才保留 (整个 assistant message)
    //   2. tool 的 tool_call_id 找不到对应 assistant tool_calls → 丢 (孤儿)
    //   3. 普通 assistant(content) / user 不受影响
    //   4. 不改写 JSONL events, 只在重建 messages 时过滤

    it('completed assistant → tool → assistant: 全部保留', () => {
      // 正常 1 turn: 已有测试 (reconstructs ChatMessage list) 覆盖.
      // 这里用 P2 视角再补一个, 确认无回归.
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'list' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'bash',
          result: { success: true, content: 'a.ts' },
          duration_ms: 1,
        },
        { kind: 'assistant', ts: 4, content: 'I see a.ts' },
      ];
      const messages = sessionEventsToMessages(events);
      expect(messages).toHaveLength(4);
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c1', name: 'bash' }],
      });
      expect(messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
      expect(messages[3]).toMatchObject({ role: 'assistant', content: 'I see a.ts' });
    });

    it('dangling assistant(tool_calls): 整体 roll back (含 content)', () => {
      // 模拟: turn1 完整, turn2 partial (assist2(c2) 无 tool)
      // 期望: turn1 4 完整 + turn2 user = 5, 不含 dangling assist2(c2)
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'list' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'bash',
          result: { success: true, content: 'a.ts' },
          duration_ms: 1,
        },
        { kind: 'assistant', ts: 4, content: 'I see a.ts' },
        { kind: 'user', ts: 5, content: 'now read a.ts' },
        {
          kind: 'assistant',
          ts: 6,
          content: '',
          tool_calls: [{ id: 'c2', name: 'read_file', args: { path: 'a.ts' } }],
        },
        // 缺 tool(c2) — 模拟 crash
      ];
      const messages = sessionEventsToMessages(events);
      expect(messages).toHaveLength(5);
      // 最后一条是 user2, 不是 dangling assist2
      expect(messages[4]).toMatchObject({ role: 'user', content: 'now read a.ts' });
      // 关键: transcript 不含 tool_call_id='c2' (无 assistant tool_calls 引用 c2)
      const dangling = messages.find(
        (m) =>
          m.role === 'assistant' &&
          m.tool_calls?.some((tc) => tc.id === 'c2'),
      );
      expect(dangling).toBeUndefined();
    });

    it('multi tool_calls: 任一未配对 → 整个 assistant roll back (保守)', () => {
      // 规则: 多个 tool_call_id 中**任一**未在 user/assistant 边界前配对 → 整体丢
      // (简化实现, 不部分保留. 后续 Sprint 可做精细化)
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'parallel calls' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [
            { id: 'c1', name: 'bash', args: { command: 'ls' } },
            { id: 'c2', name: 'read_file', args: { path: 'a.ts' } },
          ],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'bash',
          result: { success: true, content: 'a.ts' },
          duration_ms: 1,
        },
        // 缺 tool(c2) → c1 已配对, c2 未配对 → 整个 assistant 丢
        { kind: 'user', ts: 4, content: 'next turn' },
      ];
      const messages = sessionEventsToMessages(events);
      // user1 + user2 = 2 (assistant 被 roll back, tool(c1) 孤儿也丢)
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'parallel calls' });
      expect(messages[1]).toMatchObject({ role: 'user', content: 'next turn' });
    });

    it('孤儿 tool (tool_call_id 不在 pending): 丢', () => {
      // 极端: 出现 tool 事件, 但前一个 assistant 没 tool_calls / tool_call_id 不匹配
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'q' },
        { kind: 'assistant', ts: 2, content: 'no tool calls' },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'orphan_id',
          name: 'bash',
          result: { success: true, content: 'x' },
          duration_ms: 1,
        },
        { kind: 'assistant', ts: 4, content: 'done' },
      ];
      const messages = sessionEventsToMessages(events);
      // 3 messages, 孤儿 tool 丢
      expect(messages).toHaveLength(3);
      expect(messages[0]).toMatchObject({ role: 'user' });
      expect(messages[1]).toMatchObject({ role: 'assistant', content: 'no tool calls' });
      expect(messages[2]).toMatchObject({ role: 'assistant', content: 'done' });
    });

    it('EOF dangling: 文件末尾 dangling assistant 整体丢 (P2.5 仍正确)', () => {
      // 修复 (P2.5 review): EOF 改调 flushBuffer 而非硬清空.
      // 这里 "assistant(c1) 无 tool result" 末尾, 走 flushBuffer 走
      // pending.size > 0 分支 → roll back → 仍返 1 message (user).
      // 本测试**仍**通过, 行为不变; 跟下面 "EOF 已配对" 测试一起, 覆盖
      // 两种 EOF 状态: dangling 仍丢, 已配对保留.
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'q' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
        },
        // 无 tool, 文件结束 → pending={c1} → 仍 roll back
      ];
      const messages = sessionEventsToMessages(events);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ role: 'user' });
    });

    it('EOF 已配对: assistant(tool_calls) → tool 已 fsync 末尾, 仍保留 (P2.5 修复)', () => {
      // P2.5 review 修复点: 旧实现 EOF 硬清空 buffer, 误丢"已配对完成
      // 但 final assistant 还没落盘" 的合法 transcript.
      // 真实 crash 场景: 工具结果已 fsync, 进程在生成最终回答前被杀.
      // LLM 续聊需要看到 user + assistant(tool_calls) + tool (3 条) 才能
      // 继续生成最终回答.
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'list files' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'bash',
          result: { success: true, content: 'a.ts\nb.ts' },
          duration_ms: 1,
        },
        // final assistant 还没落盘 (crash), 文件以 tool 结尾
      ];
      const messages = sessionEventsToMessages(events);
      // 修复后: EOF flushBuffer 走 pending.size===0 → push buffer → 3 messages
      expect(messages).toHaveLength(3);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'list files' });
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c1', name: 'bash' }],
      });
      expect(messages[2]).toMatchObject({
        role: 'tool',
        content: 'a.ts\nb.ts',
        tool_call_id: 'c1',
      });
      // 关键: 最后一条是 tool, transcript 合法 (LLM 续聊可继续生成 final assistant)
    });

    it('EOF multi tool_calls 已配对: 全部 tool 落盘后文件结束, 全部保留', () => {
      // 极端: multi tool_calls (并行调用) 全部 tool 已 fsync, final assistant 未落盘
      const events: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'parallel' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [
            { id: 'c1', name: 'bash', args: { command: 'ls' } },
            { id: 'c2', name: 'read_file', args: { path: 'a.ts' } },
          ],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'bash',
          result: { success: true, content: 'a.ts' },
          duration_ms: 1,
        },
        {
          kind: 'tool',
          ts: 4,
          tool_call_id: 'c2',
          name: 'read_file',
          result: { success: true, content: 'export const a = 1' },
          duration_ms: 1,
        },
        // final assistant 还没落盘
      ];
      const messages = sessionEventsToMessages(events);
      // 4 messages: user, assist(tool_calls c1/c2), tool c1, tool c2
      expect(messages).toHaveLength(4);
      expect(messages[0]).toMatchObject({ role: 'user' });
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        tool_calls: expect.arrayContaining([
          expect.objectContaining({ id: 'c1' }),
          expect.objectContaining({ id: 'c2' }),
        ]),
      });
      expect(messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
      expect(messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'c2' });
    });

    it('P2 spec: 后续 append tool(c2) 后, assist2(c2) 自动恢复 (不改写 events)', () => {
      // 关键不变性 (user 拍板): 不改写 JSONL events, 只过滤 messages.
      // 补 tool(c2) 后, 之前被丢的 assist2(c2) 重新进入 messages.
      // 这是 P2 spec 的核心 (commit ref): "补上 tool result 后, 完整 tool-call
      // 组自然重新合法化".
      const events1: SessionEvent[] = [
        { kind: 'user', ts: 1, content: 'q1' },
        {
          kind: 'assistant',
          ts: 2,
          content: '',
          tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
        },
        {
          kind: 'tool',
          ts: 3,
          tool_call_id: 'c1',
          name: 'bash',
          result: { success: true, content: 'a.ts' },
          duration_ms: 1,
        },
        { kind: 'assistant', ts: 4, content: 'I see a.ts' },
        { kind: 'user', ts: 5, content: 'now read a.ts' },
        {
          kind: 'assistant',
          ts: 6,
          content: '',
          tool_calls: [{ id: 'c2', name: 'read_file', args: { path: 'a.ts' } }],
        },
        // 缺 tool(c2) — crash 状态
      ];
      const m1 = sessionEventsToMessages(events1);
      expect(m1).toHaveLength(5); // 不含 dangling

      // 后续补 tool(c2) + assist2(stop) (events 列表累加, JSONL 不改写)
      const events2: SessionEvent[] = [
        ...events1,
        {
          kind: 'tool',
          ts: 7,
          tool_call_id: 'c2',
          name: 'read_file',
          result: { success: true, content: 'export const a = 1' },
          duration_ms: 1,
        },
        { kind: 'assistant', ts: 8, content: 'a.ts exports a = 1' },
      ];
      const m2 = sessionEventsToMessages(events2);
      // 现在 8 messages, assist2(c2) 不再 dangling, 完整 tool-call 组恢复
      expect(m2).toHaveLength(8);
      expect(m2[5]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c2', name: 'read_file' }],
      });
      expect(m2[6]).toMatchObject({ role: 'tool', content: 'export const a = 1' });
      expect(m2[7]).toMatchObject({ role: 'assistant', content: 'a.ts exports a = 1' });
    });
  });

  describe('end-to-end: write steps → read back as messages', () => {
    let testFile: string;

    beforeEach(() => {
      testFile = join(
        tmpdir(),
        `dw-sess-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
      );
    });

    afterEach(async () => {
      try {
        await fs.unlink(testFile);
      } catch (err) {
        // Sprint 1c.5: 不再静默吞. ENOENT 正常静默; 其他 (EPERM/EBUSY/Windows 残留) warn.
        // 不 throw, 避免 Linux CI 红. 跨平台策略与 session-jsonl.test.ts 一致.
        const e = err as NodeJS.ErrnoException;
        if (e.code !== 'ENOENT') {
          console.warn(
            `[session-adapter.test] unlink ${testFile} failed: ${e.code ?? 'UNKNOWN'} ${e.message}`,
          );
        }
      }
    });

    it('round-trips assistant + tool steps through JSONL', async () => {
      const writer = new SessionWriter(testFile);
      await writer.open();
      await appendUserEvent(writer, 'list files');
      const steps: ToolLoopStep[] = [
        {
          kind: 'assistant',
          ts: 1,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
          },
          result: {
            model: 'm' as never,
            content: '',
            tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
            finish_reason: 'tool_calls',
          },
        },
        {
          kind: 'tool',
          ts: 2,
          tool_call: { id: 'c1', name: 'bash', args: { command: 'ls' } },
          result: { success: true, content: 'a.ts\nb.ts', meta: { duration_ms: 8 } },
          duration_ms: 8,
        },
        {
          kind: 'assistant',
          ts: 3,
          message: { role: 'assistant', content: 'I see a.ts and b.ts' },
          result: {
            model: 'm' as never,
            content: 'I see a.ts and b.ts',
            finish_reason: 'stop',
          },
        },
      ];
      await persistToolLoopSteps(writer, steps);
      await writer.close();

      const reader = new SessionReader(testFile);
      const { events, messages } = await loadSession(reader);
      expect(events).toHaveLength(4); // user + assistant + tool + assistant
      // limit/error 不被持久化,所以 limit 步没有 → 4 events
      expect(messages).toHaveLength(4); // user + assistant(tool_call) + tool + assistant(stop)
      expect(messages[0]).toMatchObject({ role: 'user', content: 'list files' });
      expect(messages[1]).toMatchObject({ role: 'assistant' });
      expect(messages[2]).toMatchObject({ role: 'tool', content: 'a.ts\nb.ts' });
      expect(messages[3]).toMatchObject({
        role: 'assistant',
        content: 'I see a.ts and b.ts',
      });
    });

    it('multi-turn crash recovery: 2 turn + 中途 kill, 二次启动后 messages 序列正确', async () => {
      // Sprint 1c 端到端回归: 模拟"agent 跑 2 turn 后被 kill, 二次启动看到 1.x turn 的全部 messages"
      // 关键不变量 (跟 R7 "test invariant, not snapshot" 一致):
      //   - 二次启动看到的 messages 必须等于"已完成事件"的完整序列
      //   - 损坏的最后一行的 tool_call 必须被丢弃 (不会让 LLM 看到无 result 的 tool_call)
      const writer = new SessionWriter(testFile);
      await writer.open();
      // Turn 1: user → assistant(tool_call) → tool → assistant(stop)
      await appendUserEvent(writer, 'list files');
      const steps1: ToolLoopStep[] = [
        {
          kind: 'assistant',
          ts: 1,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
          },
          result: {
            model: 'm' as never,
            content: '',
            tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
            finish_reason: 'tool_calls',
          },
        },
        {
          kind: 'tool',
          ts: 2,
          tool_call: { id: 'c1', name: 'bash', args: { command: 'ls' } },
          result: { success: true, content: 'a.ts\nb.ts', meta: { duration_ms: 8 } },
          duration_ms: 8,
        },
        {
          kind: 'assistant',
          ts: 3,
          message: { role: 'assistant', content: 'I see a.ts and b.ts' },
          result: {
            model: 'm' as never,
            content: 'I see a.ts and b.ts',
            finish_reason: 'stop',
          },
        },
      ];
      await persistToolLoopSteps(writer, steps1);
      // Turn 2: user → assistant(tool_call) (在第 2 步中途被 kill)
      await appendUserEvent(writer, 'now read a.ts');
      const steps2Partial: ToolLoopStep[] = [
        {
          kind: 'assistant',
          ts: 5,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'c2', name: 'read_file', args: { path: 'a.ts' } }],
          },
          result: {
            model: 'm' as never,
            content: '',
            tool_calls: [{ id: 'c2', name: 'read_file', args: { path: 'a.ts' } }],
            finish_reason: 'tool_calls',
          },
        },
      ];
      await persistToolLoopSteps(writer, steps2Partial);
      await writer.close();

      // 真实 crash 模拟: c2 tool_call 的 tool event 写到一半被 kill
      // 关键: c2 tool_call 的 assistant 事件**已完成**(ts=5), 但 tool(c2) 还没落盘
      // 用独特 marker "PARTIAL_MARKER_XYZZY" 避免跟 user 消息 "read" 字符串误匹配
      await fs.appendFile(
        testFile,
        '{"kind":"tool","tool_call_id":"c2","name":"PARTIAL_MARKER_XYZZY',
        'utf8',
      );

      // === 二次启动 (crash 后) ===
      // Sprint 1c P2 修复: 重建 messages 时过滤 dangling assistant tool_call.
      // turn2 partial (assist2(tool_c2) 但 tool(c2) 没落盘) 整体 roll back,
      // 恢复后看到 5 条 messages, 不含 dangling c2.
      const reader = new SessionReader(testFile);
      const { events, messages } = await loadSession(reader);

      // 不变量 1: events 长度 = 6 (turn1 4 步 + turn2 user + turn2 assistant 完整), tool(c2) partial 被截
      expect(events).toHaveLength(6);
      // 不变量 2 (P2 修复后): 5 条 messages — turn1 完整 + turn2 user, dangling assist2(c2) 被丢
      expect(messages).toHaveLength(5);
      expect(messages[0]).toMatchObject({ role: 'user', content: 'list files' });
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
      });
      expect(messages[2]).toMatchObject({ role: 'tool', content: 'a.ts\nb.ts', tool_call_id: 'c1' });
      expect(messages[3]).toMatchObject({ role: 'assistant', content: 'I see a.ts and b.ts' });
      expect(messages[4]).toMatchObject({ role: 'user', content: 'now read a.ts' });
      // 不变量 2.5: 无 dangling — 最后一条消息的 role 是 'user', 不是 assistant(tool_calls)
      expect(messages[4]?.role).toBe('user');
      // 二次启动看到 transcript 不含孤立 tool_call (OpenAI API 不会拒)

      // 不变量 3: 文件已 truncate (Sprint 1b 闭环)
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).not.toContain('PARTIAL_MARKER_XYZZY');
      expect(after.endsWith('\n')).toBe(true);

      // 不变量 4: 二次启动后, 续写 c2 tool result, transcript 重新合法化为 8 messages
      // 关键洞察 (user 拍板): 不改写 JSONL events, 只过滤 messages. 补 tool result 后
      // 完整 tool-call 组自然重新合法化, 之前被丢的 assist2(c2) 重新进入 messages.
      const w3 = new SessionWriter(testFile);
      await w3.open();
      const recoverySteps: ToolLoopStep[] = [
        {
          kind: 'tool',
          ts: 6,
          tool_call: { id: 'c2', name: 'read_file', args: { path: 'a.ts' } },
          result: { success: true, content: 'export const a = 1' },
          duration_ms: 3,
        },
        {
          kind: 'assistant',
          ts: 7,
          message: { role: 'assistant', content: 'a.ts exports a = 1' },
          result: {
            model: 'm' as never,
            content: 'a.ts exports a = 1',
            finish_reason: 'stop',
          },
        },
      ];
      await persistToolLoopSteps(w3, recoverySteps);
      await w3.close();

      // 重新加载: 应当能拿到完整 2 turn 对话 (assist2(c2) 不再 dangling, 自动恢复)
      // 事件计数: turn1 (4) + turn2 partial (2) + recovery (2) = 8
      // messages 顺序: user1/assist1(tool_c1)/tool1/assist1-stop/user2/assist2(tool_c2)/tool2/assist2-stop
      // 索引:           0       1                   2      3              4       5                       6       7
      const reader2 = new SessionReader(testFile);
      const recovered = await loadSession(reader2);
      expect(recovered.events).toHaveLength(8);
      expect(recovered.messages).toHaveLength(8);
      // 不变量 5: transcript 完整 — 最后一条是 'a.ts exports a = 1', 不再是 dangling
      expect(recovered.messages[5]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c2', name: 'read_file', args: { path: 'a.ts' } }],
      });
      expect(recovered.messages[6]).toMatchObject({ role: 'tool', content: 'export const a = 1' });
      expect(recovered.messages[7]).toMatchObject({ role: 'assistant', content: 'a.ts exports a = 1' });
    });
  });
});
