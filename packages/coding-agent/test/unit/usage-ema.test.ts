/**
 * @deepwhale/coding-agent — usage EMA 平滑 footer 单测
 *
 * Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
 * 验证 formatUsageStatus + appendUsageStatus EMA 状态机:
 *   - sampleCount < 3: 不显示 (avg) 段
 *   - sampleCount >= 3: 显示 (avg NN%)
 *   - EMA α=0.5 平滑: 5 turn 前数据权重 3.1% (基本忘掉)
 *   - 无 cached_tokens: 不显示 avg (无 cache 没意义)
 *   - 旧 caller 不传 emaState: 行为兼容 (不显示 avg 段)
 *
 * 关键场景: cache_hit_rate 96% → 50% → 96% 跳变. 不带 EMA 焦虑 → 带 EMA 显示:
 *   - turn 1 (96%): cache: 96%
 *   - turn 2 (50%): cache: 50%
 *   - turn 3 (96%): cache: 96% (avg 80%)    ← EMA 已经平稳下来
 *   - turn 4 (50%): cache: 50% (avg 73%)    ← 不会跟着单 turn 抖
 *   - turn 5 (96%): cache: 96% (avg 85%)
 *
 * 对比: 不带 EMA 的话, user 看到 96 → 50 → 96 → 50 → 96 焦虑, 以为 cache 失效.
 * 带 EMA 之后, avg 稳步上升, 跟 compaction 保 prefix 的承诺一致.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatUsageStatus,
  appendUsageStatus,
  type UsageEmaState,
} from '../../src/repl.js';
import type { Usage } from '@deepwhale/llm';

/** 模拟一段 stderr stream (WritableStream-like), appendUsageStatus 写到 err. */
function makeErrCapture(): { err: NodeJS.WritableStream; lines: string[] } {
  const lines: string[] = [];
  return {
    err: {
      write(s: string) {
        // appendUsageStatus 写 `${line}\n`, 按行 split 收集
        for (const ln of s.split('\n')) {
          if (ln.length > 0) lines.push(ln);
        }
        return true;
      },
    } as unknown as NodeJS.WritableStream,
    lines,
  };
}

function makeUsage(cacheHitRate: number, cachedTokens = 100): Usage {
  // prompt_tokens 跟 cached_tokens 比例 = cacheHitRate
  const promptTokens = Math.round(cachedTokens / Math.max(cacheHitRate, 0.001));
  return {
    prompt_tokens: promptTokens,
    completion_tokens: 50,
    total_tokens: promptTokens + 50,
    cached_tokens: cachedTokens,
    cache_hit_rate: cacheHitRate,
    tokens_uncached: promptTokens - cachedTokens,
  };
}

describe('repl formatUsageStatus — Sprint 1c-revive-2-D-21.1 EMA footer', () => {
  let ema: UsageEmaState;

  beforeEach(() => {
    ema = { sampleCount: 0 };
  });

  it('1. sampleCount < 3: 不显示 (avg) 段 (样本太少趋势不稳)', () => {
    appendUsageStatus(makeUsage(0.96), makeErrCapture().err, ema);
    appendUsageStatus(makeUsage(0.85), makeErrCapture().err, ema);
    // ema 走到 turn 2, sampleCount=2 → 仍不显示 avg
    const line = formatUsageStatus(makeUsage(0.96), ema);
    expect(line).toBeTruthy();
    expect(line).toMatch(/^cache: 96% \|/);  // 没有 (avg ...)
    expect(line).not.toMatch(/avg/);
  });

  it('2. sampleCount >= 3: 显示 (avg NN%) 段, EMA α=0.5 平滑', () => {
    // 真实场景: cache 96% → 85% → 96% 跳变. EMA 应该平稳, 不会被单 turn 骗.
    appendUsageStatus(makeUsage(0.96), makeErrCapture().err, ema); // sample 1: EMA=0.96
    appendUsageStatus(makeUsage(0.85), makeErrCapture().err, ema); // sample 2: EMA=0.5*0.85+0.5*0.96=0.905
    appendUsageStatus(makeUsage(0.96), makeErrCapture().err, ema); // sample 3: EMA=0.5*0.96+0.5*0.905=0.9325
    expect(ema.sampleCount).toBe(3);
    expect(ema.hitRateEMA).toBeCloseTo(0.9325, 3);
    const line = formatUsageStatus(makeUsage(0.85), ema);
    expect(line).toMatch(/cache: 85% \(avg 93%\)/); // per-turn 真实 85%, avg 仍 93%
  });

  it('3. 无 cached_tokens: 不显示 avg 段 (无 cache 没意义, 跟 1b 拍板一致)', () => {
    const noCacheUsage: Usage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      total_tokens: 1050,
      // cached_tokens absent
    };
    appendUsageStatus(noCacheUsage, makeErrCapture().err, ema);
    // ema.sampleCount 不增 (caller 内部守卫)
    expect(ema.sampleCount).toBe(0);
    const line = formatUsageStatus(noCacheUsage, ema);
    expect(line).toMatch(/^usage: 1\.0k prompt \//);
    expect(line).not.toMatch(/avg/);
  });

  it('4. 旧 caller 不传 emaState: 行为兼容 (不显示 avg 段, 跟 v1.0.1 一致)', () => {
    // 拍板: 旧单测 (v1.0.1 时期) 没传 emaState, 改后不能破. 默认 EMPTY_EMA.
    const line = formatUsageStatus(makeUsage(0.96));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/avg/);
  });

  it('5. 跳变 5 轮: 96% → 50% → 96% → 50% → 96%, EMA 趋势稳, 不被单 turn 骗', () => {
    // 拍板的核心场景. user 报告的 cache 96%↔85% 跳变, 装 EMA 之后看 avg 应该稳.
    // 数学 (α=0.5):
    //   sample 1: ema = 0.96
    //   sample 2: ema = 0.5*0.50 + 0.5*0.96 = 0.73  → 73%
    //   sample 3: ema = 0.5*0.96 + 0.5*0.73 = 0.845 → 85%  (display "85%")
    //   sample 4: ema = 0.5*0.50 + 0.5*0.845 = 0.6725 → 67%
    //   sample 5: ema = 0.5*0.96 + 0.5*0.6725 = 0.81625 → 82%  (display "82%")
    // 关键观察: turn 3-5 的 per-turn 数字是 96/50/96, 但 avg 是 85/67/82, 跟
    // 真实 cache 健康度匹配 (compaction 保 prefix + tool result 抖动 → ratio 在
    // 70-90% 区间稳, 不是 50-96 焦虑区间). user 看 avg 段就不会焦虑.
    const err = makeErrCapture().err;
    const sequence = [0.96, 0.50, 0.96, 0.50, 0.96];
    const outputs: string[] = [];
    for (const r of sequence) {
      appendUsageStatus(makeUsage(r), err, ema);
      outputs.push(formatUsageStatus(makeUsage(r), ema) ?? '');
    }
    // turn 1, 2 不显示 avg (sampleCount < 3)
    expect(outputs[0]).not.toMatch(/avg/);
    expect(outputs[1]).not.toMatch(/avg/);
    // turn 3 起显示 avg, 走 α=0.5 平滑. 抽 avg 数字验
    const avgs = outputs.slice(2).map((o) => {
      const m = o.match(/avg (\d+)%/);
      return m ? parseInt(m[1]!, 10) : null;
    });
    expect(avgs).toEqual([85, 67, 82]);
    // per-turn 数字仍是真值, 让 user 既看真值又看趋势
    expect(outputs[2]).toMatch(/cache: 96%/);
    expect(outputs[3]).toMatch(/cache: 50%/);
    expect(outputs[4]).toMatch(/cache: 96%/);
  });

  it('6. 整测试集成: appendUsageStatus 真的写到 err stream, 不是只 format', () => {
    const { err, lines } = makeErrCapture();
    appendUsageStatus(makeUsage(0.9), err, ema);
    expect(lines.length).toBe(1);
    // D-21.1: appendUsageStatus 内部以 "  ${line}\n" 写入 (2 空格缩进, 跟单步
    // 工具摘要对齐). 用 RegExp(...) 构造避免 /{2}/ 跟 /.../ 字面量冲突.
    expect(lines[0]).toMatch(new RegExp('^ {2}cache: 90% \\|'));
  });
});
