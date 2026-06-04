/**
 * 'verification' session event 单测 — Sprint 1c-revive-2-D-11-3 (2026-06-04)
 *
 * 覆盖 (D-11 review 必做):
 *   - SessionWriter.append 'verification' event → 1 行 JSONL
 *   - SessionReader.readAll 读出来 = 写进去的 (roundtrip 不丢字段)
 *   - sessionEventsToMessages 看到 'verification' 跳过 (不重放进 LLM context)
 *   - loadSession (full cycle: write → close → reopen) 不崩
 *   - **旧 session reload 不崩**: 写老式 event (无 'verification' kind) →
 *     用新 reader 读也 OK (新 union type 兼容老 event)
 *   - 'verification' 跟 'user' / 'compaction' 混在同文件, 解析全过
 *   - appendVerificationEvent helper 写完 reload 能读出
 */
import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SessionReader,
  SessionWriter,
  readSessionEvents,
  type SessionEvent,
} from '@deepwhale/core';
import {
  appendVerificationEvent,
  loadSession,
  sessionEventsToMessages,
} from '../../src/agent/session-adapter.js';

const tmpFile = (): string =>
  join(tmpdir(), `dw-verification-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`);

async function cleanup(file: string): Promise<void> {
  try {
    await fs.unlink(file);
  } catch {
    /* best-effort */
  }
}

describe('verification session event (D-11-3 2026-06-04)', () => {
  it('appendVerificationEvent → 写 1 条 verification event 到 JSONL', async () => {
    const file = tmpFile();
    try {
      const w = new SessionWriter(file);
      await w.open();
      await appendVerificationEvent(w, {
        status: 'passed',
        durationMs: 1234,
        commandCount: 4,
        failedCount: 0,
        summary: '4/4 checks passed',
        meta: { logFilePath: '/tmp/verify.log' },
        ts: 1000,
      });
      await w.close();
      // 验证 JSONL 1 行
      const text = await fs.readFile(file, 'utf8');
      const lines = text.split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!) as SessionEvent;
      expect(parsed.kind).toBe('verification');
      const ev = parsed as Extract<SessionEvent, { kind: 'verification' }>;
      expect(ev.status).toBe('passed');
      expect(ev.durationMs).toBe(1234);
      expect(ev.command_count).toBe(4);
      expect(ev.failed_count).toBe(0);
      expect(ev.summary).toBe('4/4 checks passed');
      expect(ev.meta?.['logFilePath']).toBe('/tmp/verify.log');
      expect(ev.ts).toBe(1000);
    } finally {
      await cleanup(file);
    }
  });

  it('roundtrip: 写 → close → reopen → readAll → 跟原文一致', async () => {
    const file = tmpFile();
    try {
      const w = new SessionWriter(file);
      await w.open();
      await appendVerificationEvent(w, {
        status: 'failed',
        durationMs: 9876,
        commandCount: 4,
        failedCount: 1,
        summary: '3/4 checks passed',
        ts: 2000,
      });
      await w.close();

      // 用新 reader 读
      const r = new SessionReader(file);
      const events = await r.readAll();
      expect(events).toHaveLength(1);
      const ev = events[0]!;
      expect(ev.kind).toBe('verification');
      if (ev.kind === 'verification') {
        expect(ev.status).toBe('failed');
        expect(ev.durationMs).toBe(9876);
        expect(ev.command_count).toBe(4);
        expect(ev.failed_count).toBe(1);
        expect(ev.summary).toBe('3/4 checks passed');
        expect(ev.ts).toBe(2000);
      }
    } finally {
      await cleanup(file);
    }
  });

  it("sessionEventsToMessages 看到 'verification' 跳过 (不重放进 LLM context)", async () => {
    const events: ReadonlyArray<SessionEvent> = [
      { kind: 'user', ts: 1, content: 'hi' },
      { kind: 'assistant', ts: 2, content: 'hello' },
      {
        kind: 'verification',
        ts: 3,
        status: 'passed',
        durationMs: 100,
        command_count: 4,
        failed_count: 0,
        summary: 'all green',
      },
      { kind: 'user', ts: 4, content: 'after-verify' },
    ];
    const messages = sessionEventsToMessages(events);
    // 期望 3 messages: user/assistant/user, verification 跳过
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({ role: 'user', content: 'hi' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'hello' });
    expect(messages[2]).toEqual({ role: 'user', content: 'after-verify' });
  });

  it('loadSession: 写 "verification" event → close → loadSession 拿到 events + messages (verification 不在 messages 里)', async () => {
    const file = tmpFile();
    try {
      const w = new SessionWriter(file);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'before' });
      await w.append({ kind: 'assistant', ts: 2, content: 'hi' });
      await appendVerificationEvent(w, {
        status: 'passed',
        durationMs: 500,
        commandCount: 4,
        failedCount: 0,
        summary: 'all green',
        ts: 3,
      });
      await w.append({ kind: 'user', ts: 4, content: 'after' });
      await w.close();

      const r = new SessionReader(file);
      const { events, messages } = await loadSession(r);
      // events 含 4 条 (含 verification)
      expect(events).toHaveLength(4);
      // messages 只 3 条 (verification 跳过)
      expect(messages).toHaveLength(3);
      expect(messages.map((m) => m.content)).toEqual(['before', 'hi', 'after']);
    } finally {
      await cleanup(file);
    }
  });

  it('**旧 session reload 不崩** (D-11-3 拍板红线): 写老 event (无 "verification" kind) → 新 reader 读 OK', async () => {
    const file = tmpFile();
    try {
      // 模拟旧 session: 写 user/assistant/system, 不写 verification
      const w = new SessionWriter(file);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'old1' });
      await w.append({ kind: 'assistant', ts: 2, content: 'old-reply' });
      await w.append({ kind: 'system', ts: 3, content: 'old-system' });
      await w.close();

      // 新 reader 读老 JSONL
      const events = await readSessionEvents(file);
      expect(events).toHaveLength(3);
      for (const e of events) {
        // 3 个 kind 都是 union 已有的 (不含 verification), 类型守卫生效
        expect(['user', 'assistant', 'system']).toContain(e.kind);
      }
      // 老 event 走 sessionEventsToMessages 不崩
      const messages = sessionEventsToMessages(events);
      expect(messages).toHaveLength(2); // user + assistant, system 跳过
    } finally {
      await cleanup(file);
    }
  });

  it("'verification' 跟 'compaction' 混在同一 JSONL 都能解析", async () => {
    const file = tmpFile();
    try {
      const w = new SessionWriter(file);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'msg1' });
      await w.append({
        kind: 'compaction',
        ts: 2,
        summary: 'summary-1',
        replaced_range: [0, 1],
      });
      await appendVerificationEvent(w, {
        status: 'failed',
        durationMs: 100,
        commandCount: 4,
        failedCount: 1,
        summary: 'lint failed',
        ts: 3,
      });
      await w.append({ kind: 'user', ts: 4, content: 'msg2' });
      await w.close();

      const events = await readSessionEvents(file);
      expect(events).toHaveLength(4);
      // kind 流: user / compaction / verification / user — 全可解析
      const kinds = events.map((e) => e.kind);
      expect(kinds).toEqual(['user', 'compaction', 'verification', 'user']);

      const messages = sessionEventsToMessages(events);
      // compaction replaced_range [0, 1) = 替换 out[0] (msg1) → 1 system summary,
      // verification 跳过, user(4) (msg2) push → 2 messages
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe('system');
      expect(messages[0]?.content).toContain('[Session compaction summary]');
      expect(messages[1]?.content).toBe('msg2');
    } finally {
      await cleanup(file);
    }
  });

  it('appendVerificationEvent ts 默认 Date.now() (单测可注入)', async () => {
    const file = tmpFile();
    try {
      const w = new SessionWriter(file);
      await w.open();
      const before = Date.now();
      await appendVerificationEvent(w, {
        status: 'passed',
        durationMs: 0,
        commandCount: 0,
        failedCount: 0,
        summary: '',
      });
      await w.close();
      const after = Date.now();

      const events = await readSessionEvents(file);
      const ev = events[0]!;
      if (ev.kind === 'verification') {
        expect(ev.ts).toBeGreaterThanOrEqual(before);
        expect(ev.ts).toBeLessThanOrEqual(after);
      } else {
        expect.fail(`expected verification, got ${ev.kind}`);
      }
    } finally {
      await cleanup(file);
    }
  });

  it('appendVerificationEvent meta 不传 → JSONL 里也没 meta 字段', async () => {
    const file = tmpFile();
    try {
      const w = new SessionWriter(file);
      await w.open();
      await appendVerificationEvent(w, {
        status: 'passed',
        durationMs: 1,
        commandCount: 1,
        failedCount: 0,
        summary: 'x',
        ts: 100,
      });
      await w.close();
      const text = await fs.readFile(file, 'utf8');
      expect(text).not.toMatch(/"meta"/);
    } finally {
      await cleanup(file);
    }
  });
});
