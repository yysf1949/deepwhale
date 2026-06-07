/**
 * REPL session / usage-status utilities — Sprint 1c-revive-3-D-29.1.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1b: 把 usage 翻译成人类可读的一行 status, 写到 stderr (不污染 stdout 流式输出).
 *   Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑): 增 EMA
 *     平滑闭包 state — appendUsageStatus 每 turn in-place 更新, formatUsageStatus 读
 *     ema 显示 (avg NN%). 跨 turn 累积, 闭包内 mutable, 不持久化 (session reload 后
 *     sampleCount 重置为 0, 避免误导 — user 看到 avg 段消失就知道 reload 过了).
 *
 * 拍板 (D-29.1.2):
 *   - 文件: `repl-session.ts` (跟 `repl-confirm.ts` / `repl-signal-coordinator.ts` 同
 *     kebab-case 工厂形态命名, 本次抽 usage-status 三件套, 后续 D-29.1.5 可能扩展到
 *     session loading / state 持久化).
 *   - 公共 API 0 改: repl.ts re-export `formatUsageStatus` / `appendUsageStatus` /
 *     `type UsageEmaState` 跟现状 1:1, src/index.ts / modes/print.ts / modes/tui.ts /
 *     test/unit/usage-ema.test.ts 4 caller import path 不变.
 *   - 行为 1:1: formatUsageStatus 输出字符串逐字保持, appendUsageStatus in-place
 *     update 顺序 (update ema → format → write) 保持. 旧 caller 不传 emaState 用
 *     默认 `{ sampleCount: 0 }` 行为兼容 (不显示 avg 段).
 *   - 本文件**不**抽 session loading / state 持久化 (Sprint 1a 那段 L250-263 还在
 *     repl.ts 闭包内, 跟 startRepl 强耦合, 留给 D-29.1.5).
 *
 * 拍板 (D-29.1.2 §out of scope):
 *   - 不抽 SessionReader / SessionWriter 构造 (L250-251) — 跟 startRepl 闭包
 *     强耦合, 抽需要拆出 loadSessionOptions factory, 收益小, 留给 D-29.1.5.
 *   - 不动 /verify / /help / /exit dispatcher (L437-479) — 那是 6afccc8 slash
 *     builtin 红线, 留给 D-29.1.4.
 *   - 不动 runAgentTurn 主体 (L618-753) — 留给 D-29.1.5.
 */

import type { Usage } from '@deepwhale/llm';

/**
 * EMA 平滑 state (Sprint 1c-revive-2-D-21.1).
 *
 * - `hitRateEMA`: 过去 5-turn 滚动平均 (α=0.5 平滑). undefined = cold start, 第一次
 *   sample 直接赋值. 跨 turn 累积, 闭包内 mutable, 不持久化.
 * - `sampleCount`: 已 sample 的 turn 数. `sampleCount < 3` 时不显示 (avg) 段 (样本
 *   太少, 趋势没意义). 跟 `hitRateEMA` 一起被 appendUsageStatus in-place 更新.
 */
export interface UsageEmaState {
  hitRateEMA?: number;
  sampleCount: number;
}

/** 默认 (空) EMA state — 旧 caller 不传 emaState 时用, 行为兼容. */
const EMPTY_EMA: UsageEmaState = { sampleCount: 0 };

/**
 * 把 usage 翻译成人类可读的一行 status 字符串.
 *
 * 显示规则 (Hermes footer 教训应用 — 多字段同值时去冗余):
 * - 满 usage (有 cached_tokens) → 完整 4 字段: cache: 90% | ¥0.05/turn | prompt 1.2k (1.1k cached)
 * - 无 cached_tokens → 简化为: usage: 1.2k prompt / 200 completion
 *   (不打 cache% / cost, 避免没数据时显示 0% 误导)
 * - 无 usage → 完全不打印 (LLM 没返 usage 时不污染 stderr)
 *
 * Sprint 1c 抽 pricing 到 config.toml, 此函数签名不变。
 *
 * Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
 * 增 emaState 形参. 形参 hitRateEMA 是过去 5-turn 滚动平均 (α=0.5 平滑).
 * 输出: `cache: 90% (avg 85%)` — per-turn 数字 + 趋势均值并列. user 视角:
 * 1) 知道当 turn 真值, 2) 知道趋势 (avg 不会跟着单 turn 抖动).
 * 边界:
 *   - sampleCount < 3: 不显示 (avg) 段 (样本太少, 趋势没意义, 不污染)
 *   - sampleCount >= 3: 显示 (avg NN%)
 *   - ema 永远存在 (闭包外, startRepl 持有), 跨 turn 累积
 * 行为兼容: 旧 caller 不传 emaState 用默认 { hitRateEMA: undefined, sampleCount: 0 }
 * → 行为跟改前一致 (不显示 avg 段). 现有单测 (formatUsageStatus) 不破.
 */
export function formatUsageStatus(
  usage: Usage | undefined,
  emaState: UsageEmaState = EMPTY_EMA,
): string | null {
  if (usage === undefined) return null;
  const { prompt_tokens, completion_tokens } = usage;
  // 无 cached_tokens: 简版
  if (usage.cached_tokens === undefined) {
    return `usage: ${formatTokens(prompt_tokens)} prompt / ${formatTokens(completion_tokens)} completion`;
  }
  // 满 usage: 完整 status
  const hitRatePct = ((usage.cache_hit_rate ?? 0) * 100).toFixed(0);
  const uncached = formatTokens(usage.tokens_uncached ?? prompt_tokens);
  // Sprint 1c-revive-2-D-21.1: EMA 平滑尾部段. sampleCount >= 3 才显示 avg
  // (样本太少趋势不稳). 不更新 caller state, 只读 (state update 在
  // appendUsageStatus, 这是纯函数好测).
  const avgSegment = emaState.sampleCount >= 3 && emaState.hitRateEMA !== undefined
    ? ` (avg ${(emaState.hitRateEMA * 100).toFixed(0)}%)`
    : '';
  // Sprint 1b.5 Step 2.5 (F5 拍板, review 2026-06-03 找到): cost_turn/cost_currency 都 absent
  // (R7 中间路径 / F4 保守) → 安静少显示字段, **不**显示 'cost ?'. 跟 1b 拍板 "absent 安静"
  // 一致. user 视角看 'cost ?/turn' 是 'UI 不知道' 不是 '这次没算', 显示 '?' 反而误导.
  if (usage.cost_turn === undefined || usage.cost_currency === undefined) {
    return `cache: ${hitRatePct}%${avgSegment} | prompt ${formatTokens(prompt_tokens)} (${uncached} new)`;
  }
  // cost 字段齐: 读 cost_currency 决 symbol
  const symbol = formatCostSymbol(usage.cost_currency);
  const cost = usage.cost_turn; // narrowed by 上面 if guard (cost_turn !== undefined)
  const costStr = cost < 0.01 ? `${symbol}${cost.toFixed(4)}` : `${symbol}${cost.toFixed(3)}`;
  return `cache: ${hitRatePct}%${avgSegment} | ${costStr}/turn | prompt ${formatTokens(prompt_tokens)} (${uncached} new)`;
}

/** cost_currency → 显示 symbol. 不在 UI 层做汇率换算. */
function formatCostSymbol(currency: 'CNY' | 'USD' | undefined): string {
  switch (currency) {
    case 'CNY':
      return '¥';
    case 'USD':
      return '$';
    case undefined:
      return '?';
  }
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/**
 * Sprint 1c-revive-2-D-21.1 (2026-06-06): emaState 接受 mutable 引用 (闭包),
 * 在 sampleCount < 5 用 cold-start EMA (直接赋值), 之后 α=0.5 平滑:
 *   newEMA = α * current + (1 - α) * oldEMA = 0.5 * current + 0.5 * oldEMA
 * α=0.5 是 "等权平滑" (5-turn 半衰期 ≈ 1 turn, 快速响应 + 适度平滑).
 * 数学: sampleCount=5 时, 5 turn 前的数据权重 = 0.5^5 = 3.1% (基本忘掉),
 * 跟 5-turn rolling window 趋势一致, 但 EMA 实现更轻.
 *
 * export 出来供单测 (test/unit/usage-ema.test.ts) 验证 state machine.
 * 之前是 local function, D-21.1 改成 export — 单测需要直接调它验 in-place update.
 */
export function appendUsageStatus(
  usage: Usage | undefined,
  err: NodeJS.WritableStream,
  emaState: UsageEmaState,
): void {
  // 同步更新 EMA state (in-place). 调 formatUsageStatus 之前先 update,
  // 防止 "刚 sample 1 个, display 当 turn 仍显示 sample 0 的 ema".
  if (usage !== undefined && usage.cached_tokens !== undefined) {
    const current = usage.cache_hit_rate ?? 0;
    if (emaState.hitRateEMA === undefined) {
      emaState.hitRateEMA = current;
    } else {
      emaState.hitRateEMA = 0.5 * current + 0.5 * emaState.hitRateEMA;
    }
    emaState.sampleCount += 1;
  }
  const line = formatUsageStatus(usage, emaState);
  if (line !== null) {
    err.write(`  ${line}\n`);
  }
}
