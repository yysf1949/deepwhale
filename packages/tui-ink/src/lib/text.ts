/**
 * @deepwhale/tui-ink — text 工具 (D-26 C1, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/lib/text.ts 简化版 (1:1 行为 80%):
 *   - ANSI 转义处理 (stripAnsi / hasAnsi) — Hermes 拍板 (任何 ANSI escape 检
 *     测跟算 visible width 都需要)
 *   - 行清理 (sanitizeLine) — Hermes renderEstimateLine 简化版, 去掉 markdown 装饰
 *   - 估算工具 (estimateTokensRough) — Hermes 拍,跟 deepwhale tui-ink StatusBar 4 字段复用
 *   - 数字格式化 (fmtK) — Hermes 1:1, "1.2K" / "3.4M" 风格 (跟 tui.ts formatUsageStatus 同)
 *
 * 不做 (defer D-27+):
 *   - thinking preview 渲染 (Hermes 197 行, D-27 markdown + thinking 折叠 sprint 拍)
 *   - paste token label / 大 paste 折 snip (D-28 composer 状态机 sprint 拍)
 *   - tool trail label / parse (D-29 turn state machine 拍)
 */

const ESC = String.fromCharCode(27)
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g')

/** D-26 C1: 去掉 ANSI 转义码, 跟 Hermes 1:1. */
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '')

/** D-26 C1: 含 ANSI 转义? Hermes 1:1 (用 ESC[ 或 ESC] 探测). */
export const hasAnsi = (s: string): boolean => s.includes(`${ESC}[`) || s.includes(`${ESC}]`)

/**
 * D-26 C1: 估算 token 数 (跟 Hermes text.ts estimateTokensRough 1:1).
 * 4 字符/token 粗估 (OpenAI gpt-3.5 经验值), 0 字符返 0.
 * 用途: tui StatusBar usage 显示, D-25 已 ship 4 字段不动.
 */
export const estimateTokensRough = (text: string): number =>
  !text ? 0 : Math.ceil((text.length + 3) / 4)

/**
 * D-26 C1: K/M/B/T 紧凑格式化, 跟 Hermes fmtK 1:1.
 * 1234 -> "1.2K", 1234567 -> "1.2M", etc.
 * 用于: tui 状态栏数字 (跟 formatUsageStatus 4 字段复用).
 */
export const fmtK = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  return `${(n / 1_000_000_000).toFixed(1)}B`
}

/**
 * D-26 C1: 行清理 (Hermes renderEstimateLine 简化版).
 * 去掉 markdown 装饰, 留核心 text. 用于: tui Transcript 印前清理 (跟 D-23.2 highlight
 * 配合, highlight 处理 ANSI 包裹, sanitize 处理 markdown raw 装饰).
 *
 * 不做 (defer D-27): 完整 GFM (heading / table / footnote / autolink), D-27 markdown
 * 引擎 sprint 拍, 现在只做 inline 装饰清理.
 */
export const sanitizeLine = (line: string): string => {
  return line
    // ![alt](url) image
    .replace(/!\[(.*?)\]\(([^)\s]+)\)/g, '[image: $1]')
    // [text](url) link
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    // `code`
    .replace(/`([^`]+)`/g, '$1')
    // **bold**
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // __bold__
    .replace(/__(.+?)__/g, '$1')
    // *italic*
    .replace(/\*(.+?)\*/g, '$1')
    // _italic_
    .replace(/_(.+?)_/g, '$1')
    // ~~strike~~
    .replace(/~~(.+?)~~/g, '$1')
    // ==highlight==
    .replace(/==(.+?)==/g, '$1')
    // [^footnote]
    .replace(/\[\^([^\]]+)\]/g, '[$1]')
    // heading 装饰 (#, ##, etc.)
    .replace(/^#{1,6}\s+/, '')
    // list bullet / number 简化
    .replace(/^\s*[-*+]\s+\[( |x|X)\]\s+/, (_m, checked: string) =>
      `• [${checked.toLowerCase() === 'x' ? 'x' : ' '}] `)
    .replace(/^\s*[-*+]\s+/, '• ')
    .replace(/^\s*(\d+)\.\s+/, '$1. ')
    // blockquote
    .replace(/^\s*(?:>\s*)+/, '│ ')
}
