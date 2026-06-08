/**
 * REPL line handler — Sprint 1c-revive-3-D-29.3.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1a: rl.on('line') 简单 handle 6 段 (confirm / slash guard / exit /
 *   chat turn / finally drain). Sprint 1c-revive-3-D-19.5 (2026-06-05): 加 P1 turn
 *   guard + lineQueue 排队. Sprint 1c-revive-3-D-19.6.1 (2026-06-05): 加 slash
 *   builtin guard 跟 D-19.6 abort-aware. Sprint 1c-revive-3-D-29.1.3 (2026-06-07):
 *   slash builtin 派发抽到 dispatchSlashBuiltin.
 *
 * 拍板 (D-29.3.2):
 *   - 文件: `repl-line-handler.ts` (kebab-case).
 *   - 公共: createLineHandler 工厂返 `(rawLine: string) => Promise<void>`, rl.on('line')
 *     直接挂. 6 段行为 1:1 保 (confirm 串行 / slash guard / exit fast-path / slash
 *     派发 / turn guard 入队 / chat turn + finally drain).
 *   - state 共享: ReplState (5 字段, finish + line + close 共用). 行为 1:1 保 D-19.5 /
 *     D-19.6 / 6afccc8 / D-19.6.1 4 段红线 — state 读写顺序跟原闭包变量一致.
 *   - 红线 (D-19.6.1 P2.1): catch 分支 signal.aborted 优先 — 走 runAgentTurn 内部,
 *     不在本 handler.
 *   - 红线 (no-unsafe-finally): finally 块 if/else if/else 链, 无 return.
 *   - module-private (不 re-export).
 *
 * 拍板 (D-29.3.2 §out of scope):
 *   - 不抽 close handler / bootstrap — 留给 D-29.3.3/4.
 *   - 不动 startRepl 顶层 — 留给 D-29.4+.
 *   - 不写新测试 (D-19 拍板: 测 SIGINT 走 abort 直接调).
 */

import { t as T, type SessionWriter } from '@deepwhale/core';
import type { ChatMessage, LLMClient } from '@deepwhale/llm';
import type { AgentCompactionConfig } from '../agent/index.js';
import type { ToolPolicy } from '../policy/types.js';
import type { SandboxRunner } from '../sandbox/types.js';
import type { UsageEmaState } from './repl-session.js';
import type { ReplConfirmController } from './repl-confirm.js';
import type { ReplSignalCoordinator } from './repl-signal-coordinator.js';
import type { ReplState } from './repl-state.js';
import type { VerifyCheck } from '../verify/index.js';
import type { runOneTurn } from '../repl.js';
import type { runAgentTurn } from './repl-agent-turn.js';
import type { dispatchSlashBuiltin, SlashContext } from './repl-command-router.js';
import {
  deepwhaleRoot,
  MemoryStore,
  SkillStore,
  CronStore,
  SessionIndex,
} from '../util/index.js';

export interface ReplLineDeps {
  state: ReplState;
  finish: (code: number) => Promise<void>;
  signalCoordinator: ReplSignalCoordinator;
  confirmController: ReplConfirmController;
  tryCreateClient: () => { client: LLMClient | null; error: Error | null };
  clientFromOptions: LLMClient | undefined;
  runAgentTurnFn: typeof runAgentTurn;
  runOneTurnFn: typeof runOneTurn;
  dispatchSlashBuiltinFn: typeof dispatchSlashBuiltin;
  out: NodeJS.WritableStream;
  err: NodeJS.WritableStream;
  writer: SessionWriter | null;
  workingMessages: ChatMessage[];
  emaState: UsageEmaState;
  compactionConfig: AgentCompactionConfig | null;
  sandboxRunner: SandboxRunner | undefined;
  policyYes: boolean;
  replPolicy: ToolPolicy;
  enableToolLoop: boolean;
  verifyChecks: VerifyCheck[] | undefined;
  t: typeof T;
  prompt: () => void;
  // rl 用于 setImmediate re-emit (lineQueue drain). 抽后保留 rl 引用.
  rl: { emit: (event: 'line', data: string) => boolean };
}

export function createLineHandler(deps: ReplLineDeps): (rawLine: string) => Promise<void> {
  return async (rawLine: string): Promise<void> => {
    const line = rawLine.trim();

    // 拍板 (D-19 + D-19.5): 主 rl 是 stdin 唯一消费者, 确认期间 line 喂 confirm resolver.
    // D-19.5 P2-dismiss 修: confirm 期间 /exit 先 dismiss confirm 再 pendingExit, finally 兜底.
    if (deps.confirmController.hasPending()) {
      if (line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit') {
        deps.confirmController.dismiss();
        deps.state.pendingExit = true;
        return;
      }
      const consumed = deps.confirmController.offerLine(line);
      if (consumed) {
        // confirm resolver 已 settle, 等待 promise 走完; 调 prompt() 让用户看见下一轮.
        // 注意: confirmController 内部在 offerLine 同步 settle, 但 await 仍在 tool-loop 端.
        // 拍板 (D-19): 不在这里 await confirm 本身, 避免阻塞 rl 内部 line queue.
        return;
      }
    }

    // 拍板 (D-19.6.1 + 6afccc8): slash builtin guard. turnInFlight 时除 /exit /quit
    // 之外的 slash builtin (/verify /help /unknown) 走 deny, 不入 lineQueue.
    // lineQueue 只排 chat line (D-19.5 红线), defer 会让 finally drain 还要判
    // builtin vs chat. 位置: confirm 守卫后, 内建 dispatcher 前.
    if (
      deps.state.turnInFlight &&
      line.startsWith('/') &&
      line !== '/exit' &&
      line !== '/quit'
    ) {
      deps.out.write(`${deps.t('cli.turn_in_flight_deny')}\n\n`);
      deps.prompt();
      return;
    }

    // 内建命令 — 全部 fast-path, 不走 turnInFlight (内建不等 chat turn)
    if (line === '') {
      deps.prompt();
      return;
    }
    if (line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit') {
      // 拍板 (D-19.5): turn 不在跑直接 finish; 在跑标 pendingExit, finally 兜底.
      if (deps.state.turnInFlight) {
        deps.state.pendingExit = true;
        return;
      }
      await deps.finish(0);
      return;
    }
    // === Sprint 1c-revive-3-D-29.1.3 (2026-06-07): slash builtin 派发抽到 dispatchSlashBuiltin ===
    // 拍板 (D-29.1.3): router 派发顺序保 1:1 (跟原 L434-481): /help → /verify → /unknown slash.
    // 5 红线 0 改: turnInFlight guard (D-19.6.1 + 6afccc8) 仍在本函数 L409-418,
    //              /verify try/finally (1ceef94) 走 router 内部 try/catch 等价.
    //              confirm 期间 /exit dismiss (D-19.5 P2-dismiss) 仍在本函数 L370-373.
    //              /exit fast-path (D-19.5 P1) 走 L412 exclude, 不入 router.
    const slashCtx: SlashContext = {
      out: deps.out,
      err: deps.err,
      writer: deps.writer,
      verifyChecks: deps.verifyChecks,
      prompt: deps.prompt,
      // D-30.1α.3: /new 触发, 清 workingMessages (router 不直接持 state).
      onNewSession: () => {
        deps.workingMessages.length = 0;
      },
      // D-30.1δ.11-δ.14: 4 store 注入 (Memory / Skills / Cron / Sessions).
      // 拍板: store 实例化在 line handler 创建 (跟 deepwhaleRoot 路径 1:1),
      // loadSession / enterPlanMode 留 D-30.2 (TUI Plan mode + session reload).
      getMemory: async () => new MemoryStore(deepwhaleRoot()).readMemory(),
      appendMemory: async (text) => {
        await new MemoryStore(deepwhaleRoot()).appendMemory(text)
      },
      listSkills: async () => new SkillStore(deepwhaleRoot()).list(),
      listCron: async () => new CronStore(deepwhaleRoot()).list(),
      listSessions: async () => {
        const all = await new SessionIndex(deepwhaleRoot()).list()
        return all.sort((a, b) => b.createdAt - a.createdAt)
      },
    };
    if (line === '/verify') {
      deps.state.turnInFlight = true;
      try {
        await deps.dispatchSlashBuiltinFn(line, {
          ...slashCtx,
          prompt: () => undefined,
        });
      } finally {
        deps.state.turnInFlight = false;
        if (deps.state.pendingExit) {
          deps.state.pendingExit = false;
          void deps.finish(0);
        } else if (deps.state.lineQueue.length > 0 && !deps.state.exiting) {
          const next = deps.state.lineQueue.shift()!;
          setImmediate(() => deps.rl.emit('line', next));
        } else {
          deps.prompt();
        }
      }
      return;
    }
    if ((await deps.dispatchSlashBuiltinFn(line, slashCtx)).handled) return;

    // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P1 turn guard — 排队 turnInFlight 期间 line ===
    // 拍板 (D-19.5, user review 2026-06-05 P1): 旧逻辑紧跟 chat turn 的下一行 (紧贴
    // y\n 或 turn 还没跑完时 stdin 排队的行) 立刻进 chat 分支, 用旧 workingMessages
    // 并发跑第二轮, /exit 提前 close writer. 修法: 派发前检查 turnInFlight, true
    // → 入队不入 chat. finally 块跑完 turn, 检查 pendingExit (走 finish) → 否则
    // drain lineQueue 下一条 (setImmediate 避免爆栈). 红线: pendingExit 优先级高于
    // drain, 因为 /exit 应该是"不处理后续, 立刻走"语义, 不应该 drain 排队行.
    if (deps.state.turnInFlight) {
      deps.state.lineQueue.push(line);
      return;
    }
    deps.state.turnInFlight = true;

    // chat — client lazy 化 (D-11-4), refresh AbortController 走 signalCoordinator (D-29.1.1).
    // 红线: 不要 add 多份 SIGINT listener (coordinator 内部 process.on 一次).
    deps.signalCoordinator.refresh();
    const c = deps.clientFromOptions
      ? { client: deps.clientFromOptions, error: null }
      : deps.tryCreateClient();
    if (c.client === null) {
      deps.err.write(`${deps.t('error.api_key_missing')}\n\n`);
      deps.state.turnInFlight = false;
      deps.prompt();
      return;
    }
    const liveClient = c.client;
    try {
      if (deps.enableToolLoop) {
        await deps.runAgentTurnFn(
          liveClient,
          line,
          deps.workingMessages,
          deps.writer,
          deps.out,
          deps.err,
          deps.signalCoordinator.getSignal(),
          deps.compactionConfig,
          deps.sandboxRunner,
          deps.policyYes,
          deps.replPolicy, // D-15: 注入 y/N confirm; 默认 staticToolPolicy 向后兼容
          deps.emaState, // D-21.1: EMA 平滑闭包 state 透传
        );
      } else {
        const turn = await deps.runOneTurnFn(liveClient, line, [], {
          signal: deps.signalCoordinator.getSignal(),
        });
        if (turn.kind === 'error') {
          deps.err.write(`${turn.error}\n\n`);
        } else if (turn.kind === 'chat') {
          deps.out.write(`${turn.assistant}\n\n`);
        }
      }
    } finally {
      // 拍板 (D-19.5): pendingExit 优先 (走 finish, 丢弃排队) → drain 下一条
      // (setImmediate 防同步递归爆栈) → prompt 继续. finally 不能 return
      // (no-unsafe-finally), 用 if/else if/else 链.
      deps.state.turnInFlight = false;
      if (deps.state.pendingExit) {
        deps.state.pendingExit = false;
        void deps.finish(0);
      } else if (deps.state.lineQueue.length > 0 && !deps.state.exiting) {
        const next = deps.state.lineQueue.shift()!;
        setImmediate(() => deps.rl.emit('line', next));
      } else {
        deps.prompt();
      }
    }
  };
}
