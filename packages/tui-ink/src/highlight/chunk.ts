/**
 * 语法高亮 chunk — D-23.2 搬容器.
 *
 * 业务逻辑 0 重写, 跟 packages/coding-agent/src/modes/tui.ts line 210-290 的
 * highlightChunk 1:1 同步. Ink 容器内, 染色后 string 直接喂 <Text> (Ink 会识别
 * ANSI escape, 跟 readline 写 stdout 行为一致).
 *
 * 4 类 (3 染 + 1 不染):
 *   1. tool name  → toolName role
 *   2. number     → success role
 *   3. path       → model role
 *   4. 其它        → 原样
 *
 * 优先级: tool > path > number (用 "先标记后还原" 算法, 区间去重).
 *
 * 非 TTY 退化: 跟 colorize 一致, 返原文 (CI / 管道 log 不带 ANSI).
 * forceColor 测试 hook: 第 3 参, 给 unit test 验染色字节用 (生产路径不传).
 */

import { stdout } from 'node:process'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'

export type HighlightRole = 'toolName' | 'success' | 'model'

interface Range {
  start: number
  end: number
  role: HighlightRole
}

/** 9 工具白名单 (跟 registry.createDefaultRegistry 同步, 跟 D-23.2 1:1) */
const TOOL_NAME_RE =
  /(BashTool|ReadFileTool|WriteFileTool|EditTool|GlobTool|GrepTool|ListDirectoryTool|FileReadTool|FileWriteTool)/g

/** 数字 (含 `+` 后缀, 整数/小数/百分号/倍数/货币) */
const NUMBER_RE = /(\d+(?:\.\d+)?(?:%|x|万|亿|k|K|M|B)?\+?)/g

/** 文件路径 (`./rel` / `/abs` / `node_modules/...`) */
const PATH_RE = /(\.\/[^\s]+|\/[^\s]+|node_modules\/[^\s]+)/g

/**
 * 语法高亮 chunk content. 非 TTY 退化到原 text (跟 colorize 行为一致, 跟 CI/管道 log 兼容).
 *
 * @param text - 1 个 chunk 文本 fragment (assistant stream)
 * @param theme - 当前 theme (从 App 闭包传入)
 * @param forceColor - 测试 hook: true 强制染色 (非 TTY 也染), false 强制不染. 生产不传.
 * @returns 染色后文本 (含 ANSI escape) 或原 text
 */
export function highlightChunk(
  text: string,
  theme: TuiTheme = THEMES.default,
  forceColor?: boolean,
): string {
  if (text.length === 0) return text
  const shouldColor = forceColor !== undefined ? forceColor : Boolean(stdout.isTTY)
  if (!shouldColor) return text

  // 1. 扫 3 遍正则, 收集 [start, end, role] 区间 (按优先级 tool > path > number)
  const ranges: Range[] = []
  collectRanges(text, TOOL_NAME_RE, 'toolName', ranges)
  collectRanges(text, PATH_RE, 'model', ranges)
  collectRanges(text, NUMBER_RE, 'success', ranges)

  if (ranges.length === 0) return text

  // 2. 区间去重: 优先级 tool > path > number, 后扫到的覆盖先扫到的
  ranges.sort((a, b) => a.start - b.start || a.end - b.end)

  // 3. 按顺序拼 (区间内用 theme 染色, 区间外原文)
  const parts: string[] = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start < cursor) continue // 已被更高优先级覆盖
    if (r.start > cursor) parts.push(text.slice(cursor, r.start))
    parts.push(colorize(text.slice(r.start, r.end), r.role, theme))
    cursor = r.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))

  return parts.join('')
}

function collectRanges(text: string, re: RegExp, role: HighlightRole, out: Range[]): void {
  // Reset lastIndex (RegExp with /g flag carries state)
  re.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index === re.lastIndex) {
      re.lastIndex++ // avoid infinite loop on zero-width match
      continue
    }
    out.push({ start: match.index, end: match.index + match[0].length, role })
  }
}
