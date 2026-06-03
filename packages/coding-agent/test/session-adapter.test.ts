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
  });
});
