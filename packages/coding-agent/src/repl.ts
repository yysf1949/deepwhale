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
 * 文件职责：
 *   - runOneTurn: 仍保留为低层单轮 API（不持久化，无 tool loop）
 *   - startRepl: 接 tool loop + session 的入口
 */

import { createInterface, type Interface as RLInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { t } from '@deepwhale/core';
import { SessionReader, SessionWriter, type SessionEvent } from '@deepwhale/core';
import {
  APIKeyMissingError,
  ChatMessage,
  isLLMError,
  LLMAuthError,
  LLMClient,
  LLMNetworkError,
  LLMRateLimitError,
  LLMStreamError,
  LLMUnknownError,
  type Usage,
} from '@deepwhale/llm';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  runToolLoopWithCompaction,
  ToolLoopLimitError,
  type AgentCompactionConfig,
  type ToolLoopResult,
  type ToolLoopStep,
} from './agent/index.js';
import { CompactionState, type SummarizeFn } from '@deepwhale/core';
import { createDefaultRegistry } from './tools/registry.js';
import { createDefaultClient, type Provider } from './llm-factory.js';
import { resolveSandboxRunnerFromEnv } from './sandbox/env-gate.js';
import { staticToolPolicy } from './policy/static-rules.js';
import { createReplConfirm } from './repl/repl-confirm.js'; // D-15: REPL y/N confirm 工厂
export { createReplConfirm } from './repl/repl-confirm.js'; // Sprint 1c-revive-2-D-24.2: re-export for tui-ink
import { createSignalCoordinator } from './repl/repl-signal-coordinator.js'; // D-29.1.1: SIGINT + turn AbortController 抽
import { formatUsageStatus, appendUsageStatus, type UsageEmaState } from './repl/repl-session.js'; // D-29.1.2: EMA state + usage status 抽
export { formatUsageStatus, appendUsageStatus, type UsageEmaState } from './repl/repl-session.js'; // D-29.1.2: re-export 保公共 API 1:1
import { dispatchSlashBuiltin, type SlashContext } from './repl/repl-command-router.js'; // D-29.1.3: slash builtin 派发抽 (1ceef94 + D-19.6.1 guard)
import type { ToolPolicy } from './policy/types.js';
import type { SandboxRunner } from './sandbox/types.js';

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
  // Sprint 1b.5 Step 2 (2.5 C3 拍板): provider 由 options.client / options.provider / env 推断
  // - client 显式给 → 走 client (单测路径)
  // - client 未给 + provider 显式给 → 走 createDefaultClient({provider})
  // - client 未给 + provider 未给 → 走 createDefaultClient() (env 推断 + 双设报错)
  // 任何抛 APIKeyMissingError 都被 catch 后写到 stderr (跟 1b 时代行为一致)
  //
  // Sprint 1c-revive-2-D-11-4 review P1 修复 (2026-06-04): **lazy** client 初始化.
  // 之前 146 行抢创 createDefaultClient() 在无 LLM key 时抛 APIKeyMissingError,
  // REPL 根本进不去 → 跟 README "/verify 不依赖 key" 承诺冲突. 修复:
  //   1. options.client 显式给 → 立即 bind (单测路径不变)
  //   2. options.client 未给 → 走 tryCreateClient, 失败存 clientError, 不抛
  //   3. /verify 路径完全跳过 client 引用 (跟 deepwhale --verify 同语义)
  //   4. chat 路径首次调 getClient() 时才真创, clientError 走 i18n 输出
  const clientFromOptions = options.client;
  let client: LLMClient | null = clientFromOptions ?? null;
  let clientError: Error | null = clientFromOptions ? null : null;
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修默认走 Anthropic 误判 bug):
  // tryCreateClient 之前 catch 静默存 clientError, stderr 啥都不说, 用户根本
  // 不知道. 现在 catch 时显式 stderr 写一行 [deepwhale] init error, 跟 chat
  // 路径 (L494 error.api_key_missing) 互补. 走 createDefaultClient → resolveProvider
  // "Both set" 错时, 显式 message 让用户立刻看到 "改用 --provider 决断".
  let initErrorReported = false;
  const tryCreateClient = (): { client: LLMClient | null; error: Error | null } => {
    if (clientFromOptions) return { client: clientFromOptions, error: null };
    if (client !== null || clientError !== null) {
      return { client, error: clientError };
    }
    try {
      const c = createDefaultClient({
        ...(options.provider !== undefined ? { provider: options.provider } : {}),
        ...(options.model !== undefined ? { model: options.model } : {}),
      });
      client = c;
      clientError = null;
      return { client: c, error: null };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      clientError = err;
      if (!initErrorReported) {
        initErrorReported = true;
        // 走 stderr, 跟 chat 路径保持一致, 避免用户看不到. 拍板: message 含
        // 原始 err.message (有 "Both set" 关键信息), 不强行套 i18n (i18n 太泛
        // 用户看不出是 Both set 还是 No key).
        stderr.write(`[deepwhale] init error: ${err.message}\n`);
      }
      return { client: null, error: err };
    }
  };
  // Sprint 1c-revive-2-D-6 (review P2 修复, 2026-06-04): 拿掉 anthropic × tool loop
  // 温柔降级. 拍板: D-4 (commit 80d3fd7/bbf1bf6) 已实装 AnthropicClient tool
  // schema 转换 (toAnthropicMessages 合并连续 tool 消息), --provider anthropic
  // 选了 anthropic 就该跑 tool loop. 旧 1b.5 Step 2.5 时代 'Sprint 1b.5 does not
  // support tool loop' 拍板已废 (Step 2.5 → 1c, Anthropic tool protocol 已 ship).
  // 兜底: requestedToolLoop 默认 true, caller 显式 false 才不跑.
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;

  // Sprint 1c-revive-3-D-12 review P1 修复 (2026-06-05): 入口解析 sandbox env.
  // 未知值 throw (fail-closed), 由 CLI `main().catch` 写到 stderr + exit 1.
  const sandboxRunner = resolveSandboxRunnerFromEnv({ sandboxRoot: process.cwd() });
  // Sprint 1c-revive-3-D-13: REPL = 交互模式 (isInteractive=true), --yes 标志透传.
  const policyYes = options.yes ?? false;
  // Sprint 1c-revive-3-D-19 (2026-06-05): P1 修法 — 不再开第二个 readline 抢同一 input.
  // createReplConfirm 现在返回 controller (confirm + offerLine + hasPending + dismiss),
  // 主 rl.on('line') 是 stdin 唯一消费者, 确认期间用 offerLine() 串行化.
  // 拍板 (D-19): 单 readline 路径, 删 D-15 R-1 "子 rl 短窗口" 妥协.
  // 拍板红线: --yes 永远先于 confirm (D-13.5 P1 重排), replPolicy.confirm 只在 yes=false
  // 才被 tool-loop 调. runAgentTurn 加可选 policy 参数透传 (默认 staticToolPolicy 向后兼容).
  const confirmController = createReplConfirm({
    output: options.output ?? stdout,
  });
  const replPolicy: ToolPolicy = {
    ...staticToolPolicy,
    confirm: confirmController.confirm,
  };

  // greeting — Sprint 1c-revive-2-D-11-4 review P1 修复: 不依赖 client.model (lazy 化后
  // client 可能未创). 真创只在 chat 首次发生; 创失败 i18n 错误到 stderr. 这里 greeting
  // 只显示 ready + 版本号, 跟 1b.5 时代 'model 在 greeting 显示' 比, 牺牲一点 UX
  // (用户得 chat 一次才能看到 model 名) 换 REPL 可在无 key 状态启动.
  const initialClientState = tryCreateClient();
  out.write(
    `${t('cli.greeting', VERSION, initialClientState.client?.model ?? 'not-configured')}\n`,
  );
  if (initialClientState.error) {
    // 无 key 提示沿用 1b.5 时代 163-166 行的 stderr 警告语义, 但挪到 lazy create 之后
    err.write(`${t('error.api_key_missing')}\n`);
  }
  out.write(`${t('cli.no_api_key_hint')}\n\n`);

  // session 加载
  let workingMessages: ChatMessage[] = [];
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
  // EMA 平滑闭包 state. appendUsageStatus 每 turn in-place 更新, formatUsageStatus
  // 读 ema 显示 (avg NN%). 跨 turn 累积, 闭包内 mutable, 不持久化 (session reload
  // 后 sampleCount 重置为 0, 避免误导 — user 看到 avg 段消失就知道 reload 过了).
  const emaState: UsageEmaState = { sampleCount: 0 };
  const writer = sessionPath ? new SessionWriter(sessionPath) : null;
  const reader = sessionPath ? new SessionReader(sessionPath) : null;
  if (writer && reader) {
    try {
      await writer.open();
      const loaded = await loadSession(reader);
      workingMessages = [...loaded.messages];
      if (workingMessages.length > 0) {
        out.write(`${t('cli.session_resumed', workingMessages.length, sessionPath)}\n\n`);
      }
    } catch (e) {
      err.write(`${t('cli.session_load_warning', String(e))}\n\n`);
    }
  }

  // Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): CompactionState 闭包持有,
  // 跨 turn 持续累计 failures (paused 状态跨 turn 生效, 跟 test 1c-revive-2-D-5-2 拍板).
  // - 传 options.compactionConfig + writer 存在 → 构造完整 AgentCompactionConfig 注入
  // - 不传 / writer 缺失 → 走 baseline 行为, compactionConfig = null
  let compactionConfig: AgentCompactionConfig | null = null;
  if (options.compactionConfig && writer) {
    compactionConfig = {
      ...options.compactionConfig,
      writer,
      state: new CompactionState(options.compactionConfig.pauseAfterFailures ?? 2),
    };
  } else if (options.compactionConfig && !writer) {
    err.write(
      'warning: compactionConfig requires sessionPath; falling back to baseline (no compaction).\n',
    );
  }

  const rl: RLInterface = createInterface({
    input: options.input ?? stdin,
    terminal: false,
    output: options.output ?? stdout,
  });

  return new Promise<number>((resolve) => {
    let exiting = false;

    // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P2-SIGINT 修法 — finish 移除全局 listener ===
    // 拍板 (D-19.5, user review 2026-06-05 P2): repl.ts:307 每次 startRepl() 挂全局
    // process.on('SIGINT'), finish() 没 process.off, 嵌入式/测试多次启动 REPL → 累积
    // listener. 后 Ctrl+C 触发已退出 REPL 的闭包. 修法: finish() 入口先 .off 一次.
    // 顺序: .off 必须在 rl.close() 之前, 否则 close 派发 'close' event 期间 Ctrl+C 还能
    // 触达 onSigint 闭包. 红线: 跟 D-19 P2-Ctrl+C 拍板不冲突 — finish 才清理, SIGINT
    // 触发的 dismiss + abort 仍由 onSigint 兜底 (D-19 行为不变).
    const finish = async (code: number): Promise<void> => {
      if (exiting) return;
      exiting = true;
      // === Sprint 1c-revive-3-D-19.6 (2026-06-05): 清 exitTimer 防止 P1 兜底 timer 泄漏 ===
      if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = null;
      }
      // === Sprint 1c-revive-3-D-29.1.1 (2026-06-07): SIGINT 清理走 coordinator dispose() ===
      // 红线 (D-19.5): off 必须在 rl.close() 之前, 否则 close 派发 'close' event 期间
      // Ctrl+C 还能触达 onSigint 闭包. coordinator.dispose() 内部按此顺序处理, 幂等.
      signalCoordinator.dispose();
      rl.close();
      if (writer) {
        try {
          await writer.close();
        } catch {
          /* 关闭失败 best-effort,REPL 退出码仍按 caller 决定 */
        }
      }
      out.write(`${t('cli.goodbye')}\n`);
      resolve(code);
    };

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
    let turnInFlight = false;
    let pendingExit = false;
    // === Sprint 1c-revive-3-D-19.6 (2026-06-05): P1 close-during-turn 30s 兜底 timer ===
    // 拍板 (D-19.6, user review 2026-06-05 P1): close handler 走 pendingExit + finally
    // 兜底 finish() 后, 若 in-flight turn 永远不收束 (e.g. 网络卡死/无限 retry), REPL
    // 永远不退出. exitTimer 启动 30s 硬 timeout, 触发时 stderr warning (i18n) +
    // 强制 finish. 变量与 pendingExit 同 scope (Q2=方案 2): REPL 单次生命周期状态,
    // 模块级会让嵌入式/并行多 REPL 实例互相污染. 仅 turnInFlight=true 启动 (Q3=b):
    // 没有 in-flight turn 时直接 finish, 不需要兜底.
    let exitTimer: NodeJS.Timeout | null = null;
    const lineQueue: string[] = [];

    // === Sprint 1c-revive-3-D-29.1.1 (2026-06-07): SIGINT + turn AbortController 抽 ===
    // 拍板 (D-29.1.1): signal-coordinator 持有 turnAbortController 闭包 + SIGINT listener
    // 生命周期, repl.ts 通过 getSignal() / refresh() / abortIfActive() / dispose() 4 方法
    // 跟它交互. 行为 1:1 等价 D-19 P1/P2 拍板: dismiss in-flight confirm 先 (落 user_denied
    // 审计), 再 abort turn; 进程不退出, 用户可继续. dispose() 幂等, finish() 入口调
    // (D-19.5 顺序红线: off 必须在 rl.close() 之前, coordinator 内部按此顺序处理).
    const signalCoordinator = createSignalCoordinator({
      confirmController,
    });

    rl.on('line', async (rawLine: string) => {
      const line = rawLine.trim();

      // 拍板 (D-19 + D-19.5): 主 rl 是 stdin 唯一消费者, 确认期间 line 喂 confirm resolver.
      // D-19.5 P2-dismiss 修: confirm 期间 /exit 先 dismiss confirm 再 pendingExit, finally 兜底.
      if (confirmController.hasPending()) {
        if (line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit') {
          confirmController.dismiss();
          pendingExit = true;
          return;
        }
        const consumed = confirmController.offerLine(line);
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
        turnInFlight &&
        line.startsWith('/') &&
        line !== '/exit' &&
        line !== '/quit'
      ) {
        out.write(`${t('cli.turn_in_flight_deny')}\n\n`);
        prompt();
        return;
      }

      // 内建命令 — 全部 fast-path, 不走 turnInFlight (内建不等 chat turn)
      if (line === '') {
        prompt();
        return;
      }
      if (line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit') {
        // 拍板 (D-19.5): turn 不在跑直接 finish; 在跑标 pendingExit, finally 兜底.
        if (turnInFlight) {
          pendingExit = true;
          return;
        }
        await finish(0);
        return;
      }
      // === Sprint 1c-revive-3-D-29.1.3 (2026-06-07): slash builtin 派发抽到 dispatchSlashBuiltin ===
      // 拍板 (D-29.1.3): router 派发顺序保 1:1 (跟原 L434-481): /help → /verify → /unknown slash.
      // 5 红线 0 改: turnInFlight guard (D-19.6.1 + 6afccc8) 仍在本函数 L409-418,
      //              /verify try/finally (1ceef94) 走 router 内部 try/catch 等价.
      //              confirm 期间 /exit dismiss (D-19.5 P2-dismiss) 仍在本函数 L370-373.
      //              /exit fast-path (D-19.5 P1) 走 L412 exclude, 不入 router.
      const slashCtx: SlashContext = {
        out,
        err,
        writer,
        verifyChecks: options.verifyChecks,
        prompt,
      };
      if ((await dispatchSlashBuiltin(line, slashCtx)).handled) return;

      // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P1 turn guard — 排队 turnInFlight 期间 line ===
      // 拍板 (D-19.5, user review 2026-06-05 P1): 旧逻辑紧跟 chat turn 的下一行 (紧贴
      // y\n 或 turn 还没跑完时 stdin 排队的行) 立刻进 chat 分支, 用旧 workingMessages
      // 并发跑第二轮, /exit 提前 close writer. 修法: 派发前检查 turnInFlight, true
      // → 入队不入 chat. finally 块跑完 turn, 检查 pendingExit (走 finish) → 否则
      // drain lineQueue 下一条 (setImmediate 避免爆栈). 红线: pendingExit 优先级高于
      // drain, 因为 /exit 应该是"不处理后续, 立刻走"语义, 不应该 drain 排队行.
      if (turnInFlight) {
        lineQueue.push(line);
        return;
      }
      turnInFlight = true;

      // chat — client lazy 化 (D-11-4), refresh AbortController 走 signalCoordinator (D-29.1.1).
      // 红线: 不要 add 多份 SIGINT listener (coordinator 内部 process.on 一次).
      signalCoordinator.refresh();
      const c = clientFromOptions ? { client: clientFromOptions, error: null } : tryCreateClient();
      if (c.client === null) {
        err.write(`${t('error.api_key_missing')}\n\n`);
        turnInFlight = false;
        prompt();
        return;
      }
      const liveClient = c.client;
      try {
        if (enableToolLoop) {
          await runAgentTurn(
            liveClient,
            line,
            workingMessages,
            writer,
            out,
            err,
            signalCoordinator.getSignal(),
            compactionConfig,
            sandboxRunner,
            policyYes,
            replPolicy, // D-15: 注入 y/N confirm; 默认 staticToolPolicy 向后兼容
            emaState, // D-21.1: EMA 平滑闭包 state 透传
          );
        } else {
          const turn = await runOneTurn(liveClient, line, [], { signal: signalCoordinator.getSignal() });
          if (turn.kind === 'error') {
            err.write(`${turn.error}\n\n`);
          } else if (turn.kind === 'chat') {
            out.write(`${turn.assistant}\n\n`);
          }
        }
      } finally {
        // 拍板 (D-19.5): pendingExit 优先 (走 finish, 丢弃排队) → drain 下一条
        // (setImmediate 防同步递归爆栈) → prompt 继续. finally 不能 return
        // (no-unsafe-finally), 用 if/else if/else 链.
        turnInFlight = false;
        if (pendingExit) {
          pendingExit = false;
          void finish(0);
        } else if (lineQueue.length > 0 && !exiting) {
          const next = lineQueue.shift()!;
          setImmediate(() => rl.emit('line', next));
        } else {
          prompt();
        }
      }
    });

    rl.on('close', () => {
      // stdin EOF (管道/Ctrl-D) → 优雅退出.
      // 红线 (D-19.5 P2-dismiss + D-19.6 P1): dismiss 先于 abort (audit 顺序),
      // pendingExit 让 finally 兜底 finish, exitTimer 30s 兜底卡死 turn.
      if (confirmController.hasPending()) {
        confirmController.dismiss();
      }
      if (turnInFlight && !signalCoordinator.getSignal().aborted) {
        signalCoordinator.abortIfActive();
      }
      pendingExit = true;
      if (turnInFlight) {
        if (exitTimer) clearTimeout(exitTimer);
        exitTimer = setTimeout(() => {
          // 30s 兜底: turn 卡死时强制 finish, stderr warning 走 i18n (Q1=A).
          // 注: t() 是位置参数, 模板用 {0}, 不是 {ms}.
          if (exiting) return;
          err.write(`${t('cli.repl_force_exit_timeout', 30000)}\n`);
          void finish(0);
        }, 30_000);
        // unref: 不让 timer 阻止进程退出 (finish 自己会调 process.exit / resolve).
        exitTimer.unref?.();
      } else {
        // turn 没在跑, 直接 finish (Q3=b 的 else 分支).
        void finish(0);
      }
    });

    const prompt = (): void => {
      if (exiting) return;
      out.write(t('cli.prompt'));
    };

    // 第一个 prompt
    prompt();
  });
}

/**
 * 跑一轮 agent turn:append user → runToolLoop → 持久化 → 打印 final content。
 *
 * workingMessages 由 caller 持有（startRepl 闭包），turn 跑完后 caller 用新 messages 覆盖。
 *
 * Sprint 1a 修 P1:user 必须进 LLM。Sprint 1a 修 P2-A:流式不再重复打印 final content。
 * Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): 可选 compactionConfig — 传
 * 时调 runToolLoopWithCompaction (入口测 token, 触发则 compact + 写 event),
 * 不传 = 走裸 runToolLoop (向后兼容, 单测 baseline 244 不变). summaryFn 内部
 * 用 client + 固定 prompt 模板生成, 跟 test 1c-revive-2-D-5 cluster 拍板一致.
 * 单测通过 export 暴露,直接注入 mock LLMClient + WritableStream 验证行为。
 */
export async function runAgentTurn(
  client: LLMClient,
  userInput: string,
  workingMessages: ChatMessage[],
  writer: SessionWriter | null,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
  signal: AbortSignal,
  compactionConfig: AgentCompactionConfig | null = null,
  // Sprint 1c-revive-3-D-12 review P1 修复: startRepl 把 env 解析的 runner
  // 传进来, 工具注册表跟 env 状态对齐. 不传 = 用 LocalSandboxRunner (向后兼容).
  sandboxRunner?: SandboxRunner,
  // Sprint 1c-revive-3-D-13: 透传 yes 进 turn.
  yes?: boolean,
  // Sprint 1c-revive-3-D-15: 透传 policy 进 turn (REPL 注入 replPolicy; 单测传
  // staticToolPolicy 走 baseline). undefined = 默认 staticToolPolicy (向后兼容).
  policy?: ToolPolicy,
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
  // EMA state 透传 (闭包持有). 旧 caller 不传 = 默认 { sampleCount: 0 }, 行为兼容
  // (不显示 avg 段). REPL 路径必传, 跨 turn 累积.
  emaState?: UsageEmaState,
): Promise<void> {
  // 1) 持久化 user 输入
  if (writer) {
    const userEvent: SessionEvent = {
      kind: 'user',
      ts: Date.now(),
      content: userInput,
    };
    await writer.append(userEvent);
  }

  // 2) 构造 turn 消息:历史 + 本轮 user。Sprint 1a 修 P1 — user 必须进 LLM。
  const turnMessages: ChatMessage[] = [...workingMessages, { role: 'user', content: userInput }];

  // 3) 调 tool loop. Sprint 1c-revive-2-D-6: 传 compactionConfig 时走
  //    runToolLoopWithCompaction (带入口 compaction + 写 compaction event),
  //    不传 = 裸 runToolLoop (向后兼容, baseline 244 不变).
  const summaryFn: SummarizeFn | null = compactionConfig
    ? makeLlmSummarizeFn(client, compactionConfig.protocol)
    : null;
  // 拍板 (D-15, 2026-06-05): REPL 注入 replPolicy; 显式传 policy 也用, 默认 staticToolPolicy.
  // 拍板红线 (D-13.5 P1 重排): --yes 永远先于 confirm, replPolicy.confirm 只在 yes=false 才被调.
  const resolvedPolicy: ToolPolicy = policy ?? staticToolPolicy;
  let result: ToolLoopResult;
  try {
    if (compactionConfig !== null && summaryFn !== null) {
      result = await runToolLoopWithCompaction(
        client,
        turnMessages,
        {
          registry: createDefaultRegistry({
            ...(sandboxRunner !== undefined ? { sandboxRunner } : {}),
          }),
          onChunk: (chunk) => {
            if (chunk.content) out.write(chunk.content);
          },
          signal,
          policy: resolvedPolicy,
          isInteractive: true, // REPL = 交互模式 (D-13 拍板)
          yes: yes ?? false,
          ...(writer ? { writer } : {}),
        },
        compactionConfig,
        summaryFn,
      );
    } else {
      result = await runToolLoop(client, turnMessages, {
        registry: createDefaultRegistry({
          ...(sandboxRunner !== undefined ? { sandboxRunner } : {}),
        }),
        onChunk: (chunk) => {
          if (chunk.content) out.write(chunk.content);
        },
        signal,
        policy: resolvedPolicy,
        isInteractive: true, // REPL = 交互模式 (D-13 拍板)
        yes: yes ?? false,
        ...(writer ? { writer } : {}),
      });
    }
  } catch (e) {
    // === Sprint 1c-revive-3-D-19.6.1 (2026-06-05): Q3 修法 — abort-aware 分支 ===
    // 拍板 (D-19.6.1, user review 2026-06-05 P2.1): D-19.6 P1 修法让 close 路径 abort
    // in-flight turn, runToolLoop 内部 throw "Tool loop aborted by caller", 老 catch
    // 走 cli.error.unknown ("Unexpected error: {0}") 污染 stderr 为 unexpected error.
    // 修法: 检测 signal.aborted 优先于 isToolLoopError/isLLMError, 走专门 i18n key
    // (cli.turn_aborted_shutdown). 文案 "no audit gap" 强调 user_denied 该落的都
    // 落了 (D-19.6 P1 dismiss+abort+pendingExit 链路已保审计). 不走 unexpected
    // 路径, stderr 不再被 intentional shutdown 污染.
    //
    // 顺序红线: signal.aborted 检查必须在 isToolLoopError 之前 — runToolLoop 内部
    // abort 时 throw Error('Tool loop aborted by caller'), 这 Error 满足 isToolLoopError
    // 的某些宽松判定 (e.g. 有 .message 但无 .steps) 是不稳的. signal.aborted 是
    // 最直接的真相, 优先.
    if (signal.aborted) {
      err.write(`${t('cli.turn_aborted_shutdown')}\n\n`);
    } else if (isToolLoopError(e)) {
      err.write(`${t('cli.tool_loop_limit', e.steps)}\n\n`);
    } else if (isLLMError(e)) {
      err.write(`${formatError(e)}\n\n`);
    } else {
      err.write(`${t('cli.error.unknown', String(e))}\n\n`);
    }
    return;
  }

  // 4) 流式已实时打印;非流式分支此处补打印 final content(给上层 caller 留 fallback)。
  //    Sprint 1a REPL 总是传 onChunk 走流式,所以这里不再重复打印。

  // 4) 持久化 steps
  if (writer) {
    try {
      await persistToolLoopSteps(writer, result.steps);
    } catch (e) {
      err.write(`${t('cli.session_write_warning', String(e))}\n`);
    }
  }

  // 5) 更新 working messages（startRepl 闭包会保留新值）
  workingMessages.length = 0;
  workingMessages.push(...result.messages);

  // 6) Step summary（人类可读）
  for (const step of result.steps) {
    appendStepSummary(step, out, err);
  }

  // 7) Sprint 1b: Prefix-cache 可观测性 — 每 turn 打印一行 status 到 stderr
  // 风格: 分两行(跟 plan 拍板), 不污染 stdout 流式输出, 不打 prompt 前面
  // 字段: cache_hit_rate / cost_turn / prompt / completion, 多字段同值时去冗余(Hermes footer 教训)
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
  // 加 EMA 滚动平均 5-turn 平滑, 显示 "cache: 90% (avg 85%)". per-turn 数字
  // 仍是真实值, avg 是过去 5 turn 平滑趋势. user 不会被单 turn 抖动骗.
  // === Sprint 1c-revive-3-D-29.1.2 (2026-06-07): EMPTY_EMA 内联, repl-session.ts 内私有 ===
  // 行为 1:1: 旧 EMPTY_EMA = { sampleCount: 0 }, 旧 caller 兜底 = 内联值保持.
  appendUsageStatus(result.final.usage, err, emaState ?? { sampleCount: 0 });
}

function appendStepSummary(
  step: ToolLoopStep,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): void {
  if (step.kind === 'tool') {
    const status = step.result.success ? '✓' : '✗';
    out.write(`  ${status} ${step.tool_call.name} (${step.duration_ms}ms)\n`);
    if (!step.result.success && step.result.error) {
      err.write(`    ${step.result.error}\n`);
    }
  }
  // 'assistant' / 'limit' / 'error' 的 summary 留 Sprint 1b（不污染 Sprint 1a 验收面）
}

// === Sprint 1c-revive-3-D-29.1.2 (2026-06-07): UsageEmaState / formatUsageStatus / appendUsageStatus 抽到 repl-session.ts ===
// 公共 API re-export 在 L58-59 (跟 signal-coordinator re-export 形态对齐). 1:1 行为保:
// formatUsageStatus 输出字符串逐字保持, appendUsageStatus in-place update 顺序 (update ema →
// format → write) 保持. EMPTY_EMA 在 repl-session.ts 内私有, 旧 caller 兜底 = 内联 { sampleCount: 0 }.

function formatError(e: unknown): string {
  if (e instanceof APIKeyMissingError) return t('error.api_key_missing');
  if (e instanceof LLMAuthError) {
    // Sprint 1b.5 Step 2.5 修: tsc strict 看 LLMAuthError.status 在 .status 上
    return t('cli.error.auth', String((e as { status: number }).status));
  }
  if (e instanceof LLMRateLimitError) return t('cli.error.rate_limit');
  if (e instanceof LLMNetworkError) {
    const err = e as { cause?: unknown; message: string };
    const msg = err.cause instanceof Error ? err.cause.message : err.message;
    return t('cli.error.network', msg);
  }
  if (e instanceof LLMStreamError) {
    return t('cli.error.stream', (e as Error).message);
  }
  if (e instanceof LLMUnknownError) {
    const err = e as { status?: number; message: string };
    const detail = err.status !== undefined ? `HTTP ${err.status}` : err.message;
    return t('cli.error.unknown', detail);
  }
  if (e instanceof ToolLoopLimitError) {
    return t('cli.tool_loop_limit', (e as { steps: number }).steps);
  }
  if (isLLMError(e)) return t('cli.error.unknown', e.message);
  if (e instanceof Error) return t('cli.error.unknown', e.message);
  return t('cli.error.unknown', String(e));
}

/**
 * 生成 LLM summary callback (Sprint 1c-revive-2-D-6).
 *
 * 跟 1c-revive-2-D-5 cluster test (compaction-cross-protocol-2d5.test.ts:231)
 * 拍板一致: 走 client.chat 调 LLM 生成 1 short paragraph summary. 跨
 * openai/anthropic 同形态, 因为 client.chat 是 LLMClient 契约的统一入口.
 *
 * 不**在**这里拼 protocol-specific system prompt: Anthropic protocol
 * 走 client.chat 时已由 client 内部加 (跟 agent-compaction.ts protocol
 * 字段对齐). 1c-revive-2-D-6 拍板: protocol 字段保留供未来 system
 * prompt 模板差异化用, 当前 D-6 默认用同 system prompt 模板 (跨协议一致).
 */
function makeLlmSummarizeFn(client: LLMClient, _protocol: 'openai' | 'anthropic'): SummarizeFn {
  return async (toSummarize: ReadonlyArray<ChatMessage>): Promise<string> => {
    const summaryMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are a concise summarizer. Compress the following conversation into 1 short paragraph ' +
          '(max 200 words). Preserve key arithmetic results, tool calls, and final answers.',
      },
      {
        role: 'user',
        content: toSummarize
          .map((m, i) => `[${i}] ${m.role}: ${m.content ?? '(empty)'}`)
          .join('\n'),
      },
    ];
    const r = await client.chat(summaryMessages, {});
    return r.content;
  };
}
