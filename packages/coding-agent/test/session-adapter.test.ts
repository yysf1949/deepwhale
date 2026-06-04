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
      } catch {
        // ignore
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

      // === 二次启动 ===
      const reader = new SessionReader(testFile);
      const { events, messages } = await loadSession(reader);

      // 不变量 1: events 长度 = 6 (turn1 4 步 + turn2 user + turn2 assistant 完整), tool(c2) partial 被截
      expect(events).toHaveLength(6);
      // 不变量 2: 二次启动看到 messages 序列, turn1 完整, turn2 user/assistant(未完成 tool_call) 也保留
      // 注: sessionEventsToMessages **不**做"未完成 tool_call"过滤 — 这是已知 gap, 本测试不强求
      expect(messages[0]).toMatchObject({ role: 'user', content: 'list files' });
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c1', name: 'bash', args: { command: 'ls' } }],
      });
      expect(messages[2]).toMatchObject({ role: 'tool', content: 'a.ts\nb.ts', tool_call_id: 'c1' });
      expect(messages[3]).toMatchObject({ role: 'assistant', content: 'I see a.ts and b.ts' });
      expect(messages[4]).toMatchObject({ role: 'user', content: 'now read a.ts' });
      expect(messages[5]).toMatchObject({
        role: 'assistant',
        tool_calls: [{ id: 'c2', name: 'read_file', args: { path: 'a.ts' } }],
      });

      // 不变量 3: 文件已 truncate (Sprint 1b 闭环)
      const after = await fs.readFile(testFile, 'utf8');
      expect(after).not.toContain('PARTIAL_MARKER_XYZZY');
      expect(after.endsWith('\n')).toBe(true);

      // 不变量 4: 二次启动后, 续写 c2 tool result 不拼到损坏字节
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

      // 重新加载: 应当能拿到完整 2 turn 对话
      // 事件计数: turn1 (4) + turn2 partial (2) + recovery (2) = 8
      // messages 顺序: user1/assist1(tool_c1)/tool1/assist1/stop/user2/assist2(tool_c2) + recovery [tool_c2, assist2/stop]
      // 索引:           0       1                   2      3              4       5                       6        7
      const reader2 = new SessionReader(testFile);
      const recovered = await loadSession(reader2);
      expect(recovered.events).toHaveLength(8);
      expect(recovered.messages).toHaveLength(8);
      expect(recovered.messages[6]).toMatchObject({ role: 'tool', content: 'export const a = 1' });
      expect(recovered.messages[7]).toMatchObject({ role: 'assistant', content: 'a.ts exports a = 1' });
    });
  });
});
