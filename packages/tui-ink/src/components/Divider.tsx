/**
 * @deepwhale/tui-ink — Divider 组件 (D-24.2).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts line 169-175 `horizontalRule()` 1:1 同步.
 * 业务逻辑 0 重写: 同样的 `${width}─` + colorize(role=divider).
 *
 * D-21.2 轻量升级: 状态栏上下加横线分隔 — 跟 REPL status bar 风格统一.
 */

import { Text } from 'ink'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'
import type { ReactElement } from 'react'

export interface DividerProps {
  /** 默认 60 (跟 readline 容器 tui.ts 保持一致) */
  width?: number
  theme?: TuiTheme
}

export function Divider({ width = 60, theme = THEMES.default }: DividerProps): ReactElement {
  // ANSI 染色后, Ink <Text> 会原生识别 (跟 chalk 5 行为一致).
  // 这里直接喂 string (含 ANSI 转义码), 跟 readline 容器 out.write 同形态.
  const line = colorize('  ' + '─'.repeat(width), 'divider', theme)
  return <Text>{line}</Text>
}
