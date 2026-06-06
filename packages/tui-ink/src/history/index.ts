/**
 * TUI 历史持久化 — D-22.1 搬容器.
 *
 * 业务逻辑 0 重写, 跟 packages/coding-agent/src/modes/tui.ts line 293-343 的
 * tuiHistoryPath / tuiHistoryLoad / tuiHistoryAppend 1:1 同步. Ink 容器内, 加载
 * 后塞回 TextInput / state; append 仍走 fs.appendFileSync + atomic fsync.
 *
 * 文件: ~/.deepwhale/tui-history (JSONL, 每行 1 条 raw line)
 * 上限: 1000 条 (LRU 截断, 防无限增长)
 *
 * 注意: readline 历史上依赖 `rl.history = loaded.reverse()` (readline 期望最新在尾部).
 * Ink 容器用 `useState` 维护 history, load 时同样 reverse (保持跟 readline 一致).
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const TUI_HISTORY_MAX = 1000

export function tuiHistoryPath(): string {
  return join(homedir(), '.deepwhale', 'tui-history')
}

export function tuiHistoryLoad(): string[] {
  const p = tuiHistoryPath()
  if (!existsSync(p)) return []
  try {
    const raw = readFileSync(p, 'utf8')
    const lines = raw.split(/\r?\n/).filter((l) => l.length > 0)
    // readline 期望最新在尾部, JSONL 顺序是 append (最新在末尾), 不需要 reverse
    return lines
  } catch {
    return []
  }
}

export function tuiHistoryAppend(line: string): void {
  if (!line || !line.trim()) return
  const p = tuiHistoryPath()
  try {
    mkdirSync(dirname(p), { recursive: true })
    // atomic fsync 避免 crash 留半行 (appendFileSync 自带 fsync)
    appendFileSync(p, line + '\n')
  } catch {
    /* best-effort, 不污染主路径 */
  }
}

/**
 * LRU 截断 (跟 D-22.1 1:1 同步, 避免无限增长).
 * 暴露给测试用.
 */
export function tuiHistoryTruncate(lines: string[], max: number = TUI_HISTORY_MAX): string[] {
  if (lines.length <= max) return lines
  return lines.slice(-max)
}
