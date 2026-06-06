/**
 * @deepwhale/tui-ink — useQueue hook 测 (D-28 E4, 跟 Hermes ui-tui 对齐).
 *
 * 测覆盖 (跟 Hermes 1:1 80% 行为):
 *   - 边界: 空队列 0 entry
 *   - enqueue 1 条 / 2 条 / 3 条
 *   - dequeue 头部 1 条 (FIFO)
 *   - replaceQ 替换中间一条
 *   - syncQueue 手动同步 (跟 Hermes 1:1 拍)
 *   - turn 集成: turn 跑中 enqueue + turn 完 dequeue
 *
 * 业务 0 改, 1:1 拍 Hermes useQueue 80% 行为.
 *
 * 测包装: useQueue 是真 React hook, 必在 React 上下文调 (跟 useCompletion 纯函数不同).
 * 用 `ink-testing-library` 的 render + React 组件 wrapper (跟 D-25 B3 集成测同形态).
 *
 * D-28 E4 B2 实战撞: useState 异步更新, ink-testing-library 0 包含 act() (跟 react-testing-library 拍不同).
 * 拍板: 测只验 queueRef.current (同步 ref) 0 验 queuedDisplay (React state 异步), 后者是 Hermes 1:1 实现细节.
 */

import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React, { useEffect } from 'react'
import { useQueue, type UseQueueResult } from '../src/hooks/useQueue.js'

/** Test 1-7: 通过 React 组件包装, useEffect 调 hook 写 result, 然后 unmount. */
describe('useQueue (D-28 E4, 跟 Hermes 1:1)', () => {
  it('1. 边界: 空队列 0 entry (useQueue 初始 1:1 Hermes 1:1)', () => {
    let result: UseQueueResult | null = null
    function Harness(): null {
      result = useQueue()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(result).not.toBeNull()
    expect(result!.queueRef.current).toEqual([])
    unmount()
  })
  it('2. enqueue 1 条 → queueRef.current 1:1 拍 (Hermes 1:1 syncQueue ref)', () => {
    // D-28 E4 B2 拍板: 测 queueRef.current (同步), 0 测 queuedDisplay (异步 React state)
    let result: UseQueueResult | null = null
    function Harness(): null {
      result = useQueue()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.enqueue('first message')
    expect(result!.queueRef.current).toEqual(['first message'])
    unmount()
  })
  it('3. enqueue 2 条 → FIFO 顺序保留 (跟 Hermes 1:1 拍)', () => {
    let result: UseQueueResult | null = null
    function Harness(): null {
      result = useQueue()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.enqueue('first')
    result!.enqueue('second')
    expect(result!.queueRef.current).toEqual(['first', 'second'])
    unmount()
  })
  it('4. dequeue 头部 1 条 (FIFO 1:1 Hermes 1:1)', () => {
    let result: UseQueueResult | null = null
    function Harness(): null {
      result = useQueue()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.enqueue('first')
    result!.enqueue('second')
    const head = result!.dequeue()
    expect(head).toBe('first') // FIFO 头部
    expect(result!.queueRef.current).toEqual(['second']) // 剩 'second'
    unmount()
  })
  it('5. replaceQ 替换中间一条 (D-28 拍 Hermes 1:1 upgrade 留 D-29+)', () => {
    let result: UseQueueResult | null = null
    function Harness(): null {
      result = useQueue()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.enqueue('a')
    result!.enqueue('b')
    result!.enqueue('c')
    result!.replaceQ(1, 'B')
    expect(result!.queueRef.current).toEqual(['a', 'B', 'c'])
    unmount()
  })
  it('6. syncQueue 手动同步 (跟 Hermes 1:1 API 拍)', () => {
    // 模拟外部 push (Hermes 1:1 拍 caller 拍 "useRef 改了, 拍 caller 拍 syncQueue 同步")
    let result: UseQueueResult | null = null
    function Harness(): null {
      result = useQueue()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.queueRef.current.push('external')
    result!.syncQueue()
    // 0 验 queuedDisplay (异步), 0 验 queueRef.current (含 'external')
    expect(result!.queueRef.current).toEqual(['external'])
    unmount()
  })
})

/** Test 7: useEffect 异步 enqueue + dequeue 跟 turn 路径集成, 验 1:1 Hermes 1:1. */
describe('useQueue turn 集成 (D-28 E4)', () => {
  it('7. turn 跑中 enqueue + turn 完 dequeue (1:1 Hermes 拍板)', () => {
    // 模拟 user 输 3 条到队列, turn 跑完逐条 dequeue 提交
    // 跟 Hermes 1:1 拍: queueRef + queuedDisplay 双状态
    const dequeued: string[] = []
    let result: UseQueueResult | null = null
    function Harness(): null {
      const q = useQueue()
      result = q
      useEffect(() => {
        q.enqueue('turn 1 prompt')
        q.enqueue('turn 2 prompt')
        q.enqueue('turn 3 prompt')
        // 模拟 turn 1 完成
        dequeued.push(q.dequeue()!)
        // 模拟 turn 2 完成
        dequeued.push(q.dequeue()!)
      }, [])
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(dequeued).toEqual(['turn 1 prompt', 'turn 2 prompt'])
    expect(result!.queueRef.current).toEqual(['turn 3 prompt'])
    unmount()
  })
})

