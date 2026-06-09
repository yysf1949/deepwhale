/**
 * @deepwhale/coding-agent — TUI 历史持久化 util (D-25 B4, 跟 tui.ts + tui-ink 1:1).
 *
 * 业务逻辑 0 重写, 跟 packages/coding-agent/src/modes/tui.ts line 293-343 的
 * tuiHistoryPath / tuiHistoryLoad / tuiHistoryAppend 1:1 同步.
 *
 * D-25 B4 (2026-06-06) — 抽 tui-ink history 到 coding-agent util, tui-ink 复用:
 *   - 修前: tui-ink/src/history/index.ts 86 行 copy, 跟 modes/tui.ts 三处实现各管各
 *   - 修后: 唯一实现 在这里, tui-ink 走 thin re-export, modes/tui.ts 1:1 同步
 *   - 跨包消费: tui-ink + legacy readline 容器都 import 这个 util
 *
 * D-25 A1 (F4) — Windows tui-smoke history 测试 fail (HOME vs USERPROFILE) 修:
 *   - tuiHistoryPath(homeOverride?) 新签名: 优先 homeOverride > DEEPWHALE_HOME env >
 *     USERPROFILE (Windows 原生) > HOME (Unix + 测试 mock) > homedir() 兜底
 *   - tuiHistoryLoad / tuiHistoryAppend 接 homeOverride 透传
 *   - 兼容: legacy `tuiHistoryPath()` 0 参 = 走 env 探测, 不破坏老调用方
 *
 * 文件: <home>/.deepwhale/tui-history (JSONL, 每行 1 条 raw line)
 * 上限: 1000 条 (LRU 截断, 防无限增长)
 *
 * 注意: readline 历史上依赖 `rl.history = loaded.reverse()` (readline 期望最新在尾部).
 * Ink 容器用 `useState` 维护 history, load 时同样 reverse (保持跟 readline 一致).
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { resolveDeepwhaleHome } from './deepwhale-paths.js'

export const TUI_HISTORY_MAX = 1000

/**
 * D-25 A1: 解析 home dir, 3 路径优先级:
 *   1. homeOverride 显式入参 (测试 / 业务透传)
 *   2. DEEPWHALE_HOME env (用户 / 部署)
 *   3. HOME > USERPROFILE (Windows) > homedir() 兜底
 */
function resolveTuiHome(homeOverride?: string): string {
  return resolveDeepwhaleHome(homeOverride)
}

/**
 * D-25 A1: 新签名接受 homeOverride. 不传走 3 路径优先级探测.
 * 旧 0 参调用方 (legacy tui.ts, test 4) 0 改.
 */
export function tuiHistoryPath(homeOverride?: string): string {
  return join(resolveTuiHome(homeOverride), '.deepwhale', 'tui-history')
}

export function tuiHistoryLoad(homeOverride?: string): string[] {
  const p = tuiHistoryPath(homeOverride)
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

export function tuiHistoryAppend(line: string, homeOverride?: string): void {
  if (!line || !line.trim()) return
  const p = tuiHistoryPath(homeOverride)
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
