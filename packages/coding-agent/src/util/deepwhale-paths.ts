/**
 * @deepwhale/coding-agent — ~/.deepwhale/ 4 路径解析 util (D-30.1δ.1, 2026-06-07).
 *
 * 拍板 (D-30.1δ):
 *   - 4 持久 dir/db 路径 (memory / skills / cron / sessions.db) 抽到统一 util.
 *   - 跟 tui-history (D-25 B4) 形态 1:1: 优先 DEEPWHALE_HOME env > USERPROFILE (Win) >
 *     HOME (Unix/test mock) > homedir() 兜底.
 *   - 0 改业务, 5 红线 0 触碰 (红线 = 1ceef94 / D-19.5 P2 / 6afccc8 / D-19.6 /
 *     no-unsafe-finally, 跟路径解析 0 交集).
 *
 * 路径 (跟 plan 1:1):
 *   - <root>/memory/MEMORY.md   — 跨 session 累积的事实 / 偏好 / 教训
 *   - <root>/memory/USER.md     — 用户身份 / 角色 / 项目背景
 *   - <root>/skills/<name>/SKILL.md — skill 库 (按目录, 每 skill 一个 SKILL.md)
 *   - <root>/cron/jobs.json     — 定时任务定义
 *   - <root>/sessions.db        — SQLite FTS5 索引 (D-30.1δ.10 装)
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * D-30.1δ.1: 解析 deepwhale root, 3 路径优先级 (跟 tui-history 1:1):
 *   1. homeOverride 显式入参 (测试 / 业务透传)
 *   2. DEEPWHALE_HOME env (用户 / 部署)
 *   3. USERPROFILE (Windows 原生) > HOME (Unix + 测试 mock) > homedir() 兜底
 */
export function resolveDeepwhaleHome(homeOverride?: string): string {
  if (homeOverride && homeOverride.length > 0) return homeOverride
  const env = process.env['DEEPWHALE_HOME']
  if (env && env.length > 0) return env
  const windowsHome = process.env['USERPROFILE']
  if (windowsHome && windowsHome.length > 0) return windowsHome
  const unixHome = process.env['HOME']
  if (unixHome && unixHome.length > 0) return unixHome
  return homedir()
}

/** ~/.deepwhale/ root. */
export function deepwhaleRoot(homeOverride?: string): string {
  return join(resolveDeepwhaleHome(homeOverride), '.deepwhale')
}

/** ~/.deepwhale/memory/ */
export function deepwhaleMemoryDir(homeOverride?: string): string {
  return join(deepwhaleRoot(homeOverride), 'memory')
}

/** ~/.deepwhale/memory/MEMORY.md */
export function deepwhaleMemoryFile(homeOverride?: string): string {
  return join(deepwhaleMemoryDir(homeOverride), 'MEMORY.md')
}

/** ~/.deepwhale/memory/USER.md */
export function deepwhaleUserFile(homeOverride?: string): string {
  return join(deepwhaleMemoryDir(homeOverride), 'USER.md')
}

/** ~/.deepwhale/skills/ */
export function deepwhaleSkillsDir(homeOverride?: string): string {
  return join(deepwhaleRoot(homeOverride), 'skills')
}

/** ~/.deepwhale/cron/ */
export function deepwhaleCronDir(homeOverride?: string): string {
  return join(deepwhaleRoot(homeOverride), 'cron')
}

/** ~/.deepwhale/cron/jobs.json */
export function deepwhaleCronJobsFile(homeOverride?: string): string {
  return join(deepwhaleCronDir(homeOverride), 'jobs.json')
}

/** ~/.deepwhale/sessions.db (SQLite FTS5 索引, D-30.1δ.10 装) */
export function deepwhaleSessionsDbPath(homeOverride?: string): string {
  return join(deepwhaleRoot(homeOverride), 'sessions.db')
}
