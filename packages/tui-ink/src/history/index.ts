/**
 * @deepwhale/tui-ink — TUI history thin re-export (D-25 B4, 跟 coding-agent util 共享).
 *
 * D-25 B4 (2026-06-06) — 抽 tui-ink history 到 coding-agent util, tui-ink 复用:
 *   - 修前: tui-ink/src/history/index.ts 86 行 copy, 跟 modes/tui.ts 三处实现各管各
 *   - 修后: 唯一实现在 coding-agent/src/util/tui-history.ts,
 *     tui-ink 走 thin re-export, modes/tui.ts 1:1 同步
 *
 * 业务 0 重写, public API 0 改 (tui-ink history 还是这 4 个 export + 1 个 const).
 * 内部 useHistory.ts 跟 index.tsx 还是从 '../history/index.js' import, 0 改.
 *
 * 兼容性 (D-25 plan §3.1 B4 拍板 "3 格式互读不破坏"):
 *   - 旧 raw line JSONL (D-22.1 readline 容器写) — `lines = raw.split('\n')` 读
 *   - 新 raw line JSONL (D-25 A1 后 tui-ink 写) — 跟旧同形态
 *   - 升级迁移: 0 必要, 格式一致
 */

export {
  tuiHistoryPath,
  tuiHistoryLoad,
  tuiHistoryAppend,
  tuiHistoryTruncate,
  TUI_HISTORY_MAX,
} from '@deepwhale/coding-agent';
