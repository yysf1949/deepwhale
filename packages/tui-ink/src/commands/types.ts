/**
 * @deepwhale/tui-ink — slash command 类型 (D-26 C2, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/app/slash/types.ts 1:1 同形态 (name + aliases + help +
 * run), D-26 简化: run 回调 ctx 用 tui-ink 内部 SlashContext (无 Hermes 那种
 * gateway RPC 抽象, tui-ink 走直连 store / transcript / useApp 等).
 *
 * 不做 (defer D-29+):
 *   - run 回调异步 (跟 Hermes 1:1 void return, D-26 拍: 同步语义, 异步工作走 ctx)
 *   - usage 字段拍 (D-26 拍: help 足够)
 *
 * 业务 0 改, 1:1 抄 Hermes 拍板 + JSDoc 中文.
 */

import type { TuiInkResult } from '../types.js'
import type { TranscriptEntry } from '../store/ui.js'

/** Slash 命令调 ctx 拍板 (跟 Hermes SlashRunCtx 简化版). */
export interface SlashContext {
  /** 当前 theme (TuiTheme), /status / model 渲染用 */
  theme: import('../theme/index.js').TuiTheme
  /** 当前 ui state map ($uiState.get() snapshot) */
  ui: import('../store/ui.js').UiState
  /** 当前 transcript 列表 ($transcript.get() snapshot) */
  transcript: ReadonlyArray<TranscriptEntry>
  /** 当前 model 字段 (computed: options.model ?? client.model) */
  model: string
  /** 当前 session path (D-19.5 finish 路径用, 可能 undefined) */
  sessionPath: string | undefined
  /** 写 transcript entry (pushEntry 透传, 跟 D-23.2 业务 1:1) */
  pushEntry: (entry: TranscriptEntry) => void
  /** 清空 transcript (D-26 C3 /clear 用, 不关 session) */
  clearTranscript: () => void
  /** 切 model (D-26 C3 /model 用, 走 env 推断 + 显式 provider) */
  setModel: (model: string, provider?: 'deepseek' | 'anthropic') => void
  /** 退出 TUI (D-26 C3 /exit /q /quit 用, 跟 D-24.3 /exit 1:1) */
  exit: (result?: TuiInkResult) => void
}

/** Slash 命令定义 (Hermes 1:1 + JSDoc). */
export interface SlashCommand {
  /** 命令名 (e.g. 'help', 'exit'), 不含前导 `/` */
  name: string
  /** 别名 (e.g. exit/q/quit, new/clear), 跟 name 共享 findSlashCommand 索引 */
  aliases?: ReadonlyArray<string>
  /** 简短帮助, /help 印出 (e.g. 'list commands + hotkeys') */
  help?: string
  /** 命令分类 (Hermes 5 类: core/session/ops/setup/debug, D-26 简化为 3 类) */
  category?: 'core' | 'session' | 'debug'
  /**
   * 命令执行 (Hermes 1:1, D-26 简化: 同步 return void).
   * arg: 命令行 `/cmd arg1 arg2` 的 arg 部分 (Hermes 1:1)
   * ctx: slash 上下文 (跟 Hermes SlashRunCtx 简化版)
   */
  run: (arg: string, ctx: SlashContext) => void
}
