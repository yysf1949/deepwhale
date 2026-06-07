/**
 * REPL finish / shutdown handler — Sprint 1c-revive-3-D-29.3.1 (2026-06-07).
 *
 * 历史:
 *   Sprint 1c-revive-3-D-19.5 (2026-06-05): finish() 抽 5 红线之一 — SIGINT
 *   listener 清理. 拍板 (D-19.5, user review 2026-06-05 P2): repl.ts:307 每次
 *   startRepl() 挂全局 process.on('SIGINT'), finish() 没 process.off, 嵌入式/测试
 *   多次启动 REPL → 累积 listener. 后 Ctrl+C 触发已退出 REPL 的闭包. 修法:
 *   finish() 入口先 .off 一次. 顺序: .off 必须在 rl.close() 之前, 否则 close 派发
 *   'close' event 期间 Ctrl+C 还能触达 onSigint 闭包.
 *   Sprint 1c-revive-3-D-19.6 (2026-06-05): 清 exitTimer 防止 P1 兜底 timer 泄漏.
 *   Sprint 1c-revive-3-D-29.1.1 (2026-06-07): SIGINT 清理走 coordinator
 *   dispose() 内部, repl.ts 通过 .dispose() 接口调, 行为 1:1.
 *
 * 拍板 (D-29.3.1):
 *   - 文件: `repl-finish.ts` (kebab-case, 跟 `repl-confirm.ts` /
 *     `repl-signal-coordinator.ts` / `repl-session.ts` 同形态).
 *   - 公共 API 0 改: startRepl 内部闭包 `finish` 走 `createFinish({...})` 工厂返回.
 *     行为 1:1 保 dispose 顺序 (dispose → close writer → close rl → out → resolve).
 *   - 行为 1:1: 函数体逐字迁移, exiting 守卫幂等 / exitTimer 清理 /
 *     signalCoordinator.dispose() / rl.close() / writer.close() (best-effort) /
 *     out.write(goodbye) / resolve(code) 1:1.
 *   - 红线 (D-19.5 P2-SIGINT): dispose 必须在 rl.close() 之前 — coordinator 内部
 *     按此顺序处理, 工厂调用方不感知.
 *   - module-private (不 re-export): 跟 repl-confirm 同, 内部用.
 *
 * 拍板 (D-29.3.1 §out of scope):
 *   - 不抽 close handler / line handler / bootstrap — 留给 D-29.3.2/3/4.
 *   - 不动 ReplState 接口 (mutating exiting + exitTimer 字段) — finish 是写者,
 *     close handler 是读者, 共享同一 state 引用, 行为保 6afccc8 / D-19.6 1:1.
 */

import type { t as T } from '@deepwhale/core';
import type { Interface as RLInterface } from 'node:readline';
import type { SessionWriter } from '@deepwhale/core';
import type { ReplSignalCoordinator } from './repl-signal-coordinator.js';

/**
 * Finish 写者 state — finish 是唯一写者 (exiting / exitTimer), close handler 是
 * 唯一读者 (exiting 守卫幂等 / exitTimer 30s 兜底). 跟 line handler 的
 * ReplLineState (turnInFlight / pendingExit / lineQueue) 共享**同一** state 引用.
 */
export interface ReplFinishState {
  exiting: boolean;
  exitTimer: NodeJS.Timeout | null;
}

export interface ReplFinishDeps {
  state: ReplFinishState;
  signalCoordinator: ReplSignalCoordinator;
  rl: RLInterface;
  writer: SessionWriter | null;
  out: NodeJS.WritableStream;
  t: typeof T;
  resolve: (code: number) => void;
}

/**
 * 工厂返 finish 闭包. 闭包持有 deps 引用, 跨 finish() 多次调用共享 state.
 * 红线: dispose 顺序 (signalCoordinator.dispose → rl.close → writer.close →
 * out.write → resolve) 1:1 保, 不允许调换.
 */
export function createFinish(deps: ReplFinishDeps): (code: number) => Promise<void> {
  return async (code: number): Promise<void> => {
    if (deps.state.exiting) return;
    deps.state.exiting = true;
    if (deps.state.exitTimer) {
      clearTimeout(deps.state.exitTimer);
      deps.state.exitTimer = null;
    }
    // === Sprint 1c-revive-3-D-29.1.1 (2026-06-07): SIGINT 清理走 coordinator dispose() ===
    // 红线 (D-19.5): off 必须在 rl.close() 之前, 否则 close 派发 'close' event 期间
    // Ctrl+C 还能触达 onSigint 闭包. coordinator.dispose() 内部按此顺序处理, 幂等.
    deps.signalCoordinator.dispose();
    deps.rl.close();
    if (deps.writer) {
      try {
        await deps.writer.close();
      } catch {
        /* 关闭失败 best-effort,REPL 退出码仍按 caller 决定 */
      }
    }
    deps.out.write(`${deps.t('cli.goodbye')}\n`);
    deps.resolve(code);
  };
}
