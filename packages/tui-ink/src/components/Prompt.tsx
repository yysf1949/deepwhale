/**
 * @deepwhale/tui-ink — Prompt 组件 (D-24.2).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts D-22.3 multi-line input 1:1 同步.
 * 业务逻辑 0 重写: `\` 续行 / `\\` 转义 / 空 `\` 取消 (D-22.3 拍板).
 *
 * 用 ink-text-input (>=6.0.0) 包装:
 *   - <TextInput value onSubmit> — 单行提交
 *   - multi-line buffer 用 useState 维护: 拿到单行后:
 *     - 行末 `\\` → 实际 `\\` 字符 (转义)
 *     - 行末 `\` (非 \\) → 续行, 缓存 buffer + 提示 `> ` prefix
 *     - 空 `\` → 取消续行, 提交空 prompt
 *     - 其它 → 提交 buffer + line (join `\n`)
 *
 * 历史: useHistory hook 提供 historyItems, 透传给 ink-text-input.
 */

import { useState, type ReactElement } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'

export interface PromptProps {
  theme?: TuiTheme
  history: string[]
  /** turn 完成时调 (assembled = multi-line joined, 已 trim) */
  onSubmit: (assembled: string) => void
  /** 占位符 */
  placeholder?: string
  /** 禁用 (turn in-flight, 不接受 input) */
  disabled?: boolean
}

interface Continuation {
  /** 累积 buffer (含已 `\` 续行的多行) */
  buffer: string
  /** 这是第几行续行 (1-based, 给 > 提示) */
  lineNo: number
}

export function Prompt({
  theme = THEMES.default,
  history,
  onSubmit,
  placeholder = '› message (\\ to continue, empty \\ to cancel)',
  disabled = false,
}: PromptProps): ReactElement {
  const [cont, setCont] = useState<Continuation | null>(null)
  const [value, setValue] = useState('')

  const handleSubmit = (line: string): void => {
    // 1. 处理续行 (D-22.3)
    if (line.endsWith('\\\\')) {
      // `\\` 末 → 实际 `\` 字符, 提交 (不续行)
      const unescaped = line.slice(0, -1) + '\\\\'
      const assembled = cont ? `${cont.buffer}\n${unescaped}` : unescaped
      onSubmit(assembled)
      setCont(null)
      setValue('')
      return
    }
    if (line.endsWith('\\')) {
      // `\` 末 (非 `\\`) → 续行, 缓存 buffer
      const trimmed = line.slice(0, -1)
      setCont({
        buffer: cont ? `${cont.buffer}\n${trimmed}` : trimmed,
        lineNo: (cont?.lineNo ?? 0) + 1,
      })
      setValue('')
      return
    }
    // 2. 正常提交
    const assembled = cont ? `${cont.buffer}\n${line}` : line
    onSubmit(assembled)
    setCont(null)
    setValue('')
  }

  if (disabled) {
    return (
      <Box>
        <Text color={theme.divider}>(turn in flight, Ctrl+C to abort)</Text>
      </Box>
    )
  }

  // 续行模式: 提示符变 `> ` (跟 tui.ts multi-line 1:1)
  const prefix = cont
    ? colorize(`... (${cont.lineNo + 1}) > `, 'prompt', theme)
    : colorize('› ', 'prompt', theme)

  return (
    <Box>
      <Text>{prefix}</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={cont ? undefined : placeholder}
        // 透传 history 给 ink-text-input (它自带 ↑↓ 翻历史)
        {...(history.length > 0 ? { historyItems: history } : {})}
      />
    </Box>
  )
}
