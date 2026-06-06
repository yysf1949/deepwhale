/**
 * @deepwhale/tui-ink — Transcript 组件 (D-24.2 + D-27 D2 markdown 接入).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts line 600-780 流式 + tool call/result 输出 1:1 同步.
 * 业务逻辑 0 重写: 渲染 $transcript store 累积的 entries.
 *
 * D-27 D2 (2026-06-07) markdown 接入 (跟 Hermes ui-tui transcript 1:1):
 *   - markdown prop 默认 false (0 破坏现有 raw text 行为)
 *   - markdown=true 时 assistant entries 走 <Markdown/> 组件 (5 类基础 1:1 渲染)
 *   - user / tool entries 0 走 markdown (raw text, 跟 Hermes 1:1)
 *
 * 用 Ink <Static> (ink>=4): 渲染累积历史 + 流式 last entry.
 *   - 已 seal entries (streaming=false) → <Static> 一次性渲染
 *   - streaming entry (streaming=true) → <Box> 在 Static 之外, 每次 onChunk re-render
 *
 * 这是 readline `out.write` 累积写法的 Ink 对应. 跟 Hermes ui-tui transcript 组件同形态.
 */

import { Box, Static, Text } from 'ink'
import { useStore } from '@nanostores/react'
import { $transcript, type TranscriptEntry } from '../store/ui.js'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'
import { Markdown } from './Markdown.jsx'
import type { ReactElement } from 'react'

export interface TranscriptProps {
  theme?: TuiTheme
  /** D-27 D2: opt-in markdown 渲染 (default false, 0 破坏现有 raw 行为) */
  markdown?: boolean
}

export function Transcript({ theme = THEMES.default, markdown = false }: TranscriptProps): ReactElement {
  const entries = useStore($transcript)
  const lastStreaming = entries[entries.length - 1]
  const isLastStreaming = lastStreaming?.kind === 'assistant' && lastStreaming.streaming === true

  // 已 seal entries (不含最后 streaming 那条) — <Static> 一次渲染, 不重绘
  const sealedEntries = isLastStreaming ? entries.slice(0, -1) : entries

  return (
    <Box flexDirection="column">
      <Static items={sealedEntries}>
        {(entry, index) => (
          <TranscriptRow key={`entry-${index}`} entry={entry} theme={theme} markdown={markdown} />
        )}
      </Static>
      {/* streaming last entry: 在 Static 之外, 每次 onChunk re-render */}
      {isLastStreaming && lastStreaming ? (
        <TranscriptRow entry={lastStreaming} theme={theme} markdown={markdown} />
      ) : null}
    </Box>
  )
}

function TranscriptRow({
  entry,
  theme,
  markdown,
}: {
  entry: TranscriptEntry
  theme: TuiTheme
  markdown: boolean
}): ReactElement {
  switch (entry.kind) {
    case 'user':
      return (
        <Text>
          {colorize('› ', 'prompt', theme)}
          {entry.text}
        </Text>
      )
    case 'assistant': {
      const prefix = colorize('  ', 'model', theme)
      // 染色已在 onChunk 阶段 (D-23.2), 这里直接渲染. streaming 模式给个光标符号.
      if (markdown) {
        // D-27 D2 opt-in: assistant text 走 <Markdown/> 组件
        return (
          <Box flexDirection="column">
            <Text>
              {prefix}
              <Markdown text={entry.text} theme={theme} inline />
            </Text>
            {entry.streaming ? <Text>{colorize('▌', 'prompt', theme)}</Text> : null}
          </Box>
        )
      }
      // 默认 (D-24.2 拍): raw text
      return (
        <Text>
          {prefix}
          {entry.text}
          {entry.streaming ? colorize('▌', 'prompt', theme) : ''}
        </Text>
      )
    }
    case 'tool': {
      const statusGlyph = entry.status === 'success' ? '✓' : '✗'
      const statusColor = entry.status === 'success' ? 'success' : 'error'
      const nameColor = colorize(entry.toolName ?? 'tool', 'toolName', theme)
      return (
        <Text>
          {'  '}
          {colorize(statusGlyph, statusColor, theme)} {nameColor} ({entry.durationMs}ms)
        </Text>
      )
    }
  }
}
