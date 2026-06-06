/**
 * @deepwhale/tui-ink — StatusBar 组件 (D-24.2).
 *
 * 跟 packages/coding-agent/src/repl.ts `formatUsageStatus` 4 字段 1:1 同步.
 * 跟 packages/coding-agent/src/modes/tui.ts line 186-198 `formatTuiStatusBar` 1:1 同步.
 *
 * 业务逻辑 0 重写: 调 coding-agent 导出的 `formatUsageStatus`, 包 D-21.2 横线 + 状态栏文.
 *
 * 实现红线:
 *   - **不**自己重算 usage (留 formatUsageStatus, EMA 状态跟 REPL 同形态)
 *   - 不绕过 session writer / runToolLoop
 *   - 0 改 coding-agent/src/repl.ts 任何代码
 */

import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'
import { formatUsageStatus } from '@deepwhale/coding-agent'
import type { Usage } from '@deepwhale/llm'
import { $uiState } from '../store/ui.js'
import { Divider } from './Divider.js'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'
import type { ReactElement } from 'react'

export interface StatusBarProps {
  theme?: TuiTheme
  /** 覆盖 store 里的 usage (一般不传, 走 store 同步) */
  usage?: Usage | null
}

export function StatusBar({ theme = THEMES.default, usage: usageOverride }: StatusBarProps): ReactElement {
  const ui = useStore($uiState)
  // 优先用 prop 覆盖, fallback store. 跟 tui.ts L750-760 1:1.
  const usage: Usage | null = usageOverride !== undefined ? usageOverride : ui.usage
  const usageLine: string | null = formatUsageStatus(usage ?? undefined)

  const modelName = ui.model || 'model'
  const statusText = colorize(
    usageLine === null
      ? `  ${modelName} · (no usage)`
      : `  ${modelName} · ${usageLine}`,
    'divider',
    theme,
  )
  return (
    <Box flexDirection="column">
      <Divider theme={theme} />
      <Text>{statusText}</Text>
      <Divider theme={theme} />
    </Box>
  )
}
