/**
 * @deepwhale/coding-agent — agent-compaction D-6 unit tests
 *
 * Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04):
 *   1. runToolLoopWithCompaction 接受 caller 拼的 system prefix, 触发 compaction
 *      时 replaced_range 必须指 "剥掉 system 后的 tail index" (跟 session-adapter
 *      replay JSONL 累积 index 同空间, reload 不 off-by-one).
 *   2. compact 成功后返回的 messages 把 system prefix 原样 prepend 回 (LLM 看到
 *      跟 caller 拼的一致 context).
 *
 * 测试策略:
 *   - 用 mock LLMClient (chat 调 summaryFn → 直接返固定 summary, 后续调走
 *     runToolLoop → 直接返 final content)
 *   - 触发 compaction 阈值拍小 (contextWindow 拍小 + 内容拍大)
 *   - writer 走真 temp file, append 后用 SessionReader 读 events 验证 replaced_range
 *
 * 不**在**这里测 reload round-trip (那是 session-adapter 范围, session-adapter.test.ts
 * 已测). 此文件聚焦: replaced_range 跟 system prefix 解耦.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CompactionState,
  SessionReader,
  SessionWriter,
  type CompactionConfig,
} from '@deepwhale/core';
import {
  runToolLoopWithCompaction,
  type AgentCompactionConfig,
} from '../src/agent/agent-compaction.js';
import type { ChatMessage, ChatResult, LLMClient, ModelId } from '@deepwhale/llm';
import { ToolRegistry } from '../src/tools/registry.js';

// ---- mock LLM client ----

/**
 * Mock LLMClient that handles 2 call shapes:
 *   - summary call (system + user with content preview) → return fixed summary
 *   - tool loop call (anything else) → return final assistant text
 */
function mockClient(summary: string, finalContent: string): LLMClient {
  return {
    model: 'mock' as ModelId,
    chat: ((messages: ReadonlyArray<ChatMessage>) => {
      const isSummary =
        messages.length === 2 &&
        messages[0]?.role === 'system' &&
        messages[1]?.role === 'user' &&
        (messages[1]?.content ?? '').includes('[0] system:');
      if (isSummary) {
        return Promise.resolve({
          model: 'mock' as ModelId,
          content: summary,
          finish_reason: 'stop',
        } satisfies ChatResult);
      }
      return Promise.resolve({
        model: 'mock' as ModelId,
        content: finalContent,
        finish_reason: 'stop',
      } satisfies ChatResult);
    }) as LLMClient['chat'],
  } as LLMClient;
}

// ---- temp file helpers ----

let testFile: string;
let counter = 0;

beforeEach(() => {
  counter += 1;
  testFile = join(tmpdir(), `agent-compaction-2d6-test-${Date.now()}-${counter}.jsonl`);
});

afterEach(async () => {
  try {
    await fs.unlink(testFile);
  } catch {
    /* ignore */
  }
});

// ---- main: D-6 P1-2 system prefix + replaced_range alignment ----

describe('agent-compaction 2d6', () => {
  it('D-6 P1-2: caller-side system prefix does not shift replaced_range', async () => {
    // 拍板: caller 拼 1 条 system prompt 在最前, 然后 [user, assistant, user, assistant].
    // 总 5 messages, system @ index 0.
    // 期望 compaction 后 replaced_range = [0, ?] (? = tailStart 拍在剥掉 system 的子集上),
    // 不能是 [0, 1] (1 = system, 错位). 实际应该 = [0, 2] (tailStart 拍 4 / 2 = 2 后面
    // 留 2 条 tail 跟 summary + tail 起算).
    const filler = 'X'.repeat(3600); // 3600 chars / 4 = 900 token (大 content 触发)
    const systemPrompt = `You are deepwhale. ${filler.slice(0, 200)}`;
    const baseMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: filler },
      { role: 'assistant', content: 'first answer ' + filler.slice(0, 100) },
      { role: 'user', content: 'second ' + filler.slice(0, 50) },
      { role: 'assistant', content: 'second answer ' + filler.slice(0, 100) },
    ];

    const writer = new SessionWriter(testFile);
    await writer.open();
    const compactionState = new CompactionState(2);
    const cfg: CompactionConfig = {
      contextWindow: 1000, // 触发阈值 800 token (compactRatio 0.8)
      compactRatio: 0.8,
      tailKeepTokens: 100, // 拍小让 head 占大头
    };
    const config: AgentCompactionConfig = {
      ...cfg,
      protocol: 'openai',
      writer,
      state: compactionState,
    };
    const client = mockClient('summary text', 'final answer');

    const result = await runToolLoopWithCompaction(
      client,
      baseMessages,
      { registry: new ToolRegistry() },
      config,
      async () => 'summary text',
    );

    // ---- 1) 结果 messages 必须保留 caller 拼的 system prefix ----
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages[0]?.content).toBe(systemPrompt);

    // ---- 2) 读 JSONL 验证 replaced_range ----
    await writer.close();
    const reader = new SessionReader(testFile);
    const events = await reader.readAll();
    const compactionEvents = events.filter((e) => e.kind === 'compaction');
    expect(compactionEvents.length).toBe(1);

    const compactEv = compactionEvents[0];
    if (compactEv?.kind !== 'compaction') throw new Error('unreachable');
    // 拍板: replaced_range 拍的是 "剥掉 system 后的 tail" index (跟 session-adapter
    // 累积 JSONL 时 user/assistant/tool 累积 index 同空间). caller 拼的 system
    // 在 messages 数组 index 0, 但**不**算进 replaced_range.
    const [start, end] = compactEv.replaced_range;
    expect(start).toBe(0);
    // tailStart 应等于 (剥掉 system 后的 length - tail 数量). 5 messages 剥 1
    // system → 4 tail, tailKeepTokens=100 让最后 1-2 条留下.
    // 关键是 start=0 (跟 caller 拼 system 一致) 且 end < baseMessages.length - 1
    // (不能 = 4, 那意味着把 system 算进去了).
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThan(baseMessages.length - 1);

    // ---- 3) 关键不变量: replaced_range 不包含 caller system 那个 index ----
    // 即 end ≤ 4 (剥 system 后剩 4 条, max end = 4 = 4 之前; caller 拼 system
    // 在 index 0, 不在 [0, end] 范围内 — 因为剥完 system 后 tailStart 是相对
    // 剥后数组的).
    expect(end).toBeLessThanOrEqual(4);
  });

  it('D-6 P1-2: no system prefix → replaced_range still starts at 0 (baseline behavior preserved)', async () => {
    // 拍板: caller 不拼 system, 行为跟 1c-revive-2-D-5 cluster test 一致
    // (replaced_range 拍的是 caller messages 的 index, start=0).
    const filler = 'Y'.repeat(3600);
    const baseMessages: ChatMessage[] = [
      { role: 'user', content: filler },
      { role: 'assistant', content: 'first ' + filler.slice(0, 100) },
      { role: 'user', content: 'second ' + filler.slice(0, 50) },
      { role: 'assistant', content: 'second answer ' + filler.slice(0, 100) },
    ];

    const writer = new SessionWriter(testFile);
    await writer.open();
    const compactionState = new CompactionState(2);
    const config: AgentCompactionConfig = {
      contextWindow: 1000,
      compactRatio: 0.8,
      tailKeepTokens: 100,
      protocol: 'openai',
      writer,
      state: compactionState,
    };
    const client = mockClient('summary text', 'final answer');

    await runToolLoopWithCompaction(
      client,
      baseMessages,
      { registry: new ToolRegistry() },
      config,
      async () => 'summary text',
    );
    await writer.close();

    const reader = new SessionReader(testFile);
    const events = await reader.readAll();
    const compactionEvents = events.filter((e) => e.kind === 'compaction');
    expect(compactionEvents.length).toBe(1);
    const compactEv = compactionEvents[0];
    if (compactEv?.kind !== 'compaction') throw new Error('unreachable');
    const [start, end] = compactEv.replaced_range;
    expect(start).toBe(0);
    // 没 system prefix → end ≤ 3 (4 messages 剥 0 system → 4 tail, max end = 3)
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThanOrEqual(3);
  });

  it('D-6 P1-2: multi-line system prefix (2 system messages) also stripped', async () => {
    // 拍板: 多个连续 system message 都被剥掉, replaced_range 跟剥掉子集对齐.
    const filler = 'Z'.repeat(3600);
    const baseMessages: ChatMessage[] = [
      { role: 'system', content: 'persona A' },
      { role: 'system', content: 'persona B with more ' + filler.slice(0, 100) },
      { role: 'user', content: filler },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'a2' },
    ];

    const writer = new SessionWriter(testFile);
    await writer.open();
    const compactionState = new CompactionState(2);
    const config: AgentCompactionConfig = {
      contextWindow: 1000,
      compactRatio: 0.8,
      tailKeepTokens: 50,
      protocol: 'openai',
      writer,
      state: compactionState,
    };
    const client = mockClient('summary', 'final');

    const result = await runToolLoopWithCompaction(
      client,
      baseMessages,
      { registry: new ToolRegistry() },
      config,
      async () => 'summary',
    );

    // 结果必须保留 2 条 system prefix
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages[0]?.content).toBe('persona A');
    expect(result.messages[1]?.role).toBe('system');
    expect(result.messages[1]?.content?.startsWith('persona B')).toBe(true);

    // replaced_range 拍剥掉 system 后的子集
    await writer.close();
    const reader = new SessionReader(testFile);
    const events = await reader.readAll();
    const compactEv = events.find((e) => e.kind === 'compaction');
    if (compactEv?.kind !== 'compaction') throw new Error('unreachable');
    const [start, end] = compactEv.replaced_range;
    expect(start).toBe(0);
    // 6 messages 剥 2 system → 4 tail, max end = 3
    expect(end).toBeLessThanOrEqual(3);
  });
});
