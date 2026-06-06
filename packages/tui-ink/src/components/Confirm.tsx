/**
 * @deepwhale/tui-ink — Confirm 组件 (D-24.2).
 *
 * 跟 packages/coding-agent/src/repl/repl-confirm.ts `createReplConfirm` 1:1 同步.
 * 业务逻辑 0 重写: 复用 createReplConfirm, 提示符挂 <Text>, 跟 REPL/print mode 同形态.
 *
 * 跟 readline 容器区别:
 *   - readline: rl.on('line') 拿 line → confirm.offerLine(line) 喂 pending
 *   - Ink 容器: Prompt 拿 line → caller (App) 决定: 有 pendingConfirm? confirm.offerLine
 *
 * 复用红线 (跟 D-19 拍板一致):
 *   - 复用 createReplConfirm (不重写 confirm 状态机)
 *   - 提示符 "Allow <tool>? (<reason>) [y/N]: " 跟 tui.ts 1:1
 *   - abort signal 透传 (D-19 P2 Ctrl+C 修)
 */

import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'
import type { ReplConfirmController } from '@deepwhale/coding-agent'
import { $uiState } from '../store/ui.js'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'
import type { ReactElement } from 'react'

export interface ConfirmProps {
  theme?: TuiTheme
  /** createReplConfirm 返回的 controller, 复用 D-19 串行化状态机. App 持有. */
  controller: ReplConfirmController
}

export function Confirm({ theme = THEMES.default, controller }: ConfirmProps): ReactElement | null {
  const ui = useStore($uiState)
  if (!ui.pendingConfirm) return null

  // 提示符 (跟 tui.ts L780-790 1:1): "Allow <tool>? (<reason>) [y/N]: "
  // pendingConfirm.prompt 已 caller 拼好, 这里直接渲染.
  return (
    <Box flexDirection="column">
      <Text>
        {colorize('  ? ', 'prompt', theme)}
        {colorize(ui.pendingConfirm.prompt, 'prompt', theme)}
      </Text>
      <Text color={theme.divider}>
        {'  '}
        y/N: {controller.hasPending() ? '(waiting for input)' : ''}
      </Text>
    </Box>
  )
}
