/**
 * REPL runtime state — Sprint 1c-revive-3-D-29.3.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1c-revive-3-D-19.5 (2026-06-05): turnInFlight / lineQueue / pendingExit
 *   state machine 拍板. Sprint 1c-revive-3-D-19.6 (2026-06-05): exitTimer 30s 兜底.
 *   Sprint 1c-revive-3-D-29.3.1 (2026-06-07): exiting / exitTimer 抽 ReplFinishState
 *   共享.
 *
 * 拍板 (D-29.3.2):
 *   - 文件: `repl-state.ts` (kebab-case, 跟其它 `repl-*.ts` 同形态).
 *   - 公共: 5 字段 mutable state, 跨 finish / line / close handler / prompt 共享.
 *     - exiting        finish 写者, prompt 读者 (守卫幂等)
 *     - exitTimer      finish 写者 (clear), close handler 写者 (setTimeout)
 *     - turnInFlight   line handler 读写, close handler 读
 *     - pendingExit    line handler 写, close handler 写, line finally 读
 *     - lineQueue      line handler 写 (push), line finally 读 (shift drain)
 *   - 行为 1:1 保 D-19.5 / D-19.6 / 6afccc8 / D-19.6.1 4 段红线 — state 读写顺序
 *     跟原闭包变量一致, 0 业务改.
 *   - module-private (不 re-export): state 是 startRepl 内部状态, 外部不可见.
 *
 * 拍板 (D-29.3.2 §out of scope):
 *   - 不抽 startRepl 顶层 — 留给 D-29.4+.
 *   - 不动 5 红线 (state 字段保留原 5 字段, 顺序 1:1).
 */

export interface ReplState {
  /** finish 写者 (true 时 finish 已跑). prompt + finally 块守卫幂等. */
  exiting: boolean;
  /** finish 写者 (clear+null) + close handler 写者 (setTimeout 30s 兜底). */
  exitTimer: NodeJS.Timeout | null;
  /** line handler 读写 (派发前查, finally 设 false). */
  turnInFlight: boolean;
  /** line handler 写 (/exit fast-path) + close handler 写 (EOF) + line finally 读. */
  pendingExit: boolean;
  /** line handler 写 (push), line finally 读 (shift drain setImmediate). */
  lineQueue: string[];
}
