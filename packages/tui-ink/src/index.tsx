/**
 * @deepwhale/tui-ink — D-24 full Ink TUI container.
 *
 * Sprint 1c-revive-2-D-24 (2026-06-06) v1.0.9 — 跟 Hermes ui-tui 对齐:
 *   - Ink 6 + React 19 + ink-text-input
 *   - 抽 workspace 私有包, esbuild bundle 成 dist/tui.js (self-contained, runtime 0 deps)
 *   - tarball 装路径: `node $(which deepwhale) tui` 走 bundle
 *   - 业务逻辑 0 重写, 复用 coding-agent 的 runToolLoop / SessionWriter / createReplConfirm / formatUsageStatus
 *
 * 复用红线 (跟 D-20.3 P0-B / D-22 / D-23 一致):
 *   - 不绕过 ToolPolicy
 *   - 不绕过 SessionWriter (跟 REPL/print mode 同形态)
 *   - 复用 createReplConfirm (D-19 串行化)
 *   - 复用 formatUsageStatus (REPL 状态栏 4 字段)
 *
 * 文件结构:
 *   - index.tsx          入口 (this file) — export runTuiInkMode + types
 *   - app.tsx            <App/> 主组件
 *   - theme/             D-23.1 主题 (搬, 0 重写)
 *   - highlight/         D-23.2 语法高亮 (搬, 0 重写)
 *   - history/           D-22.1 历史持久化 (搬, 0 重写)
 *   - store/             nanostores (status, transcript, mode)
 *   - types.ts           共享类型
 *
 * NOT covered (defer to 1.1+):
 *   - REPL mode 迁 Ink
 *   - Plan mode 嵌 TUI
 *   - 多 session tab
 */

import { render } from 'ink'
import { App } from './app.js'
import type { TuiInkOptions, TuiInkResult } from './types.js'

/**
 * Run TUI mode in Ink container.
 * Called by coding-agent's bin/deepwhale.js (D-24.3 dispatch).
 *
 * 装路径:
 *   - npm-install tarball: 走 @deepwhale/tui-ink/dist/tui.js bundle
 *   - source install (dev): 走 @deepwhale/tui-ink/src/index.tsx (via tsx)
 *
 * @param options - TUI mode options
 * @returns TuiInkResult - exit code + reason
 */
export async function runTuiInkMode(options: TuiInkOptions = {}): Promise<TuiInkResult> {
  // Stdout 非 TTY 退出 (跟 readline 容器行为一致, 让 CI / 管道 log 不染 ANSI)
  if (!process.stdout.isTTY) {
    return { exitCode: 0, reason: 'not-tty' }
  }

  return new Promise((resolve) => {
    const { waitUntilExit, unmount } = render(
      <App
        options={options}
        onExit={(result: TuiInkResult) => {
          resolve(result)
        }}
      />,
    )
    waitUntilExit()
      .then(() => {
        // ensure unmount is called for clean tear-down
        unmount()
      })
      .catch((err) => {
        // Defensive: shouldn't reach here — App.onExit always fires
        resolve({ exitCode: 1, reason: 'render-error', error: err instanceof Error ? err : new Error(String(err)) })
      })
  })
}

export { App } from './app.js'
export type { TuiInkOptions, TuiInkResult, TuiInkExitReason } from './types.js'
export { resolveTuiTheme, THEMES, type TuiThemeName, type TuiTheme } from './theme/index.js'
export { highlightChunk, type HighlightRole } from './highlight/chunk.js'
export {
  tuiHistoryLoad,
  tuiHistoryAppend,
  tuiHistoryPath,
  TUI_HISTORY_MAX,
} from './history/index.js'
