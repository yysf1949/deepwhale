/**
 * @deepwhale/tui-ink — Markdown 组件 (D-27 D2, 跟 Hermes ui-tui markdown 1:1).
 *
 * 跟 Hermes ui-tui/src/components/markdown.tsx 1:1 (Hermes 648 行大组件).
 * D-27 简化: 走 markdown/render.tsx (5 类基础 1:1 拍 Hermes 80% 行为).
 *
 * 拍板 (D-27 §3.3 D2):
 *   - inline prop: false (default) 走 block 渲染 (每个 markdown 块 1 个 Box, 1:1 Hermes)
 *                   true 走 inline 渲染 (整段 text 1 个 Text, 给 streaming / 短答案用)
 *   - 默认 raw, 显式 opt-in (跟 D-27 D2 拍板)
 *   - 0 footnote / autolink / nested fence (D-29+ 升级)
 *
 * 业务 0 改, 1:1 拍 Hermes Markdown 组件 80% 行为.
 */

import { Fragment, type ReactElement } from 'react'
import { Box, Text } from 'ink'
import { renderMarkdown } from '../markdown/render.jsx'
import type { TuiTheme } from '../theme/index.js'

export interface MarkdownProps {
  /** markdown 源文本 */
  text: string
  theme: TuiTheme
  /**
   * inline 渲染: 整段 text 1 个 Text 节点 (适合 streaming / 短答案)
   * block 渲染 (default): 每个 markdown 块 1 个 Box 节点 (适合 fence / heading / table)
   *
   * D-27 D2 拍: default false (block), 跟 Hermes 1:1
   */
  inline?: boolean
}

/**
 * D-27 D2: <Markdown/> 组件 — 5 类基础 markdown 1:1 拍 Hermes ui-tui.
 *
 * 0 改业务, 0 改 D-24.2 Transcript (默认 opt-in 拍板), 跟 Hermes Markdown 1:1 行为.
 */
export function Markdown({ text, theme, inline = false }: MarkdownProps): ReactElement {
  const nodes = renderMarkdown(text, theme)
  if (inline) {
    // inline 模式: 整段 text 单 Text 节点 (跟 streaming 短答案用, 跟 Hermes streaming fallback 1:1)
    // 简化: 0 嵌 React.Fragment, 直接 renderMarkdown 拼数组 <Text>{nodes}</Text>
    return (
      <Text>
        {nodes.map((node, i) => (
          <Fragment key={`md-inline-${i}`}>{node}</Fragment>
        ))}
      </Text>
    )
  }
  // block 模式 (default): 每 markdown 块 1 个 Box (fence border / heading 字号 / table 对齐)
  // 跟 Hermes 1:1 走 <Box flexDirection='column'>{nodes}</Box>
  return (
    <Box flexDirection="column">
      {nodes}
    </Box>
  )
}
