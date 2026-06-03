/**
 * @deepwhale/llm — OpenAI-shape 协议解析层
 *
 * Sprint 1b.5 Step 2 抽出来: 之前这些 module-level fn 在 deepseek-client.ts 里,
 * Step 2 起 AnthropicClient (走 /anthropic endpoint, DeepSeek shim 返 OpenAI-shape)
 * 也需要复用, 抽到 parse.ts 当共享解析层.
 *
 * 设计原则:
 * - 纯函数, 零副作用 (无 console / 无 I/O)
 * - pricing/model 都是 optional, 缺时走 R7 中间路径 (base 2 字段, cost 字段 absent)
 * - 不假设 caller 是 deepseek / anthropic, 任何返 OpenAI-shape JSON 的协议都走这层
 *
 * 不在这层的:
 * - SSE 协议层 (data:/event:/id:/retry: 协议) — 留在 deepseek-client.ts:isSseDoneSentinel
 * - HTTP / fetch / retry — caller 负责
 * - request 编组 (ChatMessage → wire JSON) — 留 caller (toWireMessage 是 deepseek 私货)
 */

import type { ChatResult, ChatChunk, ModelId, ToolCall, Usage } from './types.js';
import { computeCost } from './pricing-config.js';
import type { PricingConfig } from './pricing-config.js';

/**
 * 解析 OAI chat completion 完整响应 JSON 为 ChatResult.
 * 返 null 表示响应结构无效 (缺 choices[0].message), caller 决定抛什么错.
 *
 * @param fallbackModel - 响应里没 model 字段时用的 fallback (避免 "unknown model" 传播)
 * @param pricing - 可选, 用于算 cost_turn + cost_currency. undefined 走 R7 中间路径.
 */
export function parseOaiChatCompletion(
  json: unknown,
  fallbackModel: ModelId,
  pricing?: PricingConfig,
): ChatResult | null {
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  const choices = obj['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const firstObj = first as Record<string, unknown>;
  const message = firstObj['message'];
  if (typeof message !== 'object' || message === null) return null;
  const msg = message as Record<string, unknown>;
  // 机制 3：reasoning_content 不暴露给 caller（session 内部如果要保留,sprint 1b 再加）
  // 这里直接忽略 reasoning_content 字段,只取 content
  const content = typeof msg['content'] === 'string' ? msg['content'] : '';

  // 解析 tool_calls
  let toolCalls: ToolCall[] | undefined;
  const rawTc = msg['tool_calls'];
  if (Array.isArray(rawTc) && rawTc.length > 0) {
    toolCalls = [];
    for (const tc of rawTc) {
      if (typeof tc !== 'object' || tc === null) continue;
      const tcObj = tc as Record<string, unknown>;
      const fn = tcObj['function'];
      if (typeof fn !== 'object' || fn === null) continue;
      const fnObj = fn as Record<string, unknown>;
      const name = typeof fnObj['name'] === 'string' ? fnObj['name'] : '';
      const argsStr = typeof fnObj['arguments'] === 'string' ? fnObj['arguments'] : '{}';
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argsStr);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // args 解析失败,留空对象。caller 看到 args={} 通常意味着 LLM 输出格式错误。
      }
      const id = typeof tcObj['id'] === 'string' ? tcObj['id'] : '';
      toolCalls.push({ id, name, args });
    }
  }

  // usage
  let usage: Usage | undefined;
  const rawUsage = obj['usage'];
  if (typeof rawUsage === 'object' && rawUsage !== null) {
    const u = rawUsage as Record<string, unknown>;
    const prompt = typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0;
    const completion = typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0;
    const total = typeof u['total_tokens'] === 'number' ? u['total_tokens'] : prompt + completion;
    const cached =
      typeof u['prompt_cache_hit_tokens'] === 'number' ? u['prompt_cache_hit_tokens'] : undefined;
    usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
    if (cached !== undefined) usage.cached_tokens = cached;
    // Sprint 1b.5: 改用 pricing-config.computeCost, 接 PricingConfig + ModelId,
    // 返 CostBreakdownResult (undefined / base 2 字段 / 完整 4 字段 3 种).
    // 公式不变 (V4-Flash pricing 在 default.toml 跟旧 hardcode 一致).
    // parseOaiChatCompletion 是 module-level, 从参数接 pricing + fallbackModel.
    const breakdown = computeCost(pricing, fallbackModel, prompt, completion, cached);
    if (breakdown !== undefined) {
      usage.cache_hit_rate = breakdown.cache_hit_rate;
      if (breakdown.cost_turn !== undefined) usage.cost_turn = breakdown.cost_turn;
      if (breakdown.cost_currency !== undefined) usage.cost_currency = breakdown.cost_currency;
      usage.tokens_uncached = breakdown.tokens_uncached;
    }
  }

  // finish_reason
  const rawFr = firstObj['finish_reason'];
  const finishReason: ChatResult['finish_reason'] =
    rawFr === 'stop' || rawFr === 'tool_calls' || rawFr === 'length' || rawFr === 'content_filter'
      ? rawFr
      : undefined;

  const modelRaw = obj['model'];
  const model: ModelId = typeof modelRaw === 'string' ? (modelRaw as ModelId) : fallbackModel;

  const result: ChatResult = { model, content };
  if (toolCalls) result.tool_calls = toolCalls;
  if (usage) result.usage = usage;
  if (finishReason) result.finish_reason = finishReason;
  return result;
}

/**
 * 判断 SSE event raw text 是否是 OAI 协议的 [DONE] 终止 marker.
 * 在 parseSseEvent 之前调用, 确保 [DONE] sentinel 不被算作 parse failure
 * (P2-D follow-up: 之前会被静默归入 sseParseFailures++, 正常流也刷 warn).
 *
 * 容忍: data: [DONE] / data:[DONE] / 多个 data: 行 / 前后空白 / CRLF.
 */
export function isSseDoneSentinel(eventRaw: string): boolean {
  // 扫所有 data: 行,看是否有且只有 [DONE]
  let sawDataLine = false;
  for (const ln of eventRaw.split('\n')) {
    if (!ln.startsWith('data:')) continue;
    const payload = ln.slice(5).trimStart();
    if (payload === '[DONE]') {
      sawDataLine = true;
    } else {
      // [DONE] event 不应混入别的 data
      return false;
    }
  }
  return sawDataLine;
}

/**
 * 解析单个 SSE event (`data: {...}\n`).
 * 返回 null 表示跳过该 event (heartbeat / comment / 解析失败).
 *
 * 注意:[DONE] sentinel 由 isSseDoneSentinel 在调用方提前拦截,
 * 本函数不再处理,避免重复路径让 caller 误算 parse failure.
 */
export function parseSseEvent(
  eventRaw: string,
  pricing?: PricingConfig,
  model?: ModelId,
): ChatChunk | null {
  const lines = eventRaw.split('\n');
  const dataLines: string[] = [];
  for (const ln of lines) {
    if (ln.startsWith('data:')) {
      dataLines.push(ln.slice(5).trimStart());
    }
    // event:/id:/retry: 忽略
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join('\n');
  // [DONE] sentinel 已被 isSseDoneSentinel 提前拦截,这里不再判断。
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null; // 解析失败静默跳过（Sprint 1a 简化,Sprint 1b 加重试日志）
  }
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;

  // P1 fix (2026-06-03): 之前 usage 解析只在 choices=[] 分支走, 但 OAI/DeepSeek
  // stream 协议允许最后一个 chunk 同时带 choices (e.g. {delta:{}, finish_reason:"stop"})
  // 和顶层 usage, 此时 usage 会被丢弃 → 状态栏拿不到 cache/cost 数据。
  // 改成先解析顶层 usage, 任何 chunk 类型都挂上。
  // usage-only chunk (choices=[]) 路径保留作为 fallback, 服务端历史兼容。
  // Sprint 1b.5: 把 pricing + model 透传给 parseSseUsageField.
  const topLevelUsage = parseSseUsageField(obj, pricing, model);

  const choices = obj['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    if (topLevelUsage !== undefined) {
      return { delta: {}, usage: topLevelUsage };
    }
    return null;
  }
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const firstObj = first as Record<string, unknown>;
  const rawDelta = firstObj['delta'];
  if (typeof rawDelta !== 'object' || rawDelta === null) return null;
  const deltaObj = rawDelta as Record<string, unknown>;

  // 机制 3：reasoning_content 不暴露
  const content = typeof deltaObj['content'] === 'string' ? deltaObj['content'] : undefined;

  // tool_calls 增量(DeepSeek V4 stream 一次性给完整,这里当 full 处理)
  let toolCalls: ToolCall[] | undefined;
  const rawTc = deltaObj['tool_calls'];
  if (Array.isArray(rawTc) && rawTc.length > 0) {
    toolCalls = [];
    for (const tc of rawTc) {
      if (typeof tc !== 'object' || tc === null) continue;
      const tcObj = tc as Record<string, unknown>;
      const fn = tcObj['function'];
      if (typeof fn !== 'object' || fn === null) continue;
      const fnObj = fn as Record<string, unknown>;
      const name = typeof fnObj['name'] === 'string' ? fnObj['name'] : '';
      const argsStr = typeof fnObj['arguments'] === 'string' ? fnObj['arguments'] : '{}';
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argsStr);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        /* leave {} */
      }
      const id = typeof tcObj['id'] === 'string' ? tcObj['id'] : '';
      const idx = typeof tcObj['index'] === 'number' ? tcObj['index'] : 0;
      // Sprint 1a 简化：按 index 收集,最终输出合并
      toolCalls.push({ id: id || `${idx}`, name, args });
    }
  }

  // finish_reason
  const rawFr = firstObj['finish_reason'];
  const finishReason: ChatResult['finish_reason'] =
    rawFr === 'stop' || rawFr === 'tool_calls' || rawFr === 'length' || rawFr === 'content_filter'
      ? rawFr
      : undefined;

  const delta: { content?: string; tool_calls?: readonly ToolCall[] } = {};
  if (content !== undefined) delta.content = content;
  if (toolCalls !== undefined) delta.tool_calls = toolCalls;
  const chunk: ChatChunk = { delta };
  if (finishReason) chunk.finish_reason = finishReason;
  // P1 fix (2026-06-03): 顶层 usage 在 choices 路径同样挂上,
  // 让 final chunk (带 finish_reason="stop" + 顶层 usage) 能把 usage 透出。
  if (topLevelUsage !== undefined) chunk.usage = topLevelUsage;
  return chunk;
}

/**
 * 从 SSE event JSON 顶层 usage 字段解析出标准化的 Usage 结构,
 * 顺手算 Sprint 1b 的 cache_hit_rate / cost_turn / tokens_uncached.
 *
 * 返回 undefined 表示该 event 不带 usage (OAI 标准: 只在 stream 末尾出现).
 *
 * P1 fix (2026-06-03): 抽出避免在 choices=[] 和 choices=[...] 两条路径上重复解析。
 */
export function parseSseUsageField(
  obj: Record<string, unknown>,
  pricing?: PricingConfig,
  model?: ModelId,
): Usage | undefined {
  const rawUsage = obj['usage'];
  if (typeof rawUsage !== 'object' || rawUsage === null) return undefined;
  const u = rawUsage as Record<string, unknown>;
  const prompt = typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0;
  const completion = typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0;
  const total =
    typeof u['total_tokens'] === 'number' ? u['total_tokens'] : prompt + completion;
  const cached =
    typeof u['prompt_cache_hit_tokens'] === 'number'
      ? u['prompt_cache_hit_tokens']
      : undefined;
  const usage: Usage = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
  };
  if (cached !== undefined) usage.cached_tokens = cached;
  // Sprint 1b.5: 改用 pricing-config.computeCost, 公式不变 (default.toml V4-Flash).
  // parseSseUsageField 是 module-level fn, 不持有 this.pricing. pricing/model 可选
  // — undefined 时走 R7 中间路径 (base 2 字段, cost 字段 absent, 不静默 fallback).
  // model undefined 时也安全: computeCost 内部 pricing.models[model] 返 undefined
  // → 走 base 2 字段分支, cost 字段 absent. 不需要 throw.
  const breakdown = computeCost(pricing, model, prompt, completion, cached);
  if (breakdown !== undefined) {
    usage.cache_hit_rate = breakdown.cache_hit_rate;
    if (breakdown.cost_turn !== undefined) usage.cost_turn = breakdown.cost_turn;
    if (breakdown.cost_currency !== undefined) usage.cost_currency = breakdown.cost_currency;
    usage.tokens_uncached = breakdown.tokens_uncached;
  }
  return usage;
}
