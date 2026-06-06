/**
 * @deepwhale/tui-ink — useAbortController hook (D-24.2).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts D-20.6.4 `turnAbortController` 1:1 同步.
 * 业务逻辑 0 重写: AbortController + useInput('ctrl+c') + 透传到 runToolLoop signal.
 *
 * 跟 D-19 P2 onSigint 链兼容:
 *   - readline 容器: rl.on('SIGINT', onSigint) + 透传 turnAbortController
 *   - Ink 容器: useInput('ctrl+c') + 透传 turnAbortController
 *   - 行为一致: SIGINT → abort + cleanup
 *
 * 不做 (defer to D-24.7 P0):
 *   - 真 trigger 测 (D-20.6.4 review P2 留)
 *   - 真 SIGINT 行为 vs ctrl+c 行 coverage
 */

import { useCallback, useEffect, useRef } from 'react'
import { useInput } from 'ink'

export interface UseAbortControllerResult {
  /** 当前 controller (透传给 runToolLoop signal) */
  controller: AbortController
  /** 调一次 abort (turn 完成/cleanup 时也调, 防止泄漏) */
  abort: () => void
  /** 替换 controller (新 turn 起步) */
  reset: () => void
}

export function useAbortController(onSigint: () => void): UseAbortControllerResult {
  const ref = useRef<AbortController>(new AbortController())

  const abort = useCallback((): void => {
    if (!ref.current.signal.aborted) {
      ref.current.abort()
    }
  }, [])

  const reset = useCallback((): void => {
    if (!ref.current.signal.aborted) {
      // 旧 controller 还没 abort, 提醒 caller 调一次
      console.warn('[tui-ink] useAbortController.reset called without prior abort()')
    }
    ref.current = new AbortController()
  }, [])

  // Ctrl+C 透传: 跟 tui.ts D-19 onSigint 1:1
  useInput((input: string, key: { ctrl: boolean }) => {
    if (key.ctrl && input === 'c') {
      abort()
      onSigint()
      // 留 caller 决定 exit, 跟 tui.ts 一致 (Ctrl+C 不一定 exit, 可能 abort 当前 turn 后继续)
    }
  })

  // 进程退出时 abort (防止泄漏, 跟 tui.ts process.on('exit', close) 同形态)
  useEffect(() => {
    const handler = (): void => {
      abort()
    }
    process.on('exit', handler)
    return () => {
      process.off('exit', handler)
    }
  }, [abort])

  return { controller: ref.current, abort, reset }
}
