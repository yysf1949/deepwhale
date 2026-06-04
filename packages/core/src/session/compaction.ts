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
  /**
   * Tail 保留策略 (Sprint 1c-revive-2-D-5-3):
   * - 'message_count' (D-5-1 拍板): 保留最后 N 条消息, 用 tailKeepMessages (默认 4)
   * - 'token_budget'  (D-5-3 拍板, **默认**): 保留最后 N token 消息, 用 tailKeepTokens (默认 500)
   *
   * Reasonix compact.go:271-289 拍板 source: tail 边界按 token budget 而非 message count,
   * 拍板让 tail 大小不依赖消息数, 长 tool result 不被截断.
   */
  readonly tailMode?: 'message_count' | 'token_budget';
  /** 保留最后 N 条消息不被总结. 默认 4 (仅 tailMode='message_count' 用) */
  readonly tailKeepMessages?: number;
  /** 保留最后 N token 消息不被总结. 默认 500 (仅 tailMode='token_budget' 用) */
  readonly tailKeepTokens?: number;
  /**
   * 连续失败 latch 阈值 (Sprint 1c-revive-2-D-5-2):
   * 连续 N 次 compact 失败 → 自动暂停 + 写 paused event. 默认 2 (Reasonix 拍板).
   * 防止 death loop: LLM context 涨 → compact 失败 → 再涨 → 再 compact → 失败...
   * 设为 0 / undefined = 不 latch (走纯失败重试, 不推荐).
   */
  readonly pauseAfterFailures?: number;
}

export const COMPACTION_DEFAULTS = {
  compactRatio: 0.8,
  tailMode: 'token_budget' as const, // D-5-3 拍板: 默认走 token budget
  tailKeepMessages: 4,
  tailKeepTokens: 500,
  pauseAfterFailures: 2,
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

/**
 * 解析 tail 边界 (Sprint 1c-revive-2-D-5-3):
 * 拍板 'message_count' 走 tailKeepMessages, 'token_budget' 走 tailKeepTokens.
 *
 * 返 { tailStart, head }:
 *   - tailStart: tail 段的起始 index (head = messages[0..tailStart))
 *   - tail: messages[tailStart..] (>= 1 条, 拍板不变量)
 *
 * 不变量: messages.length > 0 时 tail 至少 1 条
 *         messages.length == 0 时 tailStart = 0, tail = []
 *
 * Reasonix compact.go:271-289 拍板 source: tailStart 算到 token >= tailKeepTokens,
 * 拍板让 tail 大小跟 message 数量解耦.
 */
export function resolveTail(
  messages: ReadonlyArray<ChatMessage>,
  config: CompactionConfig,
): { readonly tailStart: number; readonly head: ReadonlyArray<ChatMessage>; readonly tail: ReadonlyArray<ChatMessage> } {
  const tailMode = config.tailMode ?? COMPACTION_DEFAULTS.tailMode;
  if (messages.length === 0) {
    return { tailStart: 0, head: [], tail: [] };
  }
  if (tailMode === 'message_count') {
    const n = config.tailKeepMessages ?? COMPACTION_DEFAULTS.tailKeepMessages;
    const tailStart = Math.max(0, messages.length - n);
    return {
      tailStart,
      head: messages.slice(0, tailStart),
      tail: messages.slice(tailStart),
    };
  }
  // tailMode === 'token_budget' (D-5-3 默认): 从末尾往前累 token, 达到 budget 停
  const budget = config.tailKeepTokens ?? COMPACTION_DEFAULTS.tailKeepTokens;
  let accTokens = 0;
  let tailStart = messages.length; // 默认全 tail
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    const mTokens = estimateTokens([m]);
    if (accTokens + mTokens > budget && i < messages.length - 1) {
      // 已超 budget 且还有 1 条保底 (i < messages.length - 1 保证 tail 至少 1)
      break;
    }
    accTokens += mTokens;
    tailStart = i;
  }
  return {
    tailStart,
    head: messages.slice(0, tailStart),
    tail: messages.slice(tailStart),
  };
}

/** 合并 config + defaults, 算出有效触发阈值 + tail */
export function resolveCompactionConfig(config: CompactionConfig): {
  readonly contextWindow: number;
  readonly compactRatio: number;
  readonly tailMode: 'message_count' | 'token_budget';
  readonly tailKeepMessages: number;
  readonly tailKeepTokens: number;
  readonly pauseAfterFailures: number;
  readonly threshold: number;
} {
  const compactRatio = config.compactRatio ?? COMPACTION_DEFAULTS.compactRatio;
  const tailMode = config.tailMode ?? COMPACTION_DEFAULTS.tailMode;
  const tailKeepMessages = config.tailKeepMessages ?? COMPACTION_DEFAULTS.tailKeepMessages;
  const tailKeepTokens = config.tailKeepTokens ?? COMPACTION_DEFAULTS.tailKeepTokens;
  const pauseAfterFailures = config.pauseAfterFailures ?? COMPACTION_DEFAULTS.pauseAfterFailures;
  return {
    contextWindow: config.contextWindow,
    compactRatio,
    tailMode,
    tailKeepMessages,
    tailKeepTokens,
    pauseAfterFailures,
    threshold: Math.floor(config.contextWindow * compactRatio),
  };
}

/**
 * Compaction 状态机 (Sprint 1c-revive-2-D-5-2):
 * 跟踪连续失败次数, 达到阈值 → latch → 暂停 + 写 paused event.
 *
 * 不变量:
 *   - consecutiveFailures 永不为负
 *   - paused === true ⇒ consecutiveFailures >= pauseThreshold (且未重置)
 *   - 1 次成功 → consecutiveFailures = 0 (无论之前几次失败)
 *   - 1 次失败 → consecutiveFailures++; 若 >= pauseThreshold → paused = true
 *
 * 重置 latch:
 *   - new CompactionState() 重新初始化
 *   - caller 决定何时调用 (e.g. 用户改 summaryFn / 改配置)
 */
export class CompactionState {
  consecutiveFailures = 0;
  paused = false;
  lastError: string | null = null;

  constructor(private readonly pauseThreshold: number) {
    if (pauseThreshold < 0) {
      throw new Error(`CompactionState: pauseThreshold must be >= 0, got ${pauseThreshold}`);
    }
  }

  /** 1 次成功 → reset 失败计数 + unpause */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.paused = false;
    this.lastError = null;
  }

  /**
   * 1 次失败 → 计数 +1, 达到阈值 → latch.
   * 返 true 表示本次失败触发了 latch (caller 该写 paused event).
   */
  recordFailure(error: Error): boolean {
    this.consecutiveFailures += 1;
    this.lastError = error.message;
    if (this.consecutiveFailures >= this.pauseThreshold && !this.paused) {
      this.paused = true;
      return true;
    }
    return false;
  }

  /** 该不该尝试 compact (paused → false) */
  shouldAttempt(): boolean {
    return !this.paused;
  }

  /** Caller 主动重置 latch (e.g. 用户改配置后) */
  reset(): void {
    this.consecutiveFailures = 0;
    this.paused = false;
    this.lastError = null;
  }
}

/**
 * Latched compact (Sprint 1c-revive-2-D-5-2):
 * 把 shouldCompact + compact + latch 拍成 1 个函数.
 *
 * 拍板:
 *   - paused → 返 null (不尝试, 不调 summaryFn, 不写 event)
 *   - 不该 compact → 返 null
 *   - compact 成功 → recordSuccess, 返 { kind: 'ok', result, event }
 *   - compact 失败 → recordFailure
 *     - 触发 latch → 返 { kind: 'latched', error, pausedEvent }
 *     - 未触发 latch → 抛错给 caller
 *
 * 不变量: paused 时**不**调 summaryFn (避免 LLM 浪费 token).
 */
export type LatchedCompactResult =
  | { readonly kind: 'ok'; readonly result: CompactionResult; readonly event: SessionEvent }
  | {
      readonly kind: 'latched';
      readonly error: Error;
      readonly pausedEvent: SessionEvent;
      readonly consecutiveFailures: number;
    };

export async function runCompactionWithLatch(
  messages: ReadonlyArray<ChatMessage>,
  config: CompactionConfig,
  summaryFn: SummarizeFn,
  state: CompactionState,
  options: { now?: () => number } = {},
): Promise<LatchedCompactResult | null> {
  // 拍板 1: latch paused → 直接返 null (不调 summaryFn)
  if (!state.shouldAttempt()) {
    return null;
  }

  // 拍板 2: 不该 compact → 返 null
  if (!shouldCompact(messages, config)) {
    return null;
  }

  const now = options.now ?? (() => Date.now());

  try {
    const result = await compact(messages, config, summaryFn, { now });
    state.recordSuccess();
    return { kind: 'ok', result, event: result.event };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const latched = state.recordFailure(error);
    if (latched) {
      const pauseThreshold = state.consecutiveFailures;
      const pausedEvent: SessionEvent = {
        kind: 'compaction_paused',
        ts: now(),
        consecutive_failures: pauseThreshold,
        reason: `compaction failed ${pauseThreshold} times consecutively; auto-paused to prevent death loop`,
        last_error: error.message,
        meta: {
          context_window: config.contextWindow,
          messages_count: messages.length,
        },
      };
      return { kind: 'latched', error, pausedEvent, consecutiveFailures: pauseThreshold };
    }
    // 未触发 latch: 抛给 caller, caller 决定怎么处理 (e.g. retry / 改 summaryFn)
    throw err;
  }
}

/**
 * 拍板: 当前 messages 是否该 compact.
 *
 * 规则:
 *   - contextWindow = 0 → 永远不 (拍板关闭)
 *   - messages 数 == 0 → false (没东西可 compact)
 *   - resolveTail 后 head 为空 → false (tail 已占满, 总结不掉什么)
 *   - estimated tokens >= threshold → true
 */
export function shouldCompact(
  messages: ReadonlyArray<ChatMessage>,
  config: CompactionConfig,
): boolean {
  if (config.contextWindow <= 0) return false;
  if (messages.length === 0) return false;
  const resolved = resolveCompactionConfig(config);
  if (estimateTokens(messages) < resolved.threshold) return false;
  // D-5-3: 走 resolveTail 看 head 是否为空, 避免"全 tail 没东西总结"白调 summary
  const { head } = resolveTail(messages, config);
  return head.length > 0;
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
  const now = options.now ?? (() => Date.now());

  // D-5-3: 走 resolveTail 拍 tail 边界 (token budget 或 message count)
  const { tailStart, head, tail } = resolveTail(messages, config);
  if (head.length === 0) {
    throw new Error(
      `compaction: resolveTail produced empty head (messages=${messages.length}, tailMode=${resolved.tailMode}), nothing to compact`,
    );
  }

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
      tail_mode: resolved.tailMode,
      tail_keep_messages: resolved.tailMode === 'message_count' ? resolved.tailKeepMessages : undefined,
      tail_keep_tokens: resolved.tailMode === 'token_budget' ? resolved.tailKeepTokens : undefined,
      tail_start: tailStart,
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
