/**
 * REPL close handler — Sprint 1c-revive-3-D-29.3.3 (2026-06-07).
 *
 * 历史:
 *   Sprint 1c-revive-3-D-19.5 (2026-06-05): close handler 加 P2-dismiss (dismiss
 *   confirm 先于 abort) + pendingExit 兜底 finish. Sprint 1c-revive-3-D-19.6
 *   (2026-06-05): P1 close-during-turn 30s 兜底 timer (Q3=b + Q1=A stderr warning).
 *   Sprint 1c-revive-3-D-29.1.1 (2026-06-07): abortIfActive 走 signalCoordinator.
 *   Sprint 1c-revive-3-D-29.3.1 (2026-06-07): exitTimer 走 state.exitTimer 共享.
 *   Sprint 1c-revive-3-D-29.3.2 (2026-06-07): turnInFlight / pendingExit 走 state.
 *
 * 拍板 (D-29.3.3):
 *   - 文件: `repl-close-handler.ts` (kebab-case).
 *   - 公共: createCloseHandler 工厂返 `() => void`, rl.on('close') 直接挂. 4 段
 *     行为 1:1 保: dismiss confirm (audit 顺序) / abortIfActive (in-flight turn)
 *     / pendingExit (finally 兜底) / exitTimer 30s 兜底.
 *   - state 共享: ReplState (5 字段). 写 pendingExit / exitTimer, 读 turnInFlight
 *     (判断要不要启 30s timer).
 *   - 红线 (D-19.5 P2-dismiss + D-19.6 P1): dismiss 先于 abort (audit 顺序);
 *     exitTimer 30s 兜底卡死 turn, 触发时 stderr warning (i18n cli.repl_force_exit_timeout
 *     {0}) + 强制 finish.
 *   - module-private (不 re-export).
 *
 * 拍板 (D-29.3.3 §out of scope):
 *   - 不抽 bootstrap (tryCreateClient + session + compaction) — 留给 D-29.3.4.
 *   - 不动 startRepl 顶层 — 留给 D-29.4+.
 *   - 不写新测试 (D-19 拍板).
 */

import { t as T } from '@deepwhale/core';
import type { ReplConfirmController } from './repl-confirm.js';
import type { ReplSignalCoordinator } from './repl-signal-coordinator.js';
import type { ReplState } from './repl-state.js';

export interface ReplCloseDeps {
  state: ReplState;
  signalCoordinator: ReplSignalCoordinator;
  confirmController: ReplConfirmController;
  finish: (code: number) => Promise<void>;
  err: NodeJS.WritableStream;
  t: typeof T;
}

export function createCloseHandler(deps: ReplCloseDeps): () => void {
  return (): void => {
    // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P2-dismiss 修 ===
    // 拍板: stdin EOF (管道/Ctrl-D) → 优雅退出. dismiss 先于 abort (audit 顺序),
    // pendingExit 让 finally 兜底 finish, exitTimer 30s 兜底卡死 turn.
    if (deps.confirmController.hasPending()) {
      deps.confirmController.dismiss();
    }
    if (deps.state.turnInFlight && !deps.signalCoordinator.getSignal().aborted) {
      deps.signalCoordinator.abortIfActive();
    }
    deps.state.pendingExit = true;
    if (deps.state.turnInFlight) {
      if (deps.state.exitTimer) clearTimeout(deps.state.exitTimer);
      deps.state.exitTimer = setTimeout(() => {
        // 30s 兜底: turn 卡死时强制 finish, stderr warning 走 i18n (Q1=A).
        // 注: t() 是位置参数, 模板用 {0}, 不是 {ms}.
        if (deps.state.exiting) return;
        deps.err.write(`${deps.t('cli.repl_force_exit_timeout', 30000)}\n`);
        void deps.finish(0);
      }, 30_000);
      // unref: 不让 timer 阻止进程退出 (finish 自己会调 process.exit / resolve).
      deps.state.exitTimer.unref?.();
    } else {
      // turn 没在跑, 直接 finish (Q3=b 的 else 分支).
      void deps.finish(0);
    }
  };
}
