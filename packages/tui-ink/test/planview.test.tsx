/**
 * @deepwhale/tui-ink — PlanView 组件 smoke 测 (D-30.2.7).
 *
 * 4 个核心单测 (跟 plan 2026-06-07-D-30.2 §Task 7 一致):
 *   1. 空数组 → null (不渲染)
 *   2. 1 个 step → "1. text"
 *   3. 多个 steps → 顺序对, 编号递增
 *   4. setPlan 喂数据 → 组件响应更新
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'

import { PlanView } from '../src/components/PlanView.js'
import { $plan, setPlan, type PlanStep } from '../src/store/ui.js'

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

describe('PlanView (D-30.2.7)', () => {
  let app: ReturnType<typeof render> | null = null

  beforeEach(() => {
    $plan.set([])
  })

  afterEach(() => {
    if (app) {
      app.unmount()
      app = null
    }
    $plan.set([])
  })

  it('1. 空数组 → null (lastFrame 空字符串)', () => {
    app = render(React.createElement(PlanView))
    // null 组件 → lastFrame 返空字符串
    expect(app.lastFrame() ?? '').toBe('')
  })

  it('2. 1 个 step → "1. text"', () => {
    const steps: PlanStep[] = [{ no: 1, text: 'first step', status: 'pending' }]
    setPlan(steps)
    app = render(React.createElement(PlanView))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('Plan:')
    expect(text).toContain('1.')
    expect(text).toContain('first step')
  })

  it('3. 多个 steps → 顺序对, 编号递增', () => {
    const steps: PlanStep[] = [
      { no: 1, text: 'alpha', status: 'pending' },
      { no: 2, text: 'beta', status: 'in_progress' },
      { no: 3, text: 'gamma', status: 'done' },
    ]
    setPlan(steps)
    app = render(React.createElement(PlanView))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text.indexOf('alpha')).toBeLessThan(text.indexOf('beta'))
    expect(text.indexOf('beta')).toBeLessThan(text.indexOf('gamma'))
    expect(text).toContain('1.')
    expect(text).toContain('2.')
    expect(text).toContain('3.')
  })

  it('4. setPlan 喂数据 → 组件响应更新', () => {
    app = render(React.createElement(PlanView))
    expect(app.lastFrame() ?? '').toBe('')

    setPlan([{ no: 1, text: 'added', status: 'pending' }])
    app.rerender(React.createElement(PlanView))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('added')
  })
})
