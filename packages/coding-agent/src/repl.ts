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
  appendVerificationEvent,
  ToolLoopLimitError,
  type AgentCompactionConfig,
  type ToolLoopResult,
  type ToolLoopStep,
} from './agent/index.js';
import { CompactionState, type SummarizeFn } from '@deepwhale/core';
import { createDefaultRegistry } from './tools/registry.js';
import { createDefaultClient, type Provider } from './llm-factory.js';
import { buildSummaryAndNext, formatReport, runVerify } from './verify/index.js';
import { resolveSandboxRunnerFromEnv } from './sandbox/env-gate.js';
import { staticToolPolicy } from './policy/static-rules.js';
import { createReplConfirm } from './repl/repl-confirm.js'; // D-15: REPL y/N confirm 工厂
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
      process.off('SIGINT', onSigint);
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
    const lineQueue: string[] = [];

    // === Sprint 1c-revive-3-D-19 (2026-06-05): P2-Ctrl+C 修法 — turn AbortController ===
    // 拍板 (D-19): turnAbortController 闭包共享, 让 SIGINT handler 能 abort 它,
    // 透传到 runToolLoop → executeToolCall → policy.confirm 的 signal 参数.
    // 注意: plan R-1 实测 — terminal:false rl 不自动派发 SIGINT 事件, 必须挂 process.
    // 单测用 mock 的 process, 通过 rl.input (PassThrough) 触发不了 SIGINT; 测 Ctrl+C
    // 行为走 turnAbortController.abort() 直接调 (见 repl-shared-stdin / tool-loop-policy test).
    //
    // turn 生命周期: 每次 chat 入口 new 一个新 controller, 旧的引用还在闭包里
    // (供 SIGINT handler 用). 拍板 (D-19): AbortController 单次 abort 语义, 一次
    // turn SIGINT 之后, 下一个 turn 用新 controller + 重新挂 SIGINT (drain old handler).
    let turnAbortController = new AbortController();
    const onSigint = (): void => {
      // Ctrl+C: dismiss in-flight confirm first (落 user_denied), 然后 abort turn.
      // 拍板 (D-19): 进程不退出, 用户可继续. finish() 仍由 /exit 或 EOF 触发.
      if (confirmController.hasPending()) {
        confirmController.dismiss();
      }
      if (!turnAbortController.signal.aborted) {
        turnAbortController.abort();
      }
    };
    process.on('SIGINT', onSigint);

    rl.on('line', async (rawLine: string) => {
      const line = rawLine.trim();

      // === Sprint 1c-revive-3-D-19 (2026-06-05): P1 修法 — 串行化 confirm 期间 line 消费 ===
      // 拍板 (D-19): 主 rl 是 stdin 唯一消费者. 确认期间收到的 line 必须喂给 confirm
      // resolver, 不能入 chat. 修 D-15 P1 (同流双 readline 抢同一行 → y 被当新 chat turn).
      // === Sprint 1c-revive-3-D-19.5 (2026-06-05): 补 — confirm 期间 /exit 不入 chat, dismiss 兜底 ===
      // 拍板 (D-19.5, user review 2026-06-05 P1): 旧逻辑 confirm 期间 /exit 走到下面
      // /exit 分支直接 await finish(0), 但 confirm 还在 pending → finish 里 rl.close
      // 后 confirm Promise 永远悬空 (跟 P2-dismiss 同源). 修法: confirm 期间 /exit 先
      // dismiss confirm 再标记 pendingExit, finally 兜底 finish. 顺序: dismiss 先
      // (让 runToolLoop 走 user_denied 审计), 再标 pendingExit.
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

      // 内建命令 — /exit 走 fast-path (复用 D-19.5 pendingExit 兜底); 其它 builtin
      // (/help /verify /unknown) 推到 turn guard 之后, turnInFlight 时入队不入 builtin.
      // 拍板 (D-19.5p, user review 2026-06-05 P2): D-19.5 注释 "全部 fast-path" 把所有 builtin
      // 提前 return, 但这违反 "turn running 时下一行不进入 builtin/chat" 语义 — y\n/verify\n
      // 紧贴会让 /verify 跑 runVerify + 写 verification event, 输出/session 交错. 修法:
      // /help /verify /unknown 跟 chat 路径一样在 turnInFlight 时入 lineQueue, finally drain.
      // 红线: /exit 例外, 走 fast-path + pendingExit (用户 /exit 语义是"立刻走", 不该 drain
      // 排队行, 跟 D-19.5 拍板一致). confirm 期间 /exit 仍走 confirm-dismiss 分支 (D-19.5 修法).
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

      // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P1 turn guard — 排队 turnInFlight 期间 line ===
      // 拍板 (D-19.5, user review 2026-06-05 P1): 旧逻辑紧跟 chat turn 的下一行 (紧贴
      // y\n 或 turn 还没跑完时 stdin 排队的行) 立刻进 chat 分支, 用旧 workingMessages
      // 并发跑第二轮, /exit 提前 close writer. 修法: 派发前检查 turnInFlight, true
      // → 入队不入 chat. finally 块跑完 turn, 检查 pendingExit (走 finish) → 否则
      // drain lineQueue 下一条 (setImmediate 避免爆栈). 红线: pendingExit 优先级高于
      // drain, 因为 /exit 应该是"不处理后续, 立刻走"语义, 不应该 drain 排队行.
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): P2 builtin guard — /help /verify /unknown 同样入队 ===
      // 拍板 (D-19.5p, user review 2026-06-05 P2): D-19.5 turn guard 只 guard chat 路径,
      // /help /verify /unknown 走 fast-path, 紧贴 chat turn 时照样跑 (e.g. /verify 写
      // verification event). 修法: 这 3 个 builtin 跟 chat 路径一起被 turn guard 拦截,
      // turnInFlight 时入 lineQueue, finally drain. /exit 例外, 仍走 fast-path + pendingExit
      // (D-19.5 拍板不变 — 用户 /exit 语义是"立刻走", 不该 drain 后续).
      if (turnInFlight) {
        lineQueue.push(line);
        return;
      }
      turnInFlight = true;

      // === Sprint 1c-revive-2-D-11-4 (2026-06-04): REPL `/verify` 内建命令 ===
      // 跟 CLI `deepwhale --verify` 走同一 runVerify() — 不走 LLM / tool loop.
      // 拍板 (D-11-4 review, 2026-06-04): REPL 里 /verify 走**异步** runVerify,
      // 跑完打 formatReport 到 out (跟其它内建命令风格一致), 然后**写 verification
      // event 到 session JSONL** (因为用户在 REPL 里跑了 verify, session 走 audit
      // 轨迹, 跟 CLI 不写 session 形成差异).
      // 退出: REPL 不退, 跑完回到 prompt 继续.
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): 移到 turn guard 之后, turnInFlight 期间 /verify 入队 ===
      // 拍板 (D-19.5p, user review 2026-06-05 P2): 旧位置 (turn guard 之前) 让 y\n/verify\n
      // 紧贴时 /verify 跑 runVerify + 写 verification event, 跟 turn 输出/session 交错.
      // 红线: turnInFlight=true 时已经在上面 lineQueue.push + return, 不会跑到这里.
      if (line === '/verify') {
        try {
          const report = await runVerify(
            options.verifyChecks !== undefined ? { checks: options.verifyChecks } : {},
          );
          const filled = buildSummaryAndNext(report);
          const text = formatReport({
            ...report,
            summary: filled.summary,
            nextSuggestedAction: filled.nextSuggestedAction,
          });
          out.write(`${text}\n`);
          if (writer) {
            // 写 verification event 到 session (跟 CLI 不同: REPL 用户有 session, 应该审计)
            const failedCount = report.checks.filter((c) => c.status !== 'passed').length;
            await appendVerificationEvent(writer, {
              status: report.overallStatus,
              durationMs: report.durationMs,
              commandCount: report.checks.length,
              failedCount,
              summary: filled.summary,
            });
          }
        } catch (e) {
          err.write(
            `error: verify failed to start: ${e instanceof Error ? e.message : String(e)}\n\n`,
          );
        }
        // 拍板 (D-19.5p): /verify 走的是 try/await runVerify, 不进 runAgentTurn try 块,
        // finally 不会跑, 必须手动 turnInFlight=false + prompt (跟 /help /unknown 一致).
        turnInFlight = false;
        prompt();
        return;
      }
      if (line === '/help') {
        out.write(`${t('cli.builtin_help')}\n`);
        turnInFlight = false;
        prompt();
        return;
      }
      if (line.startsWith('/')) {
        out.write(`${t('cli.builtin_unknown', line)}\n`);
        turnInFlight = false;
        prompt();
        return;
      }

      // chat — Sprint 1c-revive-2-D-11-4 review P1 修复: client lazy 化后, chat
      // 路径首次调 tryCreateClient() 真创. 创失败 (无 key) → i18n stderr 提示 + 跳
      // 过本次 turn (不退出 REPL, 用户可继续 /verify 或 /exit).
      // Sprint 1c-revive-3-D-19 (2026-06-05): 续命 turnAbortController. 上一个 turn 已被
      // SIGINT abort, 复用同一个 controller 第二次 abort 无效, new 一个新的. onSigint
      // 闭包持有的是变量名 (let), 新 controller 一被赋值, 下次 SIGINT 自动 abort 新的,
      // 不需要重建 handler. 红线: 不要 add 多份 SIGINT listener 重复触发.
      turnAbortController = new AbortController();
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
            turnAbortController.signal,
            compactionConfig,
            sandboxRunner,
            policyYes,
            replPolicy, // D-15: 注入 y/N confirm; 默认 staticToolPolicy 向后兼容
          );
        } else {
          const turn = await runOneTurn(liveClient, line, [], { signal: turnAbortController.signal });
          if (turn.kind === 'error') {
            err.write(`${turn.error}\n\n`);
          } else if (turn.kind === 'chat') {
            out.write(`${turn.assistant}\n\n`);
          }
        }
      } finally {
        // === Sprint 1c-revive-3-D-19.5 (2026-06-05): drain lineQueue / 走 pendingExit ===
        // 拍板 (D-19.5): turn 跑完 → 1) pendingExit=true 走 finish (丢弃排队);
        // 2) 否则 drain 下一条 line (setImmediate 避免同步递归爆栈);
        // 3) 都 false → prompt 继续. 顺序: pendingExit 优先, 不然用户 /exit 后还跑排队行.
        // 红线: finally 不能 return (no-unsafe-finally), 用 if/else if/else 链.
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
      // stdin EOF（管道/Ctrl-D）→ 优雅退出
      // === Sprint 1c-revive-3-D-19.5 (2026-06-05): P2-dismiss 修法 — close 期间清理 pending confirm + abort turn ===
      // 拍板 (D-19.5, user review 2026-06-05 P2): 旧逻辑只调 finish(0), 忽略两种悬空:
      //   1) confirm 还在 pending → policy.confirm() Promise 永远不 resolve, turn 不会
      //      走 finally, session 不会落 user_denied 审计.
      //   2) turn 还在跑 → LLM stream / tool exec 还在 await, 进程表面已关但内部链未断.
      // 修法: close 时先 dismiss pending confirm (resolve null → tool 走 user_denied 落审计),
      // 再 abort turnAbortController 让 runAgentTurn 走 finally 收束. 顺序: dismiss 先于
      // abort, 因为 confirm resolve 后 runToolLoop 才检查 signal, 调换会丢 audit 路径.
      // === Sprint 1c-revive-3-D-19.5p (2026-06-05): P1 close drain — 复用 pendingExit 兜底 finish ===
      // 拍板 (D-19.5p, user review 2026-06-05 P1): D-19.5 close handler 仍直接 `void finish(0)`,
      // finish() 内部顺序仍是 process.off + rl.close + await writer.close. 如果 turn 还在
      // 跑 (e.g. 用户在 confirm 后输入 EOF, turn 已被 abort 但 finally 还没走完 audit 落盘),
      // writer 在 turn 写 `user_denied` / steps 之前就被关, 撞 `Error: file closed` 实测
      // stderr 明确出现. 修法: 复用 D-19.5 已有的 pendingExit 机制 — turn 在跑时只标
      // pendingExit=true + abort, finally 块跑完 drain 时检测到 pendingExit 走 finish,
      // 此时 turn 已落完所有 audit 事件, writer.close() 安全. 红线: 不在 close 路径
      // 新增 turnDrain Promise, 避免和 D-19.5 SIGINT dismiss/abort 顺序冲突.
      if (confirmController.hasPending()) {
        confirmController.dismiss();
      }
      if (turnInFlight) {
        if (!turnAbortController.signal.aborted) {
          turnAbortController.abort();
        }
        // 复用 pendingExit 兜底, finally 跑完 turn 审计落盘后再 finish.
        pendingExit = true;
        return;
      }
      void finish(0);
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
    if (isToolLoopError(e)) {
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
  appendUsageStatus(result.final.usage, err);
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

/**
 * Sprint 1b: 把 usage 翻译成人类可读的一行 status, 写到 stderr (不污染 stdout 流式输出)。
 *
 * 显示规则 (Hermes footer 教训应用 — 多字段同值时去冗余):
 * - 满 usage (有 cached_tokens) → 完整 4 字段: cache: 90% | ¥0.05/turn | prompt 1.2k (1.1k cached)
 * - 无 cached_tokens → 简化为: usage: 1.2k prompt / 200 completion
 *   (不打 cache% / cost, 避免没数据时显示 0% 误导)
 * - 无 usage → 完全不打印 (LLM 没返 usage 时不污染 stderr)
 *
 * Sprint 1c 抽 pricing 到 config.toml, 此函数签名不变。
 */
export function formatUsageStatus(usage: Usage | undefined): string | null {
  if (usage === undefined) return null;
  const { prompt_tokens, completion_tokens } = usage;
  // 无 cached_tokens: 简版
  if (usage.cached_tokens === undefined) {
    return `usage: ${formatTokens(prompt_tokens)} prompt / ${formatTokens(completion_tokens)} completion`;
  }
  // 满 usage: 完整 status
  const hitRatePct = ((usage.cache_hit_rate ?? 0) * 100).toFixed(0);
  const uncached = formatTokens(usage.tokens_uncached ?? prompt_tokens);
  // Sprint 1b.5 Step 2.5 (F5 拍板, review 2026-06-03 找到): cost_turn/cost_currency 都 absent
  // (R7 中间路径 / F4 保守) → 安静少显示字段, **不**显示 'cost ?'. 跟 1b 拍板 "absent 安静"
  // 一致. user 视角看 'cost ?/turn' 是 'UI 不知道' 不是 '这次没算', 显示 '?' 反而误导.
  if (usage.cost_turn === undefined || usage.cost_currency === undefined) {
    return `cache: ${hitRatePct}% | prompt ${formatTokens(prompt_tokens)} (${uncached} new)`;
  }
  // cost 字段齐: 读 cost_currency 决 symbol
  const symbol = formatCostSymbol(usage.cost_currency);
  const cost = usage.cost_turn; // narrowed by 上面 if guard (cost_turn !== undefined)
  const costStr = cost < 0.01 ? `${symbol}${cost.toFixed(4)}` : `${symbol}${cost.toFixed(3)}`;
  return `cache: ${hitRatePct}% | ${costStr}/turn | prompt ${formatTokens(prompt_tokens)} (${uncached} new)`;
}

/** cost_currency → 显示 symbol. 不在 UI 层做汇率换算. */
function formatCostSymbol(currency: 'CNY' | 'USD' | undefined): string {
  switch (currency) {
    case 'CNY':
      return '¥';
    case 'USD':
      return '$';
    case undefined:
      return '?';
  }
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function appendUsageStatus(usage: Usage | undefined, err: NodeJS.WritableStream): void {
  const line = formatUsageStatus(usage);
  if (line !== null) {
    err.write(`  ${line}\n`);
  }
}

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
