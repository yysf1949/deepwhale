/**
 * core/session policy_decision 单测 — Sprint 1c-revive-3-D-13 (2026-06-05).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionWriter, readSessionEvents } from '../../src/session/jsonl.js';
import {
  sessionEventsToMessages,
  appendPolicyDecisionEvent,
} from '../../../coding-agent/src/agent/session-adapter.js';

describe('SessionEvent policy_decision (D-13)', () => {
  it('write + read policy_decision event (round-trip)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-policy-'));
    try {
      const path = join(dir, 'session.jsonl');
      const w = new SessionWriter(path);
      await w.open();
      await w.append({
        kind: 'policy_decision',
        ts: 1000,
        tool_call_id: 'c2',
        name: 'write_file',
        decision: 'require_confirmation',
        argsDigest: 'sha256:abcdef012345',
        reason: 'overwrite file',
      });
      await w.close();
      const events = await readSessionEvents(path);
      expect(events).toHaveLength(1);
      expect(events[0]!.kind).toBe('policy_decision');
      if (events[0]!.kind === 'policy_decision') {
        expect(events[0]!.tool_call_id).toBe('c2');
        expect(events[0]!.decision).toBe('require_confirmation');
        expect(events[0]!.argsDigest).toBe('sha256:abcdef012345');
        expect(events[0]!.reason).toBe('overwrite file');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('appendPolicyDecisionEvent helper: deny 落盘', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dw-policy-'));
    try {
      const path = join(dir, 'session.jsonl');
      const w = new SessionWriter(path);
      await w.open();
      await appendPolicyDecisionEvent(w, {
        tool_call_id: 'c3',
        name: 'bash',
        decision: 'deny',
        argsDigest: 'sha256:1234567890ab',
        reason: 'rm -rf / matches dangerous pattern',
      });
      await w.close();
      const events = await readSessionEvents(path);
      expect(events[0]!.kind).toBe('policy_decision');
      if (events[0]!.kind === 'policy_decision') {
        expect(events[0]!.decision).toBe('deny');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sessionEventsToMessages: policy_decision 不进 LLM context', async () => {
    // 跟 verification / compaction_paused 同语义: metadata, reload 不污染 messages
    const dir = mkdtempSync(join(tmpdir(), 'dw-policy-'));
    try {
      const path = join(dir, 'session.jsonl');
      const w = new SessionWriter(path);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'hi' });
      await w.append({
        kind: 'assistant',
        ts: 2,
        content: '',
        tool_calls: [{ id: 'c1', name: 'read_file', args: { path: '/tmp/x' } }],
      });
      await w.append({
        kind: 'policy_decision',
        ts: 3,
        tool_call_id: 'c1',
        name: 'read_file',
        decision: 'deny',
        argsDigest: 'sha256:000000000000',
      });
      await w.append({
        kind: 'tool',
        ts: 4,
        tool_call_id: 'c1',
        name: 'read_file',
        result: { success: true, content: 'ok' },
        duration_ms: 5,
      });
      await w.close();
      const events = await readSessionEvents(path);
      const msgs = sessionEventsToMessages(events);
      // user + assistant (with tool_calls) + tool = 3 messages, 0 policy_decision
      expect(msgs).toHaveLength(3);
      expect(msgs.some((m) => m.role === 'system' && m.content.includes('policy'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('旧 session 文件 (无 policy_decision) reload 不崩', async () => {
    // 拍板: 严格 union 兜底, 旧 kind 解析流程不变, 新 kind reader 不会尝试 parse 缺失字段
    const dir = mkdtempSync(join(tmpdir(), 'dw-policy-'));
    try {
      const path = join(dir, 'session.jsonl');
      const w = new SessionWriter(path);
      await w.open();
      await w.append({ kind: 'user', ts: 1, content: 'hi' });
      await w.append({
        kind: 'assistant',
        ts: 2,
        content: 'hello',
        tool_calls: [{ id: 'c1', name: 'read_file', args: { path: '/tmp/x' } }],
      });
      await w.append({
        kind: 'tool',
        ts: 3,
        tool_call_id: 'c1',
        name: 'read_file',
        result: { success: true, content: 'ok' },
        duration_ms: 5,
      });
      await w.close();
      const events = await readSessionEvents(path);
      const msgs = sessionEventsToMessages(events);
      // user + assistant (no tool_calls because no orphan) + tool = 3 messages
      expect(msgs.length).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
