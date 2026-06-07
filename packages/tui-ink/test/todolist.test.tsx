/**
 * @deepwhale/tui-ink — TodoList 组件 smoke 测 (D-30.2.6).
 *
 * 5 个核心单测 (跟 plan 2026-06-07-D-30.2 §Task 6 一致):
 *   1. 空列表 → (no todos)
 *   2. 1 个未完成 → ☐ + text
 *   3. 1 个已完成 → ☑ + text
 *   4. 混合 → 顺序对, done 状态区分
 *   5. setTodos 喂数据 → 组件响应更新
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'

import { TodoList } from '../src/components/TodoList.js'
import { $todos, setTodos, type TodoUiItem } from '../src/store/ui.js'

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

describe('TodoList (D-30.2.6)', () => {
  let app: ReturnType<typeof render> | null = null

  beforeEach(() => {
    $todos.set([])
  })

  afterEach(() => {
    if (app) {
      app.unmount()
      app = null
    }
    $todos.set([])
  })

  it('1. 空列表 → (no todos)', () => {
    app = render(React.createElement(TodoList))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('(no todos)')
  })

  it('2. 单个未完成 → ☐ + text', () => {
    const items: TodoUiItem[] = [{ id: '1', text: 'first task', done: false }]
    setTodos(items)
    app = render(React.createElement(TodoList))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('☐')
    expect(text).toContain('first task')
  })

  it('3. 单个已完成 → ☑ + text', () => {
    const items: TodoUiItem[] = [{ id: '1', text: 'done task', done: true }]
    setTodos(items)
    app = render(React.createElement(TodoList))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('☑')
    expect(text).toContain('done task')
  })

  it('4. 混合 (done+todo) → 顺序对, 符号区分', () => {
    const items: TodoUiItem[] = [
      { id: '1', text: 'alpha', done: true },
      { id: '2', text: 'beta', done: false },
      { id: '3', text: 'gamma', done: true },
    ]
    setTodos(items)
    app = render(React.createElement(TodoList))
    const text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('Todos:')
    // alpha 在 beta 前面 (顺序对)
    expect(text.indexOf('alpha')).toBeLessThan(text.indexOf('beta'))
    expect(text.indexOf('beta')).toBeLessThan(text.indexOf('gamma'))
    // ☑ 出现 2 次 (alpha + gamma)
    const checkCount = (text.match(/☑/g) ?? []).length
    expect(checkCount).toBe(2)
    // ☐ 出现 1 次 (beta)
    const boxCount = (text.match(/☐/g) ?? []).length
    expect(boxCount).toBe(1)
  })

  it('5. setTodos 喂数据 → 组件响应更新', () => {
    app = render(React.createElement(TodoList))
    let text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('(no todos)')

    setTodos([{ id: '1', text: 'added', done: false }])
    // ink-testing-library 在 nanostore 通知后需要一次 rerender 拿到新 frame
    app.rerender(React.createElement(TodoList))
    text = stripAnsi(app.lastFrame() ?? '')
    expect(text).toContain('added')
    expect(text).not.toContain('(no todos)')
  })
})
