/**
 * @deepwhale/tui-ink — StatusBar 组件 ink-testing-library 单测 (D-29.3.1).
 *
 * 验证 StatusBar 渲染契约 (跟 src/components/StatusBar.tsx 1:1):
 *   - 上下 2 个 Divider (60x U+2500, D-21.2)
 *   - 中间 status text: `  {model} · {formatUsageStatus(usage)}` 或 `  {model} · (no usage)`
 *   - model 来自 $uiState.model, usage 优先 prop 覆盖 → fallback store
 *   - 缺 usage 不崩 (D-21.2 懒渲染契约)
 *   - costUsd 走 formatUsageStatus → D-11-4 货币格式化 ($0.0010/turn for cost < 0.01)
 *
 * 跟 thinking.test.tsx / use-composer-state.test.tsx 风格一致: render + lastFrame + toContain.
 * 0 改 src, 0 改现有 125 passed 测.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { StatusBar } from '../../src/components/StatusBar.js'
import { $uiState, type UiState } from '../../src/store/ui.js'
import type { Usage } from '@deepwhale/llm'

function setUi(patch: Partial<UiState>): void {
  $uiState.set({ ...$uiState.get(), ...patch })
}

const baseUsage: Usage = {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
  cached_tokens: 0,
  cache_hit_rate: 0,
  tokens_uncached: 100,
  cost_turn: 0.001,
  cost_currency: 'USD',
}

describe('tui-ink/components/StatusBar', () => {
  beforeEach(() => {
    setUi({ mode: 'idle', usage: null, model: '', pendingConfirm: null, lastError: null })
  })

  it('1. 4 字段渲染: model + usage + cost ($0.0010) + prompt tokens', () => {
    setUi({ usage: baseUsage, model: 'deepseek-v4-flash' })
    const { lastFrame, unmount } = render(React.createElement(StatusBar))
    const out = lastFrame()!
    expect(out).toContain('deepseek-v4-flash')
    expect(out).toContain('100') // prompt_tokens
    // D-11-4 货币格式化: cost < 0.01 → 4 位小数 → "$0.0010" (实测 formatUsageStatus 行为)
    expect(out).toContain('$0.0010')
    unmount()
  })

  it('2. usage/sessionPath undefined 不崩 (D-21.2 懒渲染契约)', () => {
    // usage=null → (no usage) 分支, 不应崩
    setUi({ usage: null, model: 'deepseek-v4-flash' })
    const { lastFrame, unmount } = render(React.createElement(StatusBar))
    const out = lastFrame()!
    expect(out).toContain('deepseek-v4-flash')
    expect(out).toContain('(no usage)')
    unmount()
  })

  it('3. D-21.2 dividers: 60x U+2500 在 StatusBar 上下', () => {
    setUi({ usage: baseUsage, model: 'm' })
    const { lastFrame, unmount } = render(React.createElement(StatusBar))
    const out = lastFrame()!
    // 上下 2 个 Divider, 每个 60x ─ (D-21.2 横线契约)
    expect(out).toMatch(/─{60,}/)
    // frame 行数: divider + status + divider = 3 行
    const lines = out.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(lines[0]).toMatch(/─{60,}/)   // 顶 divider
    expect(lines[lines.length - 1]).toMatch(/─{60,}/) // 底 divider
    unmount()
  })
})
