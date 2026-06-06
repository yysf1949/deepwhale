/**
 * @deepwhale/tui-ink — App 组件 (D-24.1 骨架, D-24.2 实现 5 子组件).
 *
 * Sprint 1c-revive-2-D-24.1 (2026-06-06) v1.0.9
 *
 * D-24.1 范围: 占位 App, 跑通 render -> unmount 链路, 确认 Ink 容器替代 readline 工作.
 * D-24.2 范围: 接 5 子组件 (StatusBar / Prompt / Transcript / Divider / Confirm) + 3 hooks
 *              (useRunToolLoop / useAbortController / useHistory), 把 D-22 / D-23.1 / D-23.2
 *              业务逻辑搬进 Ink 容器.
 *
 * 复用红线 (跟 D-20.3 P0-B / D-22 / D-23.1 / D-23.2 一致):
 *   - 0 改 packages/core / packages/llm / packages/edit-engine
 *   - 复用 runToolLoop (coding-agent)
 *   - 复用 createReplConfirm (coding-agent, D-19 串行化)
 *   - 复用 formatUsageStatus (coding-agent)
 *   - 复用 SessionWriter (跟 REPL/print mode 同形态)
 */

import { useMemo, type ReactElement } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { THEMES, resolveTuiTheme, type TuiTheme } from './theme/index.js'
import type { TuiInkOptions, TuiInkResult } from './types.js'

export interface AppProps {
  options: TuiInkOptions
  onExit: (result: TuiInkResult) => void
}

/**
 * <App/> 主组件.
 *
 * D-24.1: 占位, 只跑通 render 链路 + SIGINT 退出.
 * D-24.2: 加 StatusBar / Prompt / Transcript / Divider / Confirm 子组件 + hooks.
 */
export function App({ options, onExit }: AppProps): ReactElement {
  const { exit } = useApp()
  const theme: TuiTheme = useMemo(
    () => THEMES[resolveTuiTheme(options.theme)],
    [options.theme],
  )

  // D-24.1: SIGINT 退出 (Ctrl+C). D-24.2 接 useAbortController 替换.
  useInput((input: string, key: { ctrl: boolean }) => {
    if (key.ctrl && input === 'c') {
      onExit({ exitCode: 0, reason: 'sigint' })
      exit()
    }
  })

  // D-24.1: 简单 banner + 提示用户 D-24.2 还没接 Prompt/Transcript
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.header}>
        ⌬ deepwhale tui-ink (D-24.1 skeleton)
      </Text>
      <Text color={theme.divider}>
        {'─'.repeat(40)}
      </Text>
      <Text color={theme.model}>
        theme: {resolveTuiTheme(options.theme)} | D-24.2 即将接入 5 子组件 + 3 hooks
      </Text>
      <Text color={theme.divider}>
        {'─'.repeat(40)}
      </Text>
      <Text color={theme.prompt}>
        ⌨ Ctrl+C 退出 (D-24.1 验证 SIGINT 链路)
      </Text>
    </Box>
  )
}
