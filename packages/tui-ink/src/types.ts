/**
 * Shared types for @deepwhale/tui-ink.
 *
 * 跟 packages/coding-agent/src/modes/tui.ts 的 TuiModeOptions 对齐 (D-24.3 dispatch
 * 时复用, 不重写类型定义).
 */

export type TuiInkExitReason =
  | 'user-exit'           // 用户输入 /exit 或 q
  | 'sigint'              // Ctrl+C
  | 'session-error'       // session writer / runToolLoop 出错
  | 'render-error'        // Ink 渲染层出错
  | 'not-tty'             // stdout 非 TTY
  | 'unknown'

export interface TuiInkResult {
  exitCode: number
  reason: TuiInkExitReason
  error?: Error
}

/**
 * TUI mode options — 子集跟 TuiModeOptions 对齐.
 * coding-agent 的 bin/deepwhale.js 在 dispatch 时构造.
 */
export interface TuiInkOptions {
  /** LLM client 工厂 (coding-agent 提供, 我们 import) */
  // clientFactory?: () => LLMClient          // 留 D-24.2 实现
  /** Default provider name (e.g. 'deepseek') */
  provider?: string
  /** Default model name */
  model?: string
  /** Theme name (env > arg > default) */
  theme?: 'default' | 'solarized' | 'monochrome'
  /** --no-tool-loop 模式 (直发, 不跑 tool loop) — 留 D-24.3 接 bin dispatch 时实现 */
  noToolLoop?: boolean
  /** 工具循环最大步数 */
  maxSteps?: number
  /** Session 文件路径 (load + append) */
  sessionPath?: string
  /** 沙箱类型 ('local' | 'docker' | 'none') */
  sandbox?: 'local' | 'docker' | 'none'
  /** --yes 标志 (D-13: bypass require_confirmation, 不 bypass deny) */
  yes?: boolean
}
