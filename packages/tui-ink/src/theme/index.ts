/**
 * TUI theme — D-23.1 主题搬容器.
 *
 * 业务逻辑 0 重写, 跟 packages/coding-agent/src/modes/tui.ts line 80-180 的
 * TuiTheme / THEMES / resolveTuiTheme 1:1 同步. Ink 容器内, colorize 返 string
 * 直接喂 <Text color=...> (Ink 会识别 ANSI 序列, 跟 chalk 类似).
 *
 * 3 preset (跟 D-23.1 一致):
 *   - default:    cyan + dim (现状)
 *   - solarized:  暖色 (yellow/blue/magenta 暖冷对比)
 *   - monochrome: 无前景色, 仅 dim + bold (黑/白终端)
 *
 * 7 role (每个 preset 都填):
 *   header / model / divider / prompt / error / success / toolName
 *
 * 选: env `DEEPWHALE_TUI_THEME` (默认 `default`), 或 CLI `--theme <name>`
 *     (在 TuiInkOptions.theme 接).
 */

import { stderr } from 'node:process'

export type TuiThemeName = 'default' | 'solarized' | 'monochrome'

export const VALID_THEME_NAMES: readonly TuiThemeName[] = ['default', 'solarized', 'monochrome'] as const

export interface TuiTheme {
  header: string
  model: string
  divider: string
  prompt: string
  error: string
  success: string
  /** D-23.1: 工具名 (tool call/result 行), 跟 model 同级, 用同色变体 */
  toolName: string
}

/**
 * 3 preset (跟 D-23.1 1:1 同步).
 * 用 ANSI 转义码, Ink <Text> 会原生识别 (跟 chalk 5 行为一致).
 */
export const THEMES: Record<TuiThemeName, TuiTheme> = {
  default: {
    header: '\x1b[1m\x1b[36m',       // bold cyan
    model: '\x1b[36m',                // cyan
    divider: '\x1b[2m\x1b[36m',       // dim cyan
    prompt: '\x1b[1m\x1b[36m',        // bold cyan
    error: '\x1b[31m',                // red
    success: '\x1b[32m',              // green
    toolName: '\x1b[1m\x1b[36m',     // bold cyan
  },
  solarized: {
    header: '\x1b[1m\x1b[33m',        // bold yellow
    model: '\x1b[34m',                // blue (冷)
    divider: '\x1b[2m\x1b[33m',       // dim yellow
    prompt: '\x1b[1m\x1b[35m',        // bold magenta
    error: '\x1b[31m',                // red
    success: '\x1b[33m',              // yellow (暖)
    toolName: '\x1b[1m\x1b[34m',     // bold blue
  },
  monochrome: {
    header: '\x1b[1m',                // bold
    model: '\x1b[0m',                 // (无前景色)
    divider: '\x1b[2m',               // dim
    prompt: '\x1b[1m',                // bold
    error: '\x1b[1m',                 // bold (黑/白终端不刺眼)
    success: '\x1b[1m',               // bold
    toolName: '\x1b[1m',             // bold
  },
}

/** ANSI reset (跟 coding-agent/tui.ts:51 同步) */
export const ANSI_RESET = '\x1b[0m'

/**
 * 解析 theme 来源 (env > 默认), 找不到或 invalid 时退化到 'default' + stderr warning.
 * 跟 coding-agent/tui.ts:142 1:1 同步.
 */
export function resolveTuiTheme(themeArg?: string): TuiThemeName {
  const fromArg = themeArg ?? process.env.DEEPWHALE_TUI_THEME
  if (fromArg === undefined) return 'default'
  if (VALID_THEME_NAMES.includes(fromArg as TuiThemeName)) {
    return fromArg as TuiThemeName
  }
  stderr.write(
    `warning: unknown TUI theme '${fromArg}', falling back to 'default' (valid: ${VALID_THEME_NAMES.join(', ')})\n`,
  )
  return 'default'
}

/**
 * 染色 wrapper — 用 role 查当前 theme.
 * 跟 coding-agent/tui.ts:155 1:1 同步.
 *
 * 注意: 在 Ink 容器内, 可以直接用 <Text color="cyan"> 而不必 escape. 但我们保留
 * ANSI escape 形式是为了跟 readline 容器行为一致 (供 test 验染色字节).
 */
export function colorize(text: string, role: keyof TuiTheme, theme: TuiTheme = THEMES.default): string {
  return `${theme[role]}${text}${ANSI_RESET}`
}
