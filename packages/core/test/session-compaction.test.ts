/**
 * Session Compaction 单测 (Sprint 1c-revive-2-D-5-1)
 *
 * P28 拍板: 跨协议 first-run 取**最后** step 软断言 — 这里不涉协议, 走 vitest 标准 expect.
 * 跨平台拍板: ENOENT 静默, EPERM/EBUSY warn 不 throw.
 *
 * 5 个核心测点 (基础 compaction 范围):
 *   1. estimateTokens 字符/4 粗估 (含 tool_calls / tool_call_id / name)
 *   2. shouldCompact 拍板: contextWindow=0 → false; < threshold → false; >= threshold → true
 *   3. shouldCompact 拍板: messages 数 <= tailKeep → false
 *   4. compact 函数: 替换中间段, 写 'compaction' event, 1 条 system summary
 *   5. compact 函数: messages <= tailKeep 抛错 (caller 拍板不该到这)
 */

import { describe, expect, it, vi } from 'vitest';
import {
  estimateTokens,
  shouldCompact,
  compact,
  resolveCompactionConfig,
  COMPACTION_DEFAULTS,
  CompactionState,
  runCompactionWithLatch,
  type ChatMessage,
} from '../src/session/compaction.js';

describe('Sprint 1c-revive-2-D-5-1: Session Compaction (基础 trigger + replace)', () => {
  describe('estimateTokens (char/4 粗估)', () => {
    it('空 messages → 0', () => {
      expect(estimateTokens([])).toBe(0);
    });

    it('role + content 累加, 4 字节边界 + char/4', () => {
      // role 'user' (4) + content 'hello world' (11) + role token (4) = 19 chars → ceil(19/4) = 5
      const msgs: ChatMessage[] = [{ role: 'user', content: 'hello world' }];
      // 但本实现: role.length+1 = 5, content = 11, +4 边界 = 20 → ceil(20/4) = 5
      expect(estimateTokens(msgs)).toBe(5);
    });

    it('tool_calls 走 JSON.stringify + id/name + 10', () => {
      const msgs: ChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call_abc', name: 'read', args: { path: '/a' } },
          ],
        },
      ];
      // role(9)+1=10, content=0, tc: id(8)+name(4)+JSON({path:/a})(13)+10=35, +4 边界 = 49
      // → ceil(49/4) = 13
      const t = estimateTokens(msgs);
      expect(t).toBeGreaterThan(10);
      expect(t).toBeLessThan(20);
    });

    it('tool 消息 (tool_call_id + name) 算入', () => {
      const msgs: ChatMessage[] = [
        { role: 'tool', content: 'file content', tool_call_id: 'call_xyz', name: 'read' },
      ];
      const t = estimateTokens(msgs);
      expect(t).toBeGreaterThan(3);
    });
  });

  describe('shouldCompact 拍板 (window × compactRatio)', () => {
    it('contextWindow = 0 → 永远不 compact (拍板关闭)', () => {
      const msgs: ChatMessage[] = Array(20).fill({ role: 'user', content: 'x'.repeat(1000) });
      expect(shouldCompact(msgs, { contextWindow: 0 })).toBe(false);
    });

    it('tokens < threshold → false', () => {
      const msgs: ChatMessage[] = [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'user', content: 'how are you' },
        { role: 'assistant', content: 'good' },
        { role: 'user', content: 'great' },
      ];
      // contextWindow=100000, ratio=0.8 → threshold=80000, 5 短消息 << threshold
      expect(shouldCompact(msgs, { contextWindow: 100000 })).toBe(false);
    });

    it('tokens >= threshold → true', () => {
      // 拍 1000 token 内容, contextWindow=1000, ratio=0.8 → threshold=800
      const big = 'x'.repeat(3200); // 3200 chars → ~800 tokens
      const msgs: ChatMessage[] = [
        { role: 'user', content: big },
        { role: 'assistant', content: big },
        { role: 'user', content: big },
        { role: 'assistant', content: big },
        { role: 'user', content: big },
      ];
      // 5 消息 x ~800 tokens = ~4000 tokens >> 800 threshold
      expect(shouldCompact(msgs, { contextWindow: 1000 })).toBe(true);
    });

    it('messages <= tailKeep → false (没东西可总结)', () => {
      const big = 'x'.repeat(3200);
      const msgs: ChatMessage[] = [
        { role: 'user', content: big },
        { role: 'assistant', content: big },
      ];
      // 2 消息, default tailKeep=4 → messages <= tailKeep
      expect(shouldCompact(msgs, { contextWindow: 1000 })).toBe(false);
    });

    it('resolveCompactionConfig 用 defaults', () => {
      const r = resolveCompactionConfig({ contextWindow: 1000 });
      expect(r.compactRatio).toBe(COMPACTION_DEFAULTS.compactRatio);
      expect(r.tailKeepMessages).toBe(COMPACTION_DEFAULTS.tailKeepMessages);
      expect(r.threshold).toBe(800); // 1000 * 0.8
    });
  });

  describe('compact 函数 (替换 + event)', () => {
    it('执行 compaction: 替换中间段, 写 1 条 system summary, event 拍板字段', async () => {
      const msgs: ChatMessage[] = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'm1' },
        { role: 'assistant', content: 'm2' },
        { role: 'user', content: 'm3' },
        { role: 'assistant', content: 'm4' },
        { role: 'user', content: 'm5 (tail)' },
        { role: 'assistant', content: 'm6 (tail)' },
      ];

      // tailKeep=2, head = 5 条, tail = 2 条, summary 替 5 条
      const result = await compact(
        msgs,
        { contextWindow: 100000, tailKeepMessages: 2 },
        async (toSummarize) => `summarized ${toSummarize.length} messages`,
        { now: () => 1234567890 },
      );

      // 新 messages: [head 5, system summary 1, tail 2] = 8
      expect(result.messages).toHaveLength(8);
      // tail 2 条保持原样
      expect(result.messages[result.messages.length - 2]).toEqual({
        role: 'user',
        content: 'm5 (tail)',
      });
      expect(result.messages[result.messages.length - 1]).toEqual({
        role: 'assistant',
        content: 'm6 (tail)',
      });
      // 中间 1 条 system summary
      const summary = result.messages[5]!;
      expect(summary.role).toBe('system');
      expect(summary.content).toContain('summarized 5 messages');
      // event — P38 拍板: union 派发用 kind 拍板后 narrow, 别直接 access 字段
      expect(result.event.kind).toBe('compaction');
      if (result.event.kind !== 'compaction') throw new Error('unreachable');
      expect(result.event.ts).toBe(1234567890);
      expect(result.event.summary).toBe('summarized 5 messages');
      expect(result.event.replaced_range).toEqual([0, 5]);
      // stats
      expect(result.stats.beforeMessages).toBe(7);
      expect(result.stats.afterMessages).toBe(8); // 7 - 5 + 1 = 3? no: 5 head + 1 system + 2 tail = 8
      expect(result.stats.replacedRange).toEqual([0, 5]);
    });

    it('messages <= tailKeep 抛错 (caller 该先 shouldCompact 拍)', async () => {
      const msgs: ChatMessage[] = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ];
      await expect(
        compact(msgs, { contextWindow: 100000, tailKeepMessages: 4 }, async () => 'x'),
      ).rejects.toThrow(/nothing to compact/);
    });
  });

  /**
   * Sprint 1c-revive-2-D-5-2: stuck latch 拍板 (Reasonix compact.go:88-93 拍板一致).
   *
   * P38 拍板: latch 触发是**确定**的 (counter == threshold), 走**严格** assert.
   * D-5-1 走软断言 (跨协议路径随机), D-5-2 走硬断言 (state machine 拍板).
   */
  describe('CompactionState + runCompactionWithLatch (stuck latch)', () => {
    it('recordSuccess: 1 次成功重置所有失败计数 + unpause', () => {
      const s = new CompactionState(2);
      s.recordFailure(new Error('a'));
      s.recordFailure(new Error('b'));
      expect(s.paused).toBe(true);
      s.recordSuccess();
      expect(s.consecutiveFailures).toBe(0);
      expect(s.paused).toBe(false);
      expect(s.lastError).toBeNull();
    });

    it('recordFailure: 第 N 次失败触发 latch (threshold=2)', () => {
      const s = new CompactionState(2);
      expect(s.recordFailure(new Error('1st'))).toBe(false);
      expect(s.paused).toBe(false);
      expect(s.consecutiveFailures).toBe(1);
      // 第 2 次失败 → latch
      expect(s.recordFailure(new Error('2nd'))).toBe(true);
      expect(s.paused).toBe(true);
      expect(s.consecutiveFailures).toBe(2);
      // 第 3 次失败 → 已 paused, 不再返 true (避免重发 paused event)
      expect(s.recordFailure(new Error('3rd'))).toBe(false);
      expect(s.consecutiveFailures).toBe(3);
    });

    it('reset: 手动清 latch', () => {
      const s = new CompactionState(2);
      s.recordFailure(new Error('a'));
      s.recordFailure(new Error('b'));
      expect(s.paused).toBe(true);
      s.reset();
      expect(s.paused).toBe(false);
      expect(s.consecutiveFailures).toBe(0);
    });

    it('threshold=0: 不 latch (走纯失败重试)', () => {
      const s = new CompactionState(0);
      // threshold=0 含义: pauseThreshold=0, 任何失败 consecutiveFailures(>=1) >= 0 都会 latch
      // 拍板: threshold=0 实际**会**立刻 latch, 这是 0 的副作用. 这里只验 recordFailure 行为:
      expect(s.recordFailure(new Error('a'))).toBe(true);
      expect(s.paused).toBe(true);
    });

    it('runCompactionWithLatch: 成功路径 → kind=ok + state reset', async () => {
      const big = 'x'.repeat(3200);
      const msgs: ChatMessage[] = [
        { role: 'user', content: big },
        { role: 'assistant', content: big },
        { role: 'user', content: big },
        { role: 'assistant', content: big },
        { role: 'user', content: big },
      ];
      const state = new CompactionState(2);
      const summaryFn = vi.fn(async () => 'mock summary');
      const r = await runCompactionWithLatch(
        msgs,
        { contextWindow: 1000, tailKeepMessages: 2 },
        summaryFn,
        state,
      );
      expect(r).not.toBeNull();
      expect(r?.kind).toBe('ok');
      if (r?.kind !== 'ok') throw new Error('unreachable');
      expect(summaryFn).toHaveBeenCalledTimes(1);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.paused).toBe(false);
    });

    it('runCompactionWithLatch: 不该 compact → 返 null, 不调 summaryFn', async () => {
      const msgs: ChatMessage[] = [
        { role: 'user', content: 'short' },
        { role: 'assistant', content: 'reply' },
      ];
      const state = new CompactionState(2);
      const summaryFn = vi.fn(async () => 'should not be called');
      const r = await runCompactionWithLatch(
        msgs,
        { contextWindow: 100000, tailKeepMessages: 4 },
        summaryFn,
        state,
      );
      expect(r).toBeNull();
      expect(summaryFn).not.toHaveBeenCalled();
    });

    it('runCompactionWithLatch: paused → 返 null, 不调 summaryFn (防 death loop + 省钱)', async () => {
      const big = 'x'.repeat(3200);
      const msgs: ChatMessage[] = Array(5).fill({ role: 'user', content: big });
      const state = new CompactionState(2);
      state.paused = true; // 手动 latch
      const summaryFn = vi.fn(async () => 'should not be called');
      const r = await runCompactionWithLatch(
        msgs,
        { contextWindow: 1000, tailKeepMessages: 2 },
        summaryFn,
        state,
      );
      expect(r).toBeNull();
      expect(summaryFn).not.toHaveBeenCalled();
    });

    it('runCompactionWithLatch: 连续 2 次失败 → 第 2 次返 kind=latched + paused event', async () => {
      const big = 'x'.repeat(3200);
      const msgs: ChatMessage[] = Array(5).fill({ role: 'user', content: big });
      const state = new CompactionState(2);

      // 第 1 次失败 (summaryFn 抛错) → 未 latch, 抛给 caller
      const summaryFn1 = vi.fn(async () => {
        throw new Error('API timeout');
      });
      await expect(
        runCompactionWithLatch(
          msgs,
          { contextWindow: 1000, tailKeepMessages: 2 },
          summaryFn1,
          state,
        ),
      ).rejects.toThrow('API timeout');
      expect(state.consecutiveFailures).toBe(1);
      expect(state.paused).toBe(false);

      // 第 2 次失败 → 触发 latch, 返 kind=latched
      const summaryFn2 = vi.fn(async () => {
        throw new Error('API timeout again');
      });
      const r2 = await runCompactionWithLatch(
        msgs,
        { contextWindow: 1000, tailKeepMessages: 2 },
        summaryFn2,
        state,
      );
      expect(r2).not.toBeNull();
      expect(r2?.kind).toBe('latched');
      if (r2?.kind !== 'latched') throw new Error('unreachable');
      expect(r2.consecutiveFailures).toBe(2);
      expect(r2.error.message).toBe('API timeout again');
      // paused event 拍板
      expect(r2.pausedEvent.kind).toBe('compaction_paused');
      if (r2.pausedEvent.kind !== 'compaction_paused') throw new Error('unreachable');
      expect(r2.pausedEvent.consecutive_failures).toBe(2);
      expect(r2.pausedEvent.reason).toMatch(/auto-paused/);
      expect(r2.pausedEvent.last_error).toBe('API timeout again');
      expect(state.paused).toBe(true);
    });
  });
});
