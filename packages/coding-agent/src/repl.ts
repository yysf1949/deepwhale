/**
 * deepwhale REPL — Sprint 1a 接入 tool loop + session
 *
 * Sprint 0.3 范围：单轮 chat + 内建命令。
 * Sprint 1a 扩展：
 *   - 接 Session JSONL：启动时 load(可选路径)，退出时 close(flush)
 *   - 接 runToolLoop：每轮 user → tool loop → 持久化 steps
 *   - 流式：onChunk 实时打印 final.content（assistant 增量）
 *   - 命令：保留 /help / /exit / exit / quit
 *
 * Sprint 1a 简化：
 *   - 不做 plan mode、recovery、自动压缩
 *   - 不做 multi-session 切换
 *   - 错误用 i18n + 不污染 messages
 *
 * 文件职责 (D-29.x 拆分后):
 *   - runOneTurn: 单轮 chat 工具函数 (不持久化, 无 tool loop)
 *   - startRepl: REPL 主循环 + 5 红线 (signal-coord / turnInFlight / slash guard / finally drain)
 *   - 子模块 (./repl/*.ts):
 *     - repl-confirm.ts           y/N confirm 工厂 (D-15)
 *     - repl-signal-coordinator.ts  SIGINT + turn AbortController (D-29.1.1)
 *     - repl-session.ts           usage status + EMA state (D-29.1.2)
 *     - repl-command-router.ts    slash builtin 派发 (D-29.1.3)
 *     - repl-agent-turn.ts        runAgentTurn 主体 (D-29.2)
 *     - repl-format-error.ts      LLM 错误 → i18n (D-29.2)
 *     - repl-compaction-summary.ts  compaction summary 工厂 (D-29.2)
 *     - repl-step-summary.ts      tool step 摘要 (D-29.2)
 */

import { createInterface, type Interface as RLInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { t } from '@deepwhale/core';
import { ChatMessage, type LLMClient } from '@deepwhale/llm';
import { loadSession, type AgentCompactionConfig } from './agent/index.js';
import { createDefaultClient, type Provider } from './llm-factory.js';
import { resolveSandboxRunnerFromEnv } from './sandbox/env-gate.js';
import { staticToolPolicy } from './policy/static-rules.js';
import { createReplConfirm } from './repl/repl-confirm.js'; // D-15: REPL y/N confirm 工厂
export { createReplConfirm } from './repl/repl-confirm.js'; // Sprint 1c-revive-2-D-24.2: re-export for tui-ink
import { createSignalCoordinator } from './repl/repl-signal-coordinator.js'; // D-29.1.1: SIGINT + turn AbortController 抽
import { formatUsageStatus, appendUsageStatus, type UsageEmaState } from './repl/repl-session.js'; // D-29.1.2: EMA state + usage status 抽
export { formatUsageStatus, appendUsageStatus, type UsageEmaState } from './repl/repl-session.js'; // D-29.1.2: re-export 保公共 API 1:1
import { dispatchSlashBuiltin, type SlashContext } from './repl/repl-command-router.js'; // D-29.1.3: slash builtin 派发抽 (1ceef94 + D-19.6.1 guard)
import { runAgentTurn } from './repl/repl-agent-turn.js'; // D-29.2: agent turn 主体抽 (persist user + runToolLoop + catch 4-branch + 持久化)
export { runAgentTurn } from './repl/repl-agent-turn.js'; // D-29.2: re-export 保 test/modes-followup.test.ts:18 import path
import { formatError } from './repl/repl-format-error.js'; // D-29.2: LLM 错误 → i18n 文案映射 (runOneTurn + runAgentTurn 复用)
import { createFinish, type ReplFinishDeps } from './repl/repl-finish.js'; // D-29.3.1: finish 抽工厂, 共享 exiting/exitTimer state (close handler + line handler + prompt 共读)
import { createLineHandler } from './repl/repl-line-handler.js'; // D-29.3.2: 抽 line handler 工厂 (D-19.5 P1 + 6afccc8 + D-19.6.1 + 1ceef94 + no-unsafe-finally 5 红线 1:1 保)
import { createCloseHandler } from './repl/repl-close-handler.js'; // D-29.3.3: 抽 close handler 工厂 (D-19.5 P2-dismiss + D-19.6 P1 30s 兜底 1:1 保)
import { createReplBootstrap } from './repl/repl-bootstrap.js'; // D-29.3.4: 抽 preamble (lazy client + sandbox + confirm + greeting + session + compaction + rl setup) 工厂
import type { ReplState } from './repl/repl-state.js'; // D-29.3.2: 5 字段 mutable state (finish + line + close + prompt 共享)
import type { ToolPolicy } from './policy/types.js';

const VERSION = '0.1.0';

export interface ReplOptions {
  /** 注入 LLM 客户端（默认 createDefaultClient env 推断, Sprint 1b.5 Step 2 C3 拍板）。单测用。 */
  client?: LLMClient;
  /**
   * Sprint 1c-revive-3-D-13 (2026-06-05): --yes 标志.
   * yes=true bypass require_confirmation (write_file / edit_file / 危险 bash),
   * 不 bypass deny. 拍板: REPL = 交互模式 (isInteractive=true), policy=staticToolPolicy.
   */
  yes?: boolean;
  /**
   * Sprint 1b.5 Step 2 (2.5 拍板, C3 拍板 2026-06-03): 显式 provider. 跟 env 推断冲突时优先.
   * 跟 options.client 互斥 — 传 client 时 provider 忽略 (单测路径).
   */
  provider?: Provider;
  /** Sprint 1b.5 Step 2: 显式 model. 不传则用 provider 默认 (deepseek → deepseek-v4-flash, anthropic → claude-sonnet-4-5). */
  model?: string;
  /** 注入输入流（默认 stdin）。单测用。 */
  input?: NodeJS.ReadableStream;
  /** 注入输出流（默认 stdout）。单测用。 */
  output?: NodeJS.WritableStream;
  /** 注入错误流（默认 stderr）。单测用。 */
  errorOutput?: NodeJS.WritableStream;
  /** 注入退出函数（默认 process.exit）。单测用。 */
  exit?: (code?: number) => never;
  /**
   * Session JSONL 路径。提供则启动时 load + 退出时 append + close。
   * 不提供则不持久化（Sprint 0.3 行为）。
   */
  sessionPath?: string;
  /** 是否启用 tool loop（默认 true）。false = 退化为 Sprint 0.3 单轮 chat。 */
  enableToolLoop?: boolean;
  /**
   * Session compaction 集成 (Sprint 1c-revive-2-D-6, review P1 修复 2026-06-04).
   *
   * 传 = 走 runToolLoopWithCompaction, turn 入口测 token 触发则 compact + 写
   * 'compaction' event 到 SessionWriter. 不传 = 走裸 runToolLoop (向后兼容,
   * 现有 baseline 244 测试不变).
   *
   * 拍板: 提供 AgentCompactionConfig 即可, CompactionState 内部持有 (startRepl
   * 闭包). writer 字段 REPL 自动注入 (跟 startRepl 内部 sessionPath writer
   * 同 instance, 让 compaction 事件写到同一 JSONL).
   *
   * 拍板 contextWindow=0 = 关闭 (跟 core compact() 行为契约一致). 默认
   * (不传此参数) = 不接 compaction.
   */
  compactionConfig?: Omit<AgentCompactionConfig, 'writer' | 'state'> | null;
  /**
   * Sprint 1c-revive-2-D-11-4 (2026-06-04): verify 自定义 check.
   * 不传 = 走 runVerify() 默认 4 步 (corepack pnpm build/lint/typecheck/test).
   * 单测用: 传 4 个简单 pass check, 避免 30-60s 真跑 build.
   */
  verifyChecks?: import('./verify/index.js').VerifyCheck[];
}

/**
 * 单轮 chat 工具函数：把 user 输入 → LLM chat → 输出 assistant 文本。
 * 不修改 messages；不调工具；不持久化。
 *
 * Sprint 1a 保留作为低层 API。Sprint 1a 之后 REPL 入口推荐用 startRepl +
 * enableToolLoop=true 走完整 agent loop。
 */
export async function runOneTurn(
  client: LLMClient,
  line: string,
  messages: ChatMessage[],
  options: { signal?: AbortSignal } = {},
): Promise<
  { kind: 'chat'; assistant: string } | { kind: 'error'; error: string } | { kind: 'empty' }
> {
  const trimmed = line.trim();
  if (trimmed === '') return { kind: 'empty' };
  const userMessage: ChatMessage = { role: 'user', content: trimmed };
  const allMessages = [...messages, userMessage];
  try {
    const result = await client.chat(
      allMessages,
      options.signal !== undefined ? { signal: options.signal } : {},
    );
    return { kind: 'chat', assistant: result.content };
  } catch (e) {
    return { kind: 'error', error: formatError(e) };
  }
}

/**
 * 启动 REPL。返回 Promise，resolve 时为退出码。
 */
export async function startRepl(options: ReplOptions = {}): Promise<number> {
  const out = options.output ?? stdout;
  const err = options.errorOutput ?? stderr;
  // === Sprint 1c-revive-3-D-29.3.4 (2026-06-07): 抽 preamble → createReplBootstrap ===
  // 拍板: 5 段 (lazy client / sandbox / policy / confirm / greeting / session / compaction /
  // rl setup) 1 工厂返 ReplBootstrapResult, startRepl 主体收 boot = await createReplBootstrap(...)
  // 抽后行为 1:1 保. D-11-4 (lazy client) / D-6 (compaction) / D-12 (sandbox) / D-13
  // (--yes) / D-19 (confirm) / D-21.1 (EMA) 6 红线 1:1 抽到 bootstrap 内部, 0 业务改.
  const boot = await createReplBootstrap({
    options,
    out,
    err,
    version: VERSION,
    t,
  });

  return new Promise<number>((resolve) => {
    // === Sprint 1c-revive-3-D-29.3.1 (2026-06-07): 抽 finish 工厂 + state 共享 ===
    // 红线 (D-19.5 P2-SIGINT + D-19.6 P1): exiting / exitTimer 是 finish 写者,
    // close handler 读者 (exiting 守卫幂等, exitTimer 30s 兜底). 抽到 ReplFinishState
    // 共享引用 — finish 通过 createFinish({state, ...}) 写, close handler 通过
    // state.exiting / state.exitTimer 读 (D-29.3.3 抽 close handler 时也用同一 state).
    // prompt 跟 finally 块 (D-29.3.2 抽 line handler 时) 也用 state.exiting 守卫幂等.
    // 红线: dispose 顺序 (signalCoordinator.dispose → rl.close → writer.close →
    // out.write → resolve) 1:1 保, 工厂内部按此顺序处理, 调用方不感知.
    const state: ReplState = { exiting: false, exitTimer: null, turnInFlight: false, pendingExit: false, lineQueue: [] };

    // === Sprint 1c-revive-3-D-29.1.1 (2026-06-07): SIGINT + turn AbortController 抽 ===
    // 拍板 (D-29.1.1): signal-coordinator 持有 turnAbortController 闭包 + SIGINT listener
    // 生命周期, repl.ts 通过 getSignal() / refresh() / abortIfActive() / dispose() 4 方法
    // 跟它交互. 行为 1:1 等价 D-19 P1/P2 拍板: dismiss in-flight confirm 先 (落 user_denied
    // 审计), 再 abort turn; 进程不退出, 用户可继续. dispose() 幂等, finish() 入口调
    // (D-19.5 顺序红线: off 必须在 rl.close() 之前, coordinator 内部按此顺序处理).
    // === Sprint 1c-revive-3-D-29.3.1 (2026-06-07): signalCoordinator 创建挪到 finish 之前 ===
    // 拍板: createFinish 需要 signalCoordinator (D-19.5 P2-SIGINT dispose 顺序), 必须
    // 在 createFinish({...}) 之前建. 原 D-29.1.1 时建在 finish 之后, 0 顺序问题;
    // D-29.3.1 抽 finish 后, 顺序显式化. 行为 1:1 保, 0 业务改.
    const signalCoordinator = createSignalCoordinator({
      confirmController: boot.confirmController,
    });

    // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P2-SIGINT 修法 — finish 移除全局 listener ===
    // 拍板 (D-19.5, user review 2026-06-05 P2): repl.ts:307 每次 startRepl() 挂全局
    // process.on('SIGINT'), finish() 没 process.off, 嵌入式/测试多次启动 REPL → 累积
    // listener. 后 Ctrl+C 触发已退出 REPL 的闭包. 修法: finish() 入口先 .off 一次.
    // 顺序: .off 必须在 rl.close() 之前, 否则 close 派发 'close' event 期间 Ctrl+C 还能
    // 触达 onSigint 闭包. 红线: 跟 D-19 P2-Ctrl+C 拍板不冲突 — finish 才清理, SIGINT
    // 触发的 dismiss + abort 仍由 onSigint 兜底 (D-19 行为不变).
    // === Sprint 1c-revive-3-D-29.3.1 (2026-06-07): finish() 抽到 createFinish 工厂 ===
    // 行为 1:1 保 (exiting 守卫 / exitTimer 清理 / dispose / close / writer.close / out / resolve).
    const finish = createFinish({
      state,
      signalCoordinator,
      rl: boot.rl,
      writer: boot.writer,
      out,
      t,
      resolve,
    });

    // === Sprint 1c-revive-3-D-29.3.2 (2026-06-07): 抽 line handler 工厂 ===
    // 拍板: turnInFlight / pendingExit / lineQueue 走 state (ReplState 5 字段共享).
    // state 已在 L287 创, 0 重复 let 声明. 5 红线 1:1 保 (D-19.5 / D-19.6.1 / 6afccc8
    // / 1ceef94 / no-unsafe-finally). 行为 1:1 保 628 既有测试, 0 业务改.
    // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P1 turn guard + 排队 + SIGINT/dismiss 链路 ===
    // 拍板 (D-19.5, user review 2026-06-05 P1): 旧 line handler 在 confirm settle 之后, 紧
    // 跟的下一行 (e.g. /exit\n) 立刻 leak 到 main chat/builtin 分支, /exit 提前 close
    // writer, 第二轮 chat 用旧 workingMessages 并发跑. 修法: turnInFlight 闭包标志 +
    // lineQueue 排队, 关键时序:
    //   - 派发前检查 turnInFlight, true → 入队不入 chat
    //   - turn 跑完在 finally 块: 检查 pendingExit (走 finish) → 否则 drain 下一条
    //   - /exit fast-path: turn 在跑时只标 pendingExit, finally 兜底; turn 不在跑时直接
    //     finish (exiting 守卫幂等)
    //   - confirm 期间: 旧 D-19 offerLine 派发仍走, 但 line 不能 leak 到 chat 分支
    //   - drain 用 setImmediate 避免同步递归爆栈 (P-verify-4 实测, 同步 emit 在大量排队
    //     时撞 V8 10000 帧限制)
    // (D-29.3.2): turnInFlight / pendingExit / lineQueue 状态字段迁到 ReplState,
    // let 声明删除.

    // === Sprint 1c-revive-3-D-29.3.3 (2026-06-07): 抽 close handler 工厂调用 ===
    // 红线 (D-19.5 P2-dismiss + D-19.6 P1) 1:1 保: dismiss 先于 abort (audit 顺序),
    // pendingExit 让 finally 兜底 finish, exitTimer 30s 兜底卡死 turn.
    const closeHandler = createCloseHandler({
      state,
      signalCoordinator,
      confirmController: boot.confirmController,
      finish,
      err,
      t,
    });
    boot.rl.on('close', closeHandler);

    const prompt = (): void => {
      if (state.exiting) return;
      out.write(t('cli.prompt'));
    };

    // === Sprint 1c-revive-3-D-29.3.2 (2026-06-07): 抽 line handler 工厂调用 ===
    // 5 红线 1:1 保: turnInFlight guard (D-19.6.1 + 6afccc8) / /verify (1ceef94) /
    // pendingExit 兜底 / setImmediate drain / no-unsafe-finally 都在 createLineHandler
    // 内部 1:1 实现. 行为 1:1 保 628 既有测试. 位置: prompt() 后 (lineHandler deps
    // 收 prompt 闭包), rl.on('line') 挂在 close handler 之后.
    const lineHandler = createLineHandler({
      state,
      finish,
      signalCoordinator,
      confirmController: boot.confirmController,
      tryCreateClient: boot.tryCreateClient,
      clientFromOptions: boot.clientFromOptions,
      runAgentTurnFn: runAgentTurn,
      runOneTurnFn: runOneTurn,
      dispatchSlashBuiltinFn: dispatchSlashBuiltin,
      out,
      err,
      writer: boot.writer,
      workingMessages: boot.workingMessages,
      emaState: boot.emaState,
      compactionConfig: boot.compactionConfig,
      sandboxRunner: boot.sandboxRunner,
      policyYes: boot.policyYes,
      replPolicy: boot.replPolicy,
      enableToolLoop: boot.enableToolLoop,
      verifyChecks: options.verifyChecks,
      t,
      prompt,
      rl: boot.rl,
    });
    boot.rl.on('line', lineHandler);

    // 第一个 prompt
    prompt();
  });
}

// === Sprint 1c-revive-3-D-29.2~3 (2026-06-07): 10 个独立职责模块抽到 repl/*.ts ===
// D-29.2 (3 commit): runAgentTurn / formatError / makeLlmSummarizeFn / appendStepSummary
// D-29.3.1 (1 commit): createFinish 工厂
// D-29.3.2 (1 commit): createLineHandler 工厂 + ReplState 5 字段共享
// D-29.3.3 (1 commit): createCloseHandler 工厂
// D-29.3.4 (1 commit): createReplBootstrap 工厂 (preamble)
// D-29.3.5 (1 commit): trim marker
// 公共 API 1:1 保 (re-export runAgentTurn / createReplConfirm / UsageEmaState
// 保 test 公共 import path), 628 既有测试 0 new fail.
// 累计: repl.ts 947L → 280L (-70%, -667L 抽到 10 个子模块).
