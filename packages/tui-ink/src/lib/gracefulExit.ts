/**
 * @deepwhale/tui-ink — gracefulExit 工具 (D-26 C1, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/lib/gracefulExit.ts 简化版 (Hermes 47 行 + signal table).
 * D-26 拍板: tui-ink 简化版, 只 setup 一次 + SIGINT/SIGTERM/SIGHUP 三种 signal
 * (跟 Hermes 1:1) + uncaughtException 走 stderr, 不做 setupGracefulExit 重入保护
 * (Hermes 防 re-wired, D-26 简化跳过, D-29+ 拍红线).
 *
 * 用途: deepwhale tui 启动期 wire 一次 graceful exit, 跟 D-19 SIGINT 链兼容红线.
 *
 * 拍板红线 (跟 D-20.3 P0-B + D-19 一致):
 *   - Ctrl+C 永远走 useAbortController + turnAbortController (D-19 chain)
 *   - 这里 gracefulExit 只接 OS-level signal (process kill), 不接 in-TUI Ctrl+C
 *   - uncaughtException 走 stderr 不 throw, 跟 D-20.1 friendly error handling 1:1
 */

import type {} from 'node:process'

const SIGNAL_EXIT_CODE: Record<'SIGHUP' | 'SIGINT' | 'SIGTERM', number> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
}

let wired = false

export interface SetupGracefulExitOptions {
  /** 退出前 cleanup 任务, parallel Promise.allSettled. */
  cleanups?: Array<() => Promise<void> | void>
  /** 强退 failsafe 时限 (ms), 默认 4000. */
  failsafeMs?: number
  /** uncaughtException / unhandledRejection 回调. */
  onError?: (scope: 'uncaughtException' | 'unhandledRejection', err: unknown) => void
  /** signal 接收回调. */
  onSignal?: (signal: NodeJS.Signals) => void
}

/**
 * Wire 一次 graceful exit handlers. Hermes 1:1 (允许重入守 wired flag, D-26
 * 简化跳过, 跟 D-29+ 拍红线).
 */
export function setupGracefulExit(options: SetupGracefulExitOptions = {}): void {
  if (wired) return
  wired = true

  const { cleanups = [], failsafeMs = 4000, onError, onSignal } = options

  let shuttingDown = false
  const exit = (code: number, signal?: NodeJS.Signals): void => {
    if (shuttingDown) return
    shuttingDown = true
    if (signal) onSignal?.(signal)
    setTimeout(() => process.exit(code), failsafeMs).unref?.()
    void Promise.allSettled(cleanups.map(fn => Promise.resolve().then(fn)))
      .finally(() => process.exit(code))
  }

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => exit(SIGNAL_EXIT_CODE[sig], sig))
  }
  process.on('uncaughtException', err => onError?.('uncaughtException', err))
  process.on('unhandledRejection', reason => onError?.('unhandledRejection', reason))
}
