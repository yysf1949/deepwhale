/**
 * @deepwhale/tui-ink — useHistory hook (D-24.2).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts line 293-343 `tuiHistoryLoad/Append` 1:1 同步.
 * 业务逻辑 0 重写: 调 history/index.ts 的 tuiHistoryLoad (启动时) + tuiHistoryAppend (每 turn).
 *
 * 跟 readline 容器区别:
 *   - readline: `rl.history = loaded.reverse()` (readline 期望最新在尾部)
 *   - Ink + ink-text-input: `useState<string[]>(loaded)` + 传 `historyItems` prop.
 *     ink-text-input 自带 ↑↓ 翻历史, 不需要 reverse (内部反向遍历).
 */

import { useCallback, useState } from 'react'
import { tuiHistoryLoad, tuiHistoryAppend } from '../history/index.js'

export interface UseHistoryResult {
  /** 历史条目 (最新在末尾, 跟 ink-text-input 期望一致) */
  history: string[]
  /** append 一条新 entry (turn 完成时调) */
  append: (line: string) => void
}

export function useHistory(): UseHistoryResult {
  // 启动期 load 一次 (D-22.1 atomic fsync 跟 readline 容器同形态).
  // useState lazy init 防止每次 render 重新读盘.
  const [history, setHistory] = useState<string[]>(() => tuiHistoryLoad())

  const append = useCallback((line: string): void => {
    if (!line || !line.trim()) return
    tuiHistoryAppend(line)
    setHistory((prev) => {
      // LRU 截断 (跟 tui.ts 1:1, 防止无限增长)
      const next = [...prev, line]
      if (next.length > 1000) return next.slice(-1000)
      return next
    })
  }, [])

  return { history, append }
}
