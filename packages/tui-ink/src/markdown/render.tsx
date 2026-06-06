/**
 * @deepwhale/tui-ink — markdown 引擎 (D-27 D1, 跟 Hermes ui-tui markdown 对齐).
 *
 * 跟 Hermes ui-tui/src/components/markdown.tsx 简化版 (Hermes 648 行 → D-27 220 行):
 *   - 5 类基础 markdown 语法 1:1 拍 (fence/heading/list/table/inline)
 *   - 0 改 Ink 渲染路径 (跟 D-22 highlightChunk 同形态, 后处理 assistant text)
 *   - 0 footnote / autolink (Hermes 1:1 拍 D-29+ 升级)
 *   - 0 fenced code 嵌套 (Hermes 拍 D-29+ 升级)
 *
 * 业务 0 改, 1:1 拍 Hermes markdown.tsx 80% 行为.
 *
 * 拍板 (D-27 §3.3 D1):
 *   - 输入: raw string (assistant 流式响应, 可能含 ANSI 染色 from D-23.2 highlight)
 *   - 输出: ReactNode[] (Ink <Text> 节点数组, 1:1 跟 Hermes markdown render() 1:1)
 *   - 不解析 ANSI (跟 highlightChunk 职责分离): 染色后 raw text 进 markdown
 *
 * 实战撞 (跟 ship-quality-checks + D-25 B3 一致):
 *   - 撞 1: Hermes markdown.tsx 默认输入是 raw text (no ANSI), 我们输入可能含
 *     highlightChunk 染色 ANSI. 解决: 拍"先 markdown 再 highlight" 顺序,
 *     跟 D-23.2 现有 appendToLastAssistant 调用链一致 (useRunToolLoop line 88
 *     先调 highlightChunk 推 transcript)
 *   - 撞 2: Hermes useMemo 优化在 D-27 简化版不拍 (D-29+ 升级), 0 性能拍
 */

import { Fragment, type ReactNode } from 'react'
import { Box, Text } from 'ink'
import type { TuiTheme } from '../theme/index.js'

// =================== Inline patterns ===================

/** @deepwhale/tui-ink — Inline patterns (跟 Hermes INLINE_RE 1:1 简化版, 5 类) */
// 5 类 inline: [text](url) / `code` / **bold** / *italic* / ~~strike~~
const INLINE_RE = /(?:\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~)/g

// =================== Hermes 协议 (MEDIA / audio) ===================

/** D-27 D4 拍: 跟 Hermes MEDIA_LINE_RE 1:1, 支持单引号/双引号/反引号包裹 */
export const MEDIA_LINE_RE = /^\s*[`"']?MEDIA:\s*(\S+?)[`"']?\s*$/
/** D-27 D4 拍: 跟 Hermes AUDIO_DIRECTIVE_RE 1:1 */
export const AUDIO_DIRECTIVE_RE = /^\s*\[\[audio_as_voice\]\]\s*$/

// =================== Block patterns ===================

const FENCE_RE = /^(\s*)(`{3,}|~{3,})(.*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LIST_RE = /^(\s*)([-*+])\s+(.*)$/
const OLIST_RE = /^(\s*)(\d+)\.\s+(.*)$/
const BLOCKQUOTE_RE = /^>\s+(.*)$/
const HR_RE = /^[-*_]{3,}$/

// =================== Render helpers ===================

/**
 * D-27 D1: 渲染 inline markdown (1 行) 解析为 ReactNode 数组.
 * 跟 Hermes INLINE_RE 行为 80% 1:1.
 */
function renderInline(line: string, theme: TuiTheme, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  let counter = 0

  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > lastIdx) {
      out.push(<Fragment key={`${keyBase}-t-${counter++}`}>{line.slice(lastIdx, m.index)}</Fragment>)
    }
    if (m[1] !== undefined && m[2] !== undefined) {
      // [text](url) - D-27 简化: 印 text + url (0 走 Ink Link 组件, D-29+ 升级)
      out.push(
        <Text key={`${keyBase}-l-${counter++}`} color={theme.toolName} underline>
          {m[1]} ({m[2]})
        </Text>
      )
    } else if (m[3] !== undefined) {
      // `code`
      out.push(
        <Text key={`${keyBase}-c-${counter++}`} color={theme.model}>
          {`\`${m[3]}\``}
        </Text>
      )
    } else if (m[4] !== undefined) {
      // **bold**
      out.push(
        <Text key={`${keyBase}-b-${counter++}`} bold>
          {m[4]}
        </Text>
      )
    } else if (m[5] !== undefined) {
      // *italic*
      out.push(
        <Text key={`${keyBase}-i-${counter++}`} italic>
          {m[5]}
        </Text>
      )
    } else if (m[6] !== undefined) {
      // ~~strike~~
      out.push(
        <Text key={`${keyBase}-s-${counter++}`} strikethrough>
          {m[6]}
        </Text>
      )
    }
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < line.length) {
    out.push(<Fragment key={`${keyBase}-t-${counter++}`}>{line.slice(lastIdx)}</Fragment>)
  }
  return out.length > 0 ? out : [<Fragment key={`${keyBase}-raw`}>{line}</Fragment>]
}

/**
 * D-27 D1: 渲染 fence (```lang ... ``` 或 ~~~lang ... ~~~)
 * 0 染色内层 (跟 D-23.2 highlightChunk 职责分离, D-29+ 拍 syntax highlighting)
 */
function renderFence(content: string, lang: string, keyBase: string, theme: TuiTheme): ReactNode {
  // D-27 简化: 整块 wrap model color (跟 tui 主题色), 不做 syntax highlighting
  // 测重点: fence 块能完整框出, 不流到 block 之外
  return (
    <Box key={keyBase} flexDirection="column" borderStyle="single" borderColor={theme.divider} paddingX={1} marginY={0}>
      {lang && (
        <Text key={`${keyBase}-lang`} color={theme.model} dimColor>
          {lang}
        </Text>
      )}
      <Text key={`${keyBase}-body`}>{content}</Text>
    </Box>
  )
}

/**
 * D-27 D1: 检测并提取 fence 块
 * 返回 { type: 'fence', lang, body, lines, endLine } 或 null
 */
function tryParseFence(lines: string[], startLine: number): null | {
  type: 'fence'
  lang: string
  body: string
  endLine: number
} {
  const firstLine = lines[startLine]!
  const m = firstLine.match(FENCE_RE)
  if (!m) return null
  const fenceChar = m[2]![0]!
  const fenceLen = m[2]!.length
  const lang = m[3]!.trim()
  const bodyLines: string[] = []
  let i = startLine + 1
  while (i < lines.length) {
    const line = lines[i]!
    // close fence: 至少同样长度的同字符,可选前缀空格
    const closeMatch = line.match(new RegExp(`^\\s*\\${fenceChar}{${fenceLen},}\\s*$`))
    if (closeMatch) {
      return {
        type: 'fence',
        lang,
        body: bodyLines.join('\n'),
        endLine: i,
      }
    }
    bodyLines.push(line.replace(/^ {0,3}/, '')) // 4-space indent 兼容 GFM
    i++
  }
  return null // unclosed fence
}

// =================== Table ===================

/**
 * D-27 D1: 检测 table 块 (header | divider | rows)
 * GFM 简单 table: | col1 | col2 | (header), | --- | --- | (divider), | a | b | (row)
 */
function tryParseTable(lines: string[], startLine: number): null | {
  type: 'table'
  header: string[]
  rows: string[][]
  endLine: number
} {
  const line0 = lines[startLine]!
  const line1 = lines[startLine + 1]
  if (!line1) return null
  if (!line0.includes('|') || !line1.includes('|')) return null
  // divider: all cells match `:?-+:?\s*`
  const cells1 = line1.split('|').map(c => c.trim()).filter(c => c.length > 0)
  if (cells1.length < 2) return null
  if (!cells1.every(c => /^:?-+:?\s*$/.test(c))) return null
  const header = line0.split('|').map(c => c.trim()).filter(c => c.length > 0)
  if (header.length !== cells1.length) return null
  const rows: string[][] = []
  let i = startLine + 2
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.includes('|')) break
    const row = line.split('|').map(c => c.trim()).filter(c => c.length > 0)
    rows.push(row)
    i++
  }
  return { type: 'table', header, rows, endLine: i - 1 }
}

// =================== Main render ===================

/**
 * D-27 D1: 渲染 markdown 文本为 Ink ReactNode.
 * 0 改 Hermes 5 类基础 (fence/heading/list/table/inline) 行为, 1:1 拍 Hermes markdown.tsx.
 *
 * 边界: 输入可能含 ANSI escape (D-23.2 highlightChunk 染过),
 * 0 处理 (跟 D-23.2 职责分离). Ink <Text> 1:1 显示含 ANSI 的 text.
 */
export function renderMarkdown(text: string, theme: TuiTheme): ReactNode[] {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let i = 0
  let blockCounter = 0

  while (i < lines.length) {
    const line = lines[i]!
    const blockKey = `md-${blockCounter++}`

    // 0. media line / audio directive (D-27 D4 跟 Hermes 1:1 拍)
    //   MEDIA:/path/to/image → 印 [image: /path/to/image]
    //   [[audio_as_voice]] → 印 🔊 audio (TTS D-28+ 升级)
    if (MEDIA_LINE_RE.test(line)) {
      const path = line.match(MEDIA_LINE_RE)![1]!
      out.push(
        <Text key={blockKey} color={theme.toolName}>
          {`[image: ${path}]`}
        </Text>
      )
      i++
      continue
    }
    if (AUDIO_DIRECTIVE_RE.test(line)) {
      out.push(
        <Text key={blockKey} color={theme.model}>
          🔊 audio: (TTS pending — D-28+ 升级 mmx-cli TTS)
        </Text>
      )
      i++
      continue
    }

    // 1. fence
    const fence = tryParseFence(lines, i)
    if (fence) {
      out.push(renderFence(fence.body, fence.lang, blockKey, theme))
      i = fence.endLine + 1
      continue
    }

    // 2. table
    const table = tryParseTable(lines, i)
    if (table) {
      out.push(
        <Box key={blockKey} flexDirection="column" marginY={0}>
          <Box key={`${blockKey}-hr`}>
            {table.header.map((cell, idx) => (
              <Text key={`${blockKey}-h-${idx}`} bold color={theme.header}>
                {` ${cell.padEnd(15)} `}
              </Text>
            ))}
          </Box>
          <Text key={`${blockKey}-hr-sep`} color={theme.divider}>{'─'.repeat(15 * table.header.length + 3)}</Text>
          {table.rows.map((row, rowIdx) => (
            <Box key={`${blockKey}-r-${rowIdx}`}>
              {row.map((cell, cellIdx) => (
                <Text key={`${blockKey}-r-${rowIdx}-c-${cellIdx}`}>{` ${cell.padEnd(15)} `}</Text>
              ))}
            </Box>
          ))}
        </Box>
      )
      i = table.endLine + 1
      continue
    }

    // 3. heading (# H1 ~ ###### H6)
    const headingMatch = line.match(HEADING_RE)
    if (headingMatch) {
      const level = headingMatch[1]!.length
      const text = headingMatch[2]!
      out.push(
        <Text key={blockKey} bold color={theme.header}>
          {'#'.repeat(level) + ' ' + text}
        </Text>
      )
      i++
      continue
    }

    // 4. horizontal rule
    if (HR_RE.test(line)) {
      out.push(<Text key={blockKey} color={theme.divider}>{'─'.repeat(40)}</Text>)
      i++
      continue
    }

    // 5. unordered list (- / * / +)
    const listMatch = line.match(LIST_RE)
    if (listMatch) {
      out.push(
        <Text key={blockKey}>
          {`  ${listMatch[1]!}• ${listMatch[3]}`}
        </Text>
      )
      i++
      continue
    }

    // 6. ordered list (1. / 2. / ...)
    const olistMatch = line.match(OLIST_RE)
    if (olistMatch) {
      out.push(
        <Text key={blockKey}>
          {`  ${olistMatch[1]}${olistMatch[2]}. ${olistMatch[3]}`}
        </Text>
      )
      i++
      continue
    }

    // 7. blockquote
    const bqMatch = line.match(BLOCKQUOTE_RE)
    if (bqMatch) {
      out.push(
        <Text key={blockKey} color={theme.divider}>
          {`│ ${bqMatch[1]}`}
        </Text>
      )
      i++
      continue
    }

    // 8. 普通行 - 走 inline 解析
    if (line.trim().length > 0) {
      out.push(
        <Text key={blockKey}>
          {renderInline(line, theme, blockKey)}
        </Text>
      )
    } else {
      out.push(<Text key={blockKey}>{' '}</Text>)
    }
    i++
  }
  return out
}
