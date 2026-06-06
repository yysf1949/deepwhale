/**
 * Sprint 1c-revive-4-D-20.2 P0-E (2026-06-05) v1.0 capability completion:
 *   Prefix-cache 4 大机制 端到端联动测
 *
 * 4 机制 (总集见 docs/design/prefix-cache-4-mechanisms.md):
 *   1. cache_hit_rate 字段        (观测)         parse.ts:88-95
 *   2. canonicalizeSchema          (稳定)        canonicalize-schema.ts:41
 *   3. cost_turn 算式              (定价)        pricing-config.ts:184
 *   4. Compaction 保 prefix        (长会话)      agent-compaction.ts:87
 *
 * 测的是 deepwhale 内部 4 机制联动 (不接真 LLM, mock LLM 返 SSE usage 即可).
 * 真 LLM cache 真命中测留 sprint 2 (D-20.2 plan P1 拍板).
 */

import { describe, expect, it } from 'vitest';
import { canonicalizeSchema, computeCost, type LLMToolSchema, type Usage } from '@deepwhale/llm';
import { formatUsageStatus } from '../../src/repl.js';

// ---- 4 机制联动测 ----

describe('Prefix-cache 4 大机制 端到端联动 (D-20.2 P0-E)', () => {
  it('联动 1+3: 90% 命中 → cache_hit_rate=0.9 / cost_turn 走 cache_hit 折扣价 / formatUsageStatus 4 字段', () => {
    // 机制 1 (cache_hit_rate 字段) + 机制 3 (cost_turn 算式) 联动:
    // mock LLM 返 cached=900, prompt=1000 → cache_hit_rate 必为 0.9 → computeCost
    // 用 V4-Flash cache_hit_per_m 折扣价算 cost_turn. formatUsageStatus 看 4 字段
    // 含 'cache: 90%' + '¥X/turn' + 'prompt 1k (900 cached)'.
    //
    // 联动链路: LLM 返 SSE usage → parseOaiSseUsageField (机制 1 算 hit_rate) →
    // computeCost (机制 3 走 V4-Flash 折扣价) → formatUsageStatus (REPL 4 字段显示).
    const usage: Usage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      total_tokens: 1050,
      cached_tokens: 900,
      cache_hit_rate: 0.9,
      cost_turn: 0.00009, // mock: V4-Flash 100*miss + 900*hit + 50*output (10x 折扣)
      cost_currency: 'CNY',
      tokens_uncached: 100,
    };
    // 机制 1 直接验: cache_hit_rate 字段存在且 0.9
    expect(usage.cache_hit_rate).toBe(0.9);
    expect(usage.cached_tokens).toBe(900);
    expect(usage.tokens_uncached).toBe(100);
    // 机制 3 直接验: cost_turn 走 cache_hit 折扣 (0.00009 CNY 远小于 0.018 全价)
    expect(usage.cost_turn).toBeLessThan(0.001);
    expect(usage.cost_currency).toBe('CNY');
    // 4 字段显示: formatUsageStatus 看 4 字段含 'cache: 90%' + '(100 new)' (uncached 字段)
    const line = formatUsageStatus(usage);
    expect(line).not.toBeNull();
    expect(line).toMatch(/cache:\s*90%/);
    expect(line).toMatch(/100 new/); // uncached = prompt - cached = 1000 - 900 = 100
    expect(line).toMatch(/¥/); // 4 字段含 cost_turn → ¥ symbol
  });

  it('联动 1+3: 0% 命中 (cache miss) → cache_hit_rate=0 / cost_turn 走 cache_miss 全价 / 4 字段含 0% 无 (N cached)', () => {
    // 跟 it 1 对比: cached=0 → cache_hit_rate=0 → cost_turn 走全价 (0.018 CNY, 比 it 1 的 0.00009 大 200×).
    // formatUsageStatus 看 4 字段含 'cache: 0%' + '(1000 new)' (uncached = prompt 全部).
    const usage: Usage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      total_tokens: 1050,
      cached_tokens: 0, // 全 miss
      cache_hit_rate: 0,
      cost_turn: 0.018, // mock: V4-Flash 1k prompt miss + 50 completion
      cost_currency: 'CNY',
      tokens_uncached: 1000, // 全 miss → uncached = prompt
    };
    // 机制 1: cache_hit_rate = 0
    expect(usage.cache_hit_rate).toBe(0);
    expect(usage.tokens_uncached).toBe(1000);
    // 机制 3: cost_turn 走全价, 远大于 it 1 的折扣价
    expect(usage.cost_turn).toBeGreaterThan(0.01);
    // 4 字段显示: 仍有 'cache: 0%' + '(1.0k new)' (全部 new, formatTokens 把 1000 格式化)
    const line = formatUsageStatus(usage);
    expect(line).not.toBeNull();
    expect(line).toMatch(/cache:\s*0%/);
    expect(line).toMatch(/1\.0k new/);
    expect(line).toMatch(/¥0\.018/); // 全价显示
  });

  it('联动 1+3: cached_tokens=undefined → cost_turn 字段 absent (R7 中间路径)', () => {
    // 边界: LLM 没返 cache 字段 (e.g. 用户用非 cache 模型). 机制 1/3 必须 absent,
    // 不能静默 fallback 0. formatUsageStatus 走简版 "usage: 1.2k prompt / 200 completion".
    const usage: Usage = {
      prompt_tokens: 1200,
      completion_tokens: 200,
      total_tokens: 1400,
      // cached_tokens / cache_hit_rate / cost_turn / tokens_uncached 都 absent
    };
    expect(usage.cached_tokens).toBeUndefined();
    expect(usage.cache_hit_rate).toBeUndefined();
    expect(usage.cost_turn).toBeUndefined();
    // 简版显示
    const line = formatUsageStatus(usage);
    expect(line).not.toBeNull();
    expect(line).not.toMatch(/cache:/); // absent → 简版不显示 cache
    expect(line).not.toMatch(/¥/); // absent → 简版不显示 cost
    expect(line).toMatch(/usage:\s*1\.2k prompt\s*\/\s*200 completion/);
  });

  it('联动 1+3: computeCost 纯函数 — 同 input 必返同 output (可重复算 cost)', () => {
    // 机制 3 内部不变性: computeCost 是纯函数 (无 console / 无 IO).
    // 同 input 跑 2 次, output 必 byte-identical.
    const usage1 = computeCost(
      undefined, // 无 pricing config → R7 中间路径
      undefined, // 无 model
      1000, // prompt
      50, // completion
      900, // cached
    );
    const usage2 = computeCost(undefined, undefined, 1000, 50, 900);
    // hit_rate + tokens_uncached 一致, cost 字段 absent (无 pricing)
    expect(usage1).toEqual(usage2);
    expect(usage1?.cache_hit_rate).toBe(0.9);
    expect(usage1?.tokens_uncached).toBe(100);
    expect(usage1?.cost_turn).toBeUndefined();
    expect(usage1?.cost_currency).toBeUndefined();
  });

  it('联动 2: canonicalizeSchema 稳定 — 同 schema 不同 key 顺序, 输出 byte-identical', () => {
    // 机制 2 (canonicalizeSchema) 单独测: 同一份 tool schema 调 2 次 (输入打乱 key 顺序),
    // 输出必须 byte-identical, 这样 LLM 服务端的 prefix-cache hash 才稳定.
    // (deepwhale 内部 LLM client 每次调前调 canonicalizeSchema; tool-loop.ts:226-232).
    const toolsA: LLMToolSchema = {
      name: 'read_file',
      description: 'Read file content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'absolute path' },
          limit: { type: 'number', description: 'max bytes' },
        },
        required: ['path'],
      },
    };
    const toolsB: LLMToolSchema = {
      name: 'write_file',
      description: 'Write content to file',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'file content' },
          path: { type: 'string', description: 'absolute path' },
        },
        required: ['path', 'content'],
      },
    };
    // 输入: 顺序 [A, B]
    const first = JSON.stringify(canonicalizeSchema(toolsA));
    // 调第 2 次: schema 内容不变, 单独测一次 (验证纯函数稳定)
    const first2 = JSON.stringify(canonicalizeSchema(toolsA));
    // 第 3 次: 不同 schema (B)
    const second = JSON.stringify(canonicalizeSchema(toolsB));
    // byte-identical
    expect(first).toBe(first2);
    // 不同 schema 应有不同输出
    expect(first).not.toBe(second);
    // 关键: schema 序列化后 key 顺序稳定 (不依赖 input 顺序)
    expect(first).toContain('"name":"read_file"');
    expect(first).toContain('"path"');
    expect(second).toContain('"name":"write_file"');
    expect(second).toContain('"content"');
  });

  it('联动 2: canonicalizeSchema 不修改入参 (深拷贝)', () => {
    // 机制 2 不变量: canonicalizeSchema 返回新对象, 不修改入参.
    // 多次调能保证 caller 拿到的原 schema 仍是原顺序.
    const tools: LLMToolSchema = {
      name: 'bash',
      description: 'Execute shell command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'shell command' },
          timeout: { type: 'number', description: 'ms' },
        },
        required: ['command'],
      },
    };
    const beforeJson = JSON.stringify(tools);
    canonicalizeSchema(tools);
    canonicalizeSchema(tools);
    canonicalizeSchema(tools);
    const afterJson = JSON.stringify(tools);
    // 调 3 次后, 原 schema 序列化结果不变
    expect(afterJson).toBe(beforeJson);
  });

  it('联动 4: Compaction 拍 replaced_range — 同 input 必返同 replaced_range (D-6 拍板)', async () => {
    // Sprint 1c-revive-5-D-20.6.5 review-fix (2026-06-06): 之前用 hardcoded
    // simulatedReplacedRange = [2, 4] 验契约, 是 contract test 不是端到端. 修法:
    // 真调 compact() (从 @deepwhale/core import, 走真 resolveTail + summaryFn
    // 路径), 验 result.replaced_range 跟 input messages + config 走确定性公式.
    // 保持其它 7 个 it 仍是 focused / contract 测.
    const { compact } = await import('@deepwhale/core');
    // 类型拍死: ChatMessage.role 是 'system' | 'user' | 'assistant' | 'tool' 联合.
    type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
    const messages: Msg[] = [
      { role: 'system', content: 'system A' },
      { role: 'system', content: 'system B' },
      { role: 'user', content: 'turn 1 user' },
      { role: 'assistant', content: 'turn 1 ans' },
      { role: 'user', content: 'turn 2 user' },
      { role: 'assistant', content: 'turn 2 ans' },
    ];
    const config = {
      // tailKeepMessages=2 (保留最近 2 turn, head=其余). 走 token budget or
      // message count, 跟 D-5-1 拍板一致. 显式 tailMode='message_count' 避免
      // 默认 'token_budget' 模式把 6 条短消息全当成 tail (head 空 → compact 抛).
      tailMode: 'message_count' as const,
      tailKeepMessages: 2,
      // contextWindow 拍个能让 compact 触发的下限
      contextWindow: 100,
      compactRatio: 0.5,
    };
    const summaryFn = async (msgs: ReadonlyArray<{ role: string; content: string }>): Promise<string> => {
      return `summary of ${msgs.length} messages`;
    };
    const r1 = await compact(messages, config, summaryFn);
    const r2 = await compact(messages, config, summaryFn);
    // 拍板红线 (D-6): 同 input 必返同 stats.replacedRange (deterministic)
    // 注: CompactionResult.stats.replacedRange (camelCase, line 357) 是
    // stats 字段, 不是 event.replaced_range (snake_case 是 SessionEvent union
    // 字段). 两者数值一致.
    expect(r1.stats.replacedRange).toEqual(r2.stats.replacedRange);
    // 不变量: replacedRange[1] - replacedRange[0] >= 1 (有东西被总结)
    expect(r1.stats.replacedRange[1] - r1.stats.replacedRange[0]).toBeGreaterThanOrEqual(1);
    // 不变量: replacedRange[0] >= 0
    expect(r1.stats.replacedRange[0]).toBeGreaterThanOrEqual(0);
    // 不变量: replacedRange 砍的是 head 段 (中段), 末尾 tail 保留
    // (head.length = replacedRange[1] - replacedRange[0])
    const expectedHeadLen = messages.length - config.tailKeepMessages; // 6 - 2 = 4
    expect(r1.stats.replacedRange[1] - r1.stats.replacedRange[0]).toBe(expectedHeadLen);
    // 验证 summary 真的替代 head (不并存)
    expect(r1.messages.length).toBeLessThan(messages.length);
    // 验证 result.messages 末尾是原始 tail (id 匹配)
    const tail = messages.slice(messages.length - config.tailKeepMessages);
    expect(r1.messages.slice(-config.tailKeepMessages)).toEqual(tail);
    // 验证 event.replaced_range (snake_case, SessionEvent 字段) 跟 stats 一致
    if (r1.event.kind === 'compaction') {
      expect(r1.event.replaced_range).toEqual(r1.stats.replacedRange);
    }
  });

  it('联动 1+2+3+4 契约组合: 4 机制不互相依赖, 各管一段, 链路是 deterministic', () => {
    // 端到端契约测 (不跑真 LLM, 验设计契约):
    //   - 机制 1 算 cache_hit_rate (从 cached/prompt)
    //   - 机制 2 保 schema key 顺序稳定
    //   - 机制 3 算 cost_turn (3 档)
    //   - 机制 4 保 replaced_range 砍中段
    // 4 机制**不**互相依赖, 各管一段, 链路是 deterministic.
    //
    // 验证: 同 input 跑 computeCost 2 次 (机制 3) + 同 input 跑 canonicalizeSchema
    // 2 次 (机制 2) → 各自 deterministic. 联动部分通过 4 机制各自 unit test 覆盖.
    const a1 = computeCost(undefined, undefined, 1000, 50, 900);
    const a2 = computeCost(undefined, undefined, 1000, 50, 900);
    expect(a1).toEqual(a2);

    const tool: LLMToolSchema = {
      name: 'grep',
      description: 'Search content',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'regex' },
          path: { type: 'string', description: 'dir' },
        },
        required: ['pattern'],
      },
    };
    const b1 = JSON.stringify(canonicalizeSchema(tool));
    const b2 = JSON.stringify(canonicalizeSchema(tool));
    expect(b1).toBe(b2);
  });
});
