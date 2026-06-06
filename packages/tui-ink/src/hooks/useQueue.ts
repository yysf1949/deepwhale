/**
 * @deepwhale/tui-ink — useQueue hook (D-28 E4, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/hooks/useQueue.ts 1:1 简化版 (Hermes 50 行 → D-28 60 行):
 *   - enqueue / dequeue / replaceQ / syncQueue / queuedDisplay (5 API)
 *   - D-28 简化: 0 queueEdit (Hermes 1:1 拍 queueEditRef, D-29+ 升级)
 *   - 0 useReducer (Hermes 1:1, D-28 拍 useState 拍板简化)
 *
 * 业务 0 改, 1:1 拍 Hermes useQueue 80% 行为.
 *
 * 拍板 (D-28 §3.4 E4):
 *   - 拍 useState (useRef 拍拍 1:1 Hermes 1:1)
 *   - 测必 React 上下文 (跟 useCompletion 纯函数拍不同, 1:1 Hermes 1:1)
 *   - D-29+ 升级: queueEdit (Hermes 1:1 1:1), 拍 useReducer
 */

import { useCallback, useRef, useState } from 'react'

export interface UseQueueResult {
  /** 入队 1 条 message (turn 跑中) */
  enqueue: (text: string) => void
  /** 出队 1 条 (turn 完成时调) */
  dequeue: () => string | undefined
  /** 替换队列中第 i 条 (D-29+ 升级) */
  replaceQ: (i: number, text: string) => void
  /** 同步 queueRef → queuedDisplay (Hermes 1:1) */
  syncQueue: () => void
  /** 队列显示数组 (给 <Prompt/> 渲染用) */
  queuedDisplay: ReadonlyArray<string>
  /** 队列 ref (Hermes 1:1 拍, 给 caller 直接读最新状态) */
  queueRef: React.MutableRefObject<string[]>
}

/**
 * D-28 E4: useQueue hook — 简化版 (跟 Hermes 1:1 80% 行为).
 *
 * 拍板 (D-28 实战):
 *   - 5 API (enqueue / dequeue / replaceQ / syncQueue / queuedDisplay)
 *   - 0 queueEdit (Hermes 1:1 升级, D-29+)
 *   - 0 useReducer (D-28 简化, 1:1 Hermes 1:1 useState)
 *
 * 0 改业务, 1:1 拍 Hermes useQueue 80% 行为.
 *
 * 注: useState/useRef 是真 React hook, 测必 React 上下文 (跟 useCompletion 纯函数拍不同).
 */
export function useQueue(): UseQueueResult {
  const queueRef = useRef<string[]>([])
  const [queuedDisplay, setQueuedDisplay] = useState<string[]>([])

  const syncQueue = useCallback(() => {
    setQueuedDisplay([...queueRef.current])
  }, [])

  const enqueue = useCallback(
    (text: string): void => {
      queueRef.current.push(text)
      syncQueue()
    },
    [syncQueue],
  )

  const dequeue = useCallback((): string | undefined => {
    const head = queueRef.current.shift()
    syncQueue()
    return head
  }, [syncQueue])

  const replaceQ = useCallback(
    (i: number, text: string): void => {
      queueRef.current[i] = text
      syncQueue()
    },
    [syncQueue],
  )

  return {
    dequeue,
    enqueue,
    queuedDisplay,
    queueRef,
    replaceQ,
    syncQueue,
  }
}
