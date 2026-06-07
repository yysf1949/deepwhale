/**
 * REPL SIGINT + turn AbortController coordinator — Sprint 1c-revive-3-D-29.1.1 (2026-06-07).
 *
 * 历史:
 *   D-19 (2026-06-05): SIGINT handler + turnAbortController 写在 repl.ts L342-363 闭包内,
 *     rl.on('line') chat turn 入口 new 一个新 controller (L510), close handler 调
 *     controller.abort() (L583-585), finish() 调 process.off (L305). 拍板: AbortController
 *     单次 abort 语义 — 上一个 turn 被 abort 后, 必须 new 新 controller 才能再 abort.
 *   D-19.5 (2026-06-05): 修 P2.5 — finish() 入口先 process.off, 防止嵌入式 / 多次启动
 *     REPL 累积 listener. 顺序红线: off 必须在 rl.close() 之前, 否则 close 派发 'close'
 *     期间 Ctrl+C 还能触达 onSigint 闭包.
 *   D-19.6 (2026-06-05): close handler 改成 dismiss + abort + pendingExit + exitTimer
 *     状态机根治, 不用 try/catch absorb race.
 *   D-29.1.1 (2026-06-07): 抽到独立文件, 跟 repl-confirm.ts 工厂形态对齐.
 *
 * 拍板 (D-29.1.1):
 *   - 工厂函数: createSignalCoordinator(opts) → ReplSignalCoordinator.
 *   - 闭包形态: 内部 let controller 持有当前 turnAbortController, getSignal() / refresh()
 *     / abortIfActive() 三方法对外暴露, caller 不用直接看 controller 变量.
 *   - SIGINT 行为 1:1 等价 — 先 dismiss in-flight confirm (D-19 P2-dismiss 顺序), 再
 *     abort 当前 turnAbortController. 进程不退出, 跟 D-19 拍板一致.
 *   - dispose() 幂等 — 多次调安全 (disposed 闭包 boolean 守卫), 防止 finish() 重入.
 *   - process 来源: opts.process 注入 (单测 mock), 默认 node:process. 跟 D-19 红线
 *     "测 SIGINT 走 abort 直接调, 不挂真 process" 一致 — 单测不需 mock process.
 *   - dispose 顺序红线: process.off 必须在 rl.close() 之前 (D-19.5 拍板) — coordinator
 *     内部按这个顺序处理, caller 只需在 finish() 入口调 dispose().
 *
 * 拍板 (D-29.1.1 §out of scope):
 *   - 不接 exitTimer 兜底 timer (那是 D-19.6 P1 close 路径的, 跟 pendingExit state
 *     machine 绑定, 留给 D-29.1.3 turn-guard 抽).
 *   - 不接 pendingExit / lineQueue (那是 6afccc8 6 红线段的职责, 留给 D-29.1.3).
 *   - 不抽 rl.on('close') 路径里的 dismiss + abort (L580-585) — close handler
 *     跟 lineQueue / exitTimer 强耦合, 整体抽风险大于收益, 留给 D-29.1.3+.
 */

import type { ReplConfirmController } from './repl-confirm.js';

export interface ReplSignalCoordinatorOptions {
  /**
   * REPL 的 confirm controller (D-19 P2-dismiss 顺序的源).
   * SIGINT 触发时先 confirmController.dismiss() (落 user_denied 审计),
   * 再 abort turnAbortController.
   */
  confirmController: ReplConfirmController;
  /**
   * 注入 process (单测 mock 用). 默认 node:process.
   * D-19 红线: 测 SIGINT 行为走 abort() 直接调, 不挂真 process.
   */
  process?: NodeJS.Process;
}

export interface ReplSignalCoordinator {
  /** 当前 in-flight turn 的 AbortSignal. 派给 runAgentTurn / runOneTurn. */
  getSignal: () => AbortSignal;
  /**
   * 续命 controller — turn 入口 new 一个新 controller, 旧的被 SIGINT abort 后
   * 第二次 abort 无效, 必须 refresh. D-19 拍板: onSigint 闭包持有的是 coordinator
   * 内部 let 变量, refresh 后下次 SIGINT 自动 abort 新的, 不需要重建 handler.
   * 红线: 不要 add 多份 SIGINT listener 重复触发.
   */
  refresh: () => void;
  /**
   * 主动 abort (close 路径 / pendingExit 兜底). 幂等 — 已 abort 的 controller 不再
   * 派发 abort 事件. D-19.6 拍板: close handler 走 dismiss + abort + pendingExit
   * 状态机, abort 顺序在 dismiss 之后.
   */
  abortIfActive: () => void;
  /**
   * finish() 入口调 — process.off('SIGINT', onSigint) + 清 disposed 守卫.
   * 顺序红线 (D-19.5): dispose() 必须在 caller 的 rl.close() 之前, 否则 close
   * 派发 'close' 期间 Ctrl+C 还能触达 onSigint 闭包.
   * 幂等: 多次调安全.
   */
  dispose: () => void;
}

export function createSignalCoordinator(
  opts: ReplSignalCoordinatorOptions,
): ReplSignalCoordinator {
  const proc = opts.process ?? process;
  let controller = new AbortController();
  let disposed = false;

  // 拍板 (D-19 P2-dismiss): SIGINT 先 dismiss in-flight confirm 落 user_denied 审计,
  // 再 abort turnAbortController. 顺序: dismiss 先于 abort — confirm resolve 后
  // runToolLoop 才检查 signal, 调换会丢 audit 路径. 进程不退出, 用户可继续.
  const onSigint = (): void => {
    if (opts.confirmController.hasPending()) {
      opts.confirmController.dismiss();
    }
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  proc.on('SIGINT', onSigint);

  return {
    getSignal: (): AbortSignal => controller.signal,

    refresh: (): void => {
      if (disposed) return;
      controller = new AbortController();
    },

    abortIfActive: (): void => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },

    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      // 红线 (D-19.5): off 必须在 caller 的 rl.close() 之前. Coordinator 在
      // dispose() 同步内 off, caller 调用顺序 = dispose() → rl.close() → ...
      proc.off('SIGINT', onSigint);
    },
  };
}
