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

const VERSION = '0.1.0';

export interface ReplOptions {
  /** 注入 LLM 客户端（默认 createDefaultClient env 推断, Sprint 1b.5 Step 2 C3 拍板）。单测用。 */
  client?: LLMClient;
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

  // greeting — Sprint 1c-revive-2-D-11-4 review P1 修复: 不依赖 client.model (lazy 化后
  // client 可能未创). 真创只在 chat 首次发生; 创失败 i18n 错误到 stderr. 这里 greeting
  // 只显示 ready + 版本号, 跟 1b.5 时代 'model 在 greeting 显示' 比, 牺牲一点 UX
  // (用户得 chat 一次才能看到 model 名) 换 REPL 可在无 key 状态启动.
  const initialClientState = tryCreateClient();
  out.write(`${t('cli.greeting', VERSION, initialClientState.client?.model ?? 'not-configured')}\n`);
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

    const finish = async (code: number): Promise<void> => {
      if (exiting) return;
      exiting = true;
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

    rl.on('line', async (rawLine: string) => {
      const line = rawLine.trim();

      // 内建命令
      if (line === '') {
        prompt();
        return;
      }
      if (line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit') {
        await finish(0);
        return;
      }
      if (line === '/help') {
        out.write(`${t('cli.builtin_help')}\n`);
        prompt();
        return;
      }
      if (line === '/verify') {
        // Sprint 1c-revive-2-D-11-4 (2026-06-04): REPL `/verify` 内建命令.
        // 跟 CLI `deepwhale --verify` 走同一 runVerify() — 不走 LLM / tool loop.
        // 拍板 (D-11-4 review, 2026-06-04): REPL 里 /verify 走**异步** runVerify,
        // 跑完打 formatReport 到 out (跟其它内建命令风格一致), 然后**写 verification
        // event 到 session JSONL** (因为用户在 REPL 里跑了 verify, session 走 audit
        // 轨迹, 跟 CLI 不写 session 形成差异).
        // 退出: REPL 不退, 跑完回到 prompt 继续.
        try {
          const report = await runVerify(
            options.verifyChecks !== undefined
              ? { checks: options.verifyChecks }
              : {},
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
          err.write(`error: verify failed to start: ${e instanceof Error ? e.message : String(e)}\n\n`);
        }
        prompt();
        return;
      }
      if (line.startsWith('/')) {
        out.write(`${t('cli.builtin_unknown', line)}\n`);
        prompt();
        return;
      }

      // chat — Sprint 1c-revive-2-D-11-4 review P1 修复: client lazy 化后, chat
      // 路径首次调 tryCreateClient() 真创. 创失败 (无 key) → i18n stderr 提示 + 跳
      // 过本次 turn (不退出 REPL, 用户可继续 /verify 或 /exit).
      const ac = new AbortController();
      const c = clientFromOptions ? { client: clientFromOptions, error: null } : tryCreateClient();
      if (c.client === null) {
        err.write(`${t('error.api_key_missing')}\n\n`);
        prompt();
        return;
      }
      const liveClient = c.client;
      try {
        if (enableToolLoop) {
          await runAgentTurn(liveClient, line, workingMessages, writer, out, err, ac.signal, compactionConfig);
        } else {
          const turn = await runOneTurn(liveClient, line, [], { signal: ac.signal });
          if (turn.kind === 'error') {
            err.write(`${turn.error}\n\n`);
          } else if (turn.kind === 'chat') {
            out.write(`${turn.assistant}\n\n`);
          }
        }
      } finally {
        prompt();
      }
    });

    rl.on('close', () => {
      // stdin EOF（管道/Ctrl-D）→ 优雅退出
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
  let result: ToolLoopResult;
  try {
    if (compactionConfig !== null && summaryFn !== null) {
      result = await runToolLoopWithCompaction(
        client,
        turnMessages,
        {
          registry: createDefaultRegistry(),
          onChunk: (chunk) => {
            if (chunk.content) out.write(chunk.content);
          },
          signal,
        },
        compactionConfig,
        summaryFn,
      );
    } else {
      result = await runToolLoop(client, turnMessages, {
        registry: createDefaultRegistry(),
        onChunk: (chunk) => {
          if (chunk.content) out.write(chunk.content);
        },
        signal,
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
function makeLlmSummarizeFn(
  client: LLMClient,
  _protocol: 'openai' | 'anthropic',
): SummarizeFn {
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
