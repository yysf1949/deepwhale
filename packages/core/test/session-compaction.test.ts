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

import { describe, expect, it } from 'vitest';
import {
  estimateTokens,
  shouldCompact,
  compact,
  resolveCompactionConfig,
  COMPACTION_DEFAULTS,
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
      // event
      expect(result.event.kind).toBe('compaction');
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
});
