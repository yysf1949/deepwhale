/**
 * @deepwhale/tui-ink — TodoList 组件 (D-30.2.6, 2026-06-07).
 *
 * 渲染 $todos 数组 (跟 coding-agent TodoStore 1:1 同步).
 * 业务逻辑 0 重写: 单纯 UI 渲染, 数据由 coding-agent TodoStore 喂.
 *
 * 渲染规则:
 *   - 空列表 → "(no todos)" + divider 灰
 *   - done=true → ☑ + success 绿
 *   - done=false → ☐ + prompt 色
 */

import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'
import { $todos } from '../store/ui.js'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'
import type { ReactElement } from 'react'

export interface TodoListProps {
  theme?: TuiTheme
}

export function TodoList({ theme = THEMES.default }: TodoListProps): ReactElement {
  const items = useStore($todos)
  if (items.length === 0) {
    return (
      <Box>
        <Text>{colorize('(no todos)', 'divider', theme)}</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Text>{colorize('Todos:', 'header', theme)}</Text>
      {items.map((item) => (
        <Text key={item.id}>
          {colorize(item.done ? '☑' : '☐', item.done ? 'success' : 'prompt', theme)}
          {' '}
          {item.text}
        </Text>
      ))}
    </Box>
  )
}
