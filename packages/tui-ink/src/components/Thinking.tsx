/**
 * @deepwhale/tui-ink — Thinking 组件 (D-27 D3, 跟 Hermes ui-tui thinking 对齐).
 *
 * 跟 Hermes ui-tui/src/components/thinking.tsx 1:1 简化版 (Hermes 995 行 → D-27 50 行):
 *   - 折叠 reasoning 块 (跟 Hermes 1:1 行为 80%)
 *   - 3 状态拍 'collapsed' (default) / 'expanded' / 'hidden'
 *   - D-27 简化: 0 折叠交互 (setState 0 触发), 跟 D-24.2 highlightChunk 0 交互拍板一致
 *   - D-28+ 升级: 折叠交互 (useState 触发), 跟 Hermes thinking.tsx 1:1
 *   - 0 subagent progress 渲染 (D-29+ 升级)
 *
 * 业务 0 改, 1:1 拍 Hermes 1:1 行为.
 *
 * 拍板 (D-27 §3.3 D3):
 *   - reasoning 字段 0 染色 (raw text, 跟 D-23.2 highlightChunk 职责分离)
 *   - 0 折叠切换 (D-28+ 升级拍), 但 initialState 拍 3 状态支持
 *   - 0 footnote / autolink (D-29+ 升级)
 */

import type { ReactElement } from 'react'
import { Box, Text } from 'ink'
import { colorize, type TuiTheme } from '../theme/index.js'

export interface ThinkingProps {
  /** reasoning_content 累积文本 (D-27 D3 useRunToolLoop 推) */
  reasoning: string
  theme: TuiTheme
  /**
   * 初始折叠状态 (default: 'collapsed', 跟 Hermes 1:1).
   * - 'collapsed': 显示 '💭 thinking...' + 折叠 1 行
   * - 'expanded':  显示完整 reasoning (多行)
   * - 'hidden':    0 显示 (跟 D-23.2 raw text 0 染色 1:1)
   *
   * D-27 D3 简化: 静态拍板, 0 折叠交互 (D-28+ 升级)
   */
  initialState?: 'collapsed' | 'expanded' | 'hidden'
}

/**
 * D-27 D3: <Thinking/> 组件 — DeepSeek V4 thinking mode 折叠渲染.
 *
 * 0 改业务, 0 改 Transcript 默认行为 (reasoning 字段空时 0 渲染, 跟 D-24.2 1:1).
 */
export function Thinking({
  reasoning,
  theme,
  initialState = 'collapsed',
}: ThinkingProps): ReactElement | null {
  // 边界: 空 reasoning 0 渲染
  if (!reasoning || reasoning.length === 0) return null
  if (initialState === 'hidden') return null

  // 折叠模式: 1 行缩略显示
  if (initialState === 'collapsed') {
    const preview = reasoning.slice(0, 60).replace(/\n/g, ' ')
    return (
      <Box>
        <Text>{colorize('💭 ', 'model', theme)}</Text>
        <Text dimColor>{preview}{reasoning.length > 60 ? '...' : ''}</Text>
        <Text>{colorize('  (press to expand)', 'divider', theme)}</Text>
      </Box>
    )
  }

  // 展开模式: 多行完整 reasoning
  const lines = reasoning.split('\n')
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.divider} paddingX={1} marginY={0}>
      <Box>
        <Text>{colorize('💭 thinking', 'model', theme)}</Text>
        <Text>{colorize('  (press to collapse)', 'divider', theme)}</Text>
      </Box>
      {lines.map((line, idx) => (
        <Text key={`think-${idx}`}>{line}</Text>
      ))}
    </Box>
  )
}
