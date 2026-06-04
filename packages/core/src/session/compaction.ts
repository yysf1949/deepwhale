/**
 * Session Compaction — Sprint 1c-revive-2-D-5-1
 *
 * 当 LLM context token 数逼近 window 上限时, 把前面的对话
 * 总结成 1 条 summary, 替换 messages 中间段, 避免 OOM/超限.
 *
 * 拍板来源 (research/03_reasonix.md compact.go + research/04_pi.md session_before_compact):
 *   - 触发条件: promptTokens >= window * compactRatio (默认 0.8, 拍板 source: Reasonix)
 *   - Tail 边界: 保留最近 N 条消息 (D-5-1 = message count, D-5-3 升级到 token budget)
 *   - Death-loop 防护: 连续 2 次失败 → latch (D-5-2 拍板)
 *   - Compaction = 唯一 cache-reset point (改 system prompt 拍板要同步 review)
 *
 * D-5-1 范围 (本 commit):
 *   - 基础 trigger (shouldCompact / estimateTokens)
 *   - replace (compact 函数 + 'compaction' SessionEvent)
 *   - summary 注入: 走 LLM 拍板, 这里只接 summaryFn callback
 *   - 测: shouldCompact 边界 / compact 替换 / event kind
 *
 * D-5-2 拍板: stuck latch (连续 2 次失败 → 暂停 + 拍板)
 * D-5-3 拍板: tail token budget 替代 message count
 *
 * @module @deepwhale/core/session/compaction
 */

import type { SessionEvent } from './jsonl.js';

/**
 * ChatMessage 本地 type 拍板 (跟 tool-loop.ts / session-adapter.ts 拍板一致).
 *
 * @core 不能 import @llm (tsconfig 没 reference, 会循环).
 * 拍板: structural typing — 拍成最小可用形态, 跟 @llm ChatMessage 形状一致.
 * 若 @llm ChatMessage 加字段, 这里需同步 (Sprint 1+ 抽 brand-typed union 时再 review).
 *
 * 字段:
 *   - role: system | user | assistant | tool
 *   - content: 文本
 *   - tool_calls?: assistant 携带
 *   - tool_call_id?: tool 消息 echo
 *   - name?: tool 消息携带
 */
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly args: Record<string, unknown>;
  }>;
  tool_call_id?: string;
  name?: string;
};

/** Compaction 拍板配置 */
export interface CompactionConfig {
  /** 模型的 context window (token 数). 0 = 不触发 (Sprint 1c.5 拍板: 0 关闭) */
  readonly contextWindow: number;
  /** 触发阈值 = contextWindow * compactRatio. 默认 0.8 (Reasonix 拍板) */
  readonly compactRatio?: number;
  /** 保留最后 N 条消息不被总结. 默认 4 (system + user + assistant + tool ≈ 4-turn) */
  readonly tailKeepMessages?: number;
}

export const COMPACTION_DEFAULTS = {
  compactRatio: 0.8,
  tailKeepMessages: 4,
} as const;

/**
 * 估算 messages 的 token 数.
 *
 * Sprint 1c.5 拍板: 不引入 tiktoken 等依赖, 用 char/4 粗估.
 * 准确度对 compaction 触发点足够 (0.8 阈值留 20% buffer).
 *
 * 估算口径:
 *   - role + content 全算
 *   - tool_calls 走 JSON.stringify 后 char/4
 *   - 工具调用 id/name 算 ~10 token 额外
 */
export function estimateTokens(messages: ReadonlyArray<ChatMessage>): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.role.length + 1; // "role:"
    chars += m.content.length;
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        chars += tc.id.length + tc.name.length + JSON.stringify(tc.args).length + 10;
      }
    }
    if (m.tool_call_id) chars += m.tool_call_id.length;
    if (m.name) chars += m.name.length;
    chars += 4; // 消息边界 + role token 开销
  }
  return Math.ceil(chars / 4);
}

/** 合并 config + defaults, 算出有效触发阈值 + tail */
export function resolveCompactionConfig(config: CompactionConfig): {
  readonly contextWindow: number;
  readonly compactRatio: number;
  readonly tailKeepMessages: number;
  readonly threshold: number;
} {
  const compactRatio = config.compactRatio ?? COMPACTION_DEFAULTS.compactRatio;
  const tailKeepMessages = config.tailKeepMessages ?? COMPACTION_DEFAULTS.tailKeepMessages;
  return {
    contextWindow: config.contextWindow,
    compactRatio,
    tailKeepMessages,
    threshold: Math.floor(config.contextWindow * compactRatio),
  };
}

/**
 * 拍板: 当前 messages 是否该 compact.
 *
 * 规则:
 *   - contextWindow = 0 → 永远不 (拍板关闭)
 *   - estimated tokens >= threshold → true
 *   - messages 数 <= tailKeepMessages → false (没东西可总结)
 */
export function shouldCompact(
  messages: ReadonlyArray<ChatMessage>,
  config: CompactionConfig,
): boolean {
  if (config.contextWindow <= 0) return false;
  const resolved = resolveCompactionConfig(config);
  if (messages.length <= resolved.tailKeepMessages) return false;
  return estimateTokens(messages) >= resolved.threshold;
}

/** Compaction 拍板结果 */
export interface CompactionResult {
  /** 替换后的 messages (中间段被 1 条 summary 替代) */
  readonly messages: ReadonlyArray<ChatMessage>;
  /** 写入 JSONL 的 compaction event (供 SessionWriter.append 用) */
  readonly event: SessionEvent;
  /** 触发的统计 (供上层日志/UI) */
  readonly stats: {
    readonly beforeTokens: number;
    readonly afterTokens: number;
    readonly beforeMessages: number;
    readonly afterMessages: number;
    readonly replacedRange: readonly [number, number];
  };
}

/**
 * Summary 生成函数.
 *
 * 接 LLM 拍板 (caller 决定用哪个 client + system prompt).
 * 拍板不变量: 收到被总结的 messages, 返回 summary text.
 */
export type SummarizeFn = (
  messagesToSummarize: ReadonlyArray<ChatMessage>,
) => Promise<string>;

/**
 * 执行 compaction.
 *
 * 流程:
 *   1. 拍定 [head, tail) 中间段要被总结
 *   2. 调 summaryFn 生成 summary text
 *   3. 拼成新 messages: [...head, { role: 'system', content: summary }, ...tail]
 *   4. 拍 'compaction' event: { summary, replaced_range: [head_end, tail_start) }
 *   5. 返回 CompactionResult (不写盘, 由 caller append event)
 */
export async function compact(
  messages: ReadonlyArray<ChatMessage>,
  config: CompactionConfig,
  summaryFn: SummarizeFn,
  options: { now?: () => number } = {},
): Promise<CompactionResult> {
  const resolved = resolveCompactionConfig(config);
  const tailKeep = resolved.tailKeepMessages;
  const now = options.now ?? (() => Date.now());

  if (messages.length <= tailKeep) {
    throw new Error(
      `compaction: messages (${messages.length}) <= tailKeep (${tailKeep}), nothing to compact`,
    );
  }

  const head = messages.slice(0, messages.length - tailKeep);
  const tail = messages.slice(messages.length - tailKeep);
  const replacedRange: readonly [number, number] = [0, head.length];

  const summaryText = await summaryFn(head);

  // 拼新 messages: 1 条 system 替代中间段
  const summaryMessage: ChatMessage = {
    role: 'system',
    content: `[Session compaction summary]\n${summaryText}`,
  };
  const newMessages: ReadonlyArray<ChatMessage> = [...head, summaryMessage, ...tail];

  const event: SessionEvent = {
    kind: 'compaction',
    ts: now(),
    summary: summaryText,
    replaced_range: replacedRange,
    meta: {
      before_tokens: estimateTokens(messages),
      after_tokens: estimateTokens(newMessages),
      before_messages: messages.length,
      after_messages: newMessages.length,
    },
  };

  return {
    messages: newMessages,
    event,
    stats: {
      beforeTokens: estimateTokens(messages),
      afterTokens: estimateTokens(newMessages),
      beforeMessages: messages.length,
      afterMessages: newMessages.length,
      replacedRange,
    },
  };
}
