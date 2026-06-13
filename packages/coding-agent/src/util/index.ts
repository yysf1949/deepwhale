/**
 * @deepwhale/coding-agent — util barrel (D-25 B4, 跟 tui-ink + tui.ts 共享)
 *
 * D-25 B4 (2026-06-06) 拍板: 抽跨包共享 util 到这里, 跟 tui-ink 复用红线一致.
 *   - 0 改业务实现, 只做 re-export
 *   - 跟 D-24.2 policy/index.ts barrel 模式 1:1
 *
 * 当前 (B4): 1 个 util
 *   - tui-history: 抽 tui-ink/src/history/index.ts 86 行到 coding-agent util,
 *     跟 modes/tui.ts 共享, 0 业务重写, 0 删已有测
 *
 * 后续 sprint (D-26+) 可能加:
 *   - memory, clipboard, osc52, syntax 等 (Hermes ui-tui 对齐)
 */
export {
  tuiHistoryPath,
  tuiHistoryLoad,
  tuiHistoryAppend,
  tuiHistoryTruncate,
  TUI_HISTORY_MAX,
} from './tui-history.js';
// Sprint 1c-revive-3-D-30.1δ.1 (2026-06-07): ~/.deepwhale/ 4 路径 + memory store
// 跟 tui-history 形态 1:1 兼容 (优先 DEEPWHALE_HOME env > USERPROFILE > HOME).
export {
  resolveDeepwhaleHome,
  deepwhaleRoot,
  deepwhaleMemoryDir,
  deepwhaleMemoryFile,
  deepwhaleUserFile,
  deepwhaleSkillsDir,
  deepwhaleCronDir,
  deepwhaleCronJobsFile,
  deepwhaleSessionsDbPath,
} from './deepwhale-paths.js';
export { MemoryStore } from './memory-store.js';
// Sprint 1c-revive-3-D-30.1δ.8 (2026-06-07): skill store.
export { SkillStore } from './skill-store.js';
// Sprint 1c-revive-3-D-30.1δ.9 (2026-06-07): cron store.
// D132 (2026-06-13): persisted cron run records.
export { CronStore } from './cron-store.js';
export type { CronJob, CronRunRecord, CronRunStatus } from './cron-store.js';
// Sprint 1c-revive-3-D-30.1δ.10 (2026-06-07): JSON 兜底 sessions-index (替 FTS5).
export { SessionIndex } from './session-index.js';
export type { SessionEntry } from './session-index.js';
// D-30.3.3 (2026-06-07): skill auto-load (启动时 detect ~/.deepwhale/skills).
export { SkillLoader } from './skill-loader.js';
export type { LoadedSkill } from './skill-loader.js';
// D-30.3.4 (2026-06-07): cron daemon timer boundary (setInterval tick -> onTick).
export { CronDaemon } from './cron-daemon.js';
export type { CronTickHandler } from './cron-daemon.js';
// D132 (2026-06-13): injected runner automation runtime.
export { AutomationRuntime } from './automation-runtime.js';
export type {
  AutomationRunner,
  AutomationRunnerResult,
  AutomationRuntimeOptions,
} from './automation-runtime.js';
