/**
 * RPC 模式 — Sprint 1a stub
 *
 * NDJSON over stdio（Codex / oh-my-pi 借鉴）：每行 = 1 个 JSON object。
 *   - request:  { id, method, params }
 *   - response: { id, result | error }
 *   - notification: { method, params }  // server push,无 id
 *
 * Sprint 1a stub 范围：
 *   - 实现 NDJSON line parser + writer
 *   - 实现 1 个 method: 'chat'（复用 runPrintMode 逻辑）
 *   - 拒绝其他 method 返回 "method not found"
 *   - Ctrl-C 优雅退出
 *
 * Sprint 1b 扩展：
 *   - initialize / cancel / shutdown
 *   - session 加载/恢复/分支
 *   - streaming 增量推送（sse-like notifications）
 */

import process from 'node:process';
import { createInterface, type Interface as RLInterface } from 'node:readline';
import { isLLMError, type ChatMessage, type LLMClient } from '@deepwhale/llm';
import { SessionReader, SessionWriter, type SessionEvent, type SummarizeFn } from '@deepwhale/core';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  runToolLoopWithCompaction,
  type AgentCompactionConfig,
  type ToolLoopResult,
} from '../agent/index.js';
import { CompactionState } from '@deepwhale/core';
import { createDefaultRegistry } from '../tools/registry.js';
import { createDefaultClient, type Provider } from '../llm-factory.js';
import { resolveSandboxRunnerFromEnv } from '../sandbox/env-gate.js';
import { staticToolPolicy } from '../policy/static-rules.js';
import type { SandboxRunner } from '../sandbox/types.js';

export interface RpcModeOptions {
  sessionPath?: string;
  maxSteps?: number;
  /** 注入 LLM 客户端（默认 createDefaultClient env 推断, Sprint 1c-revive-2-D-5+ P2）。 */
  client?: LLMClient;
  /** Sprint 1c-revive-2-D-5+ P2: 显式 provider, 跟 env 推断冲突时优先. */
  provider?: Provider;
  /** Sprint 1c-revive-2-D-5+ P2: 显式 model. */
  model?: string;
  /** 注入输入流（默认 process.stdin）。Sprint 1a follow-up:单测用。 */
  input?: NodeJS.ReadableStream;
  /**
   * 注入 signal handler 监听哪个信号（默认监听 SIGINT + SIGTERM）。
   * Sprint 1a follow-up #3: 单测用 — 避免重复监听真实 OS signal 污染 vitest 全局。
   * 设成 `[]` 跳过 signal handler 注册, 仅靠 stdin close 退出。
   */
  watchSignals?: ReadonlyArray<NodeJS.Signals>;
  /**
   * Session compaction 集成 (Sprint 1c-revive-2-D-6, review P1 修复 2026-06-04).
   * 不传 = baseline. 传 = runToolLoopWithCompaction 跨 chat request 持久化
   * (CompactionState 闭包持有, writer 复用 sessionPath writer).
   */
  compactionConfig?: Omit<AgentCompactionConfig, 'writer' | 'state'> | null;
  /**
   * Sprint 1c-revive-3-D-13 (2026-06-05): --yes 标志. rpc 拍板 isInteractive=false.
   */
  yes?: boolean;
}

interface RpcRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponseOk {
  id: string;
  result: unknown;
}
interface RpcResponseErr {
  id: string;
  error: { code: string; message: string };
}
type RpcResponse = RpcResponseOk | RpcResponseErr;

interface RpcNotification {
  method: string;
  params: Record<string, unknown>;
}

export async function runRpcMode(options: RpcModeOptions): Promise<number> {
  // Sprint 1c-revive-2-D-5+ (review P2, 2026-06-04): rpc 改走 createDefaultClient
  // factory, 跟 print/repl 拍板一致 (env 推断 + flag 显式覆盖). 旧实现写死
  // DeepSeekClient 拍 P2 bug: --provider anthropic 走 rpc 仍用 deepseek.
  const client: LLMClient =
    options.client ??
    createDefaultClient({
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
    });
  const sessionPath = options.sessionPath;

  // Sprint 1c-revive-3-D-12 review P1 修复 (2026-06-05): 入口解析 sandbox env.
  // 未知值 throw (fail-closed), 由 CLI `main().catch` 写到 stderr + exit 1.
  const sandboxRunner = resolveSandboxRunnerFromEnv({ sandboxRoot: process.cwd() });
  // Sprint 1c-revive-3-D-13: rpc 拍板 isInteractive=false (D-15 扩 confirmedTools 协议).
  const policyYes = options.yes ?? false;

  // session
  let workingMessages: Awaited<ReturnType<typeof loadSession>>['messages'] = [];
  const writer = sessionPath ? new SessionWriter(sessionPath) : null;
  const reader = sessionPath ? new SessionReader(sessionPath) : null;
  if (writer && reader) {
    try {
      await writer.open();
      const loaded = await loadSession(reader);
      workingMessages = [...loaded.messages];
    } catch (e) {
      sendError('session_load_failed', `could not load session: ${String(e)}`, '');
    }
  }

  // Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): CompactionState 闭包持有,
  // 跨 chat request 持续累计 failures / paused 状态. 跟 startRepl 拍板一致.
  let compactionConfig: AgentCompactionConfig | null = null;
  if (options.compactionConfig && writer) {
    compactionConfig = {
      ...options.compactionConfig,
      writer,
      state: new CompactionState(options.compactionConfig.pauseAfterFailures ?? 2),
    };
  } else if (options.compactionConfig && !writer) {
    sendError(
      'compaction_requires_session',
      'compactionConfig requires sessionPath; falling back to baseline (no compaction).',
      '',
    );
  }

  process.stderr.write('deepwhale rpc mode (Sprint 1a stub)\n');
  process.stderr.write('  methods: chat { prompt, stream? }\n');
  process.stderr.write('  notifications: stderr only\n');

  const rl: RLInterface = createInterface({
    input: options.input ?? process.stdin,
    terminal: false,
  });
  let exiting = false;
  // Sprint 1a follow-up:readline line event 不会 await handler,并发 dispatch 会让 workingMessages race。
  // 维护一个 in-flight chain,保证 request 串行处理,workingMessages 累积语义稳定。
  //
  // P1 follow-up:close/SIGINT 路径必须先 await chain,否则正在跑的 chat 写到一半就被 rl.close 砍掉,
  // chat.delta notification / response 都会被截断,响应"晚到"或直接丢。
  // 协议契约:close 触发后,已收到的 request 仍要完整处理完,只有 stdin 已关且 chain 排空才能 finish。
  let chain: Promise<void> = Promise.resolve();
  // 标记"想退出",但不立刻 finish。close handler 会 await chain 再 finish。
  let shouldExit = false;
  let exitSignal: number = 0;

  const finish = async (): Promise<void> => {
    if (exiting) return;
    exiting = true;
    rl.close();
    if (writer) {
      try {
        await writer.close();
      } catch {
        /* best-effort */
      }
    }
  };

  const requestShutdown = (code: number): void => {
    if (shouldExit) return; // 已经处于 shutdown 流程,不要重复 signal
    shouldExit = true;
    exitSignal = code;
  };

  rl.on('line', (line: string) => {
    chain = chain.then(async () => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let req: RpcRequest;
      try {
        const parsed = JSON.parse(trimmed);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          typeof (parsed as RpcRequest).id !== 'string' ||
          typeof (parsed as RpcRequest).method !== 'string'
        ) {
          sendError('invalid_request', 'expected {id, method, params?}', '');
          return;
        }
        req = parsed as RpcRequest;
      } catch (e) {
        sendError('parse_error', `invalid JSON: ${String(e)}`, '');
        return;
      }

      try {
        const result = await dispatch(
          client,
          req,
          workingMessages,
          writer,
          options,
          compactionConfig,
          sandboxRunner,
          policyYes,
        );
        sendOk(req.id, result);
      } catch (e) {
        if (isToolLoopError(e)) {
          sendError('tool_loop_limit', e.message, req.id);
        } else if (isLLMError(e)) {
          sendError('llm_error', e.message, req.id);
        } else {
          sendError('internal_error', e instanceof Error ? e.message : String(e), req.id);
        }
      }
    });
  });

  rl.on('close', () => {
    // stdin 关闭 → 标记退出,但不立刻 finish。finish 由 chain 排空触发。
    // Sprint 1a follow-up #3:signal handler 走的是 "rl.close() 触发此 close handler" 路径,
    // 所以 SIGINT/SIGTERM 也走这里 drain — 保证 in-flight chat 能写完响应。
    requestShutdown(0);
  });

  // Sprint 1a follow-up #3: 之前 SIGINT/SIGTERM 只 requestShutdown(0) 但不 rl.close(),
  // 若 stdin 还开着 (例如纯 RPC 模式无 stdin 数据), 进程永远等 close 事件 → 挂住。
  // 修法: signal handler 主动 rl.close(), 走和 stdin close 一样的 drain 路径。
  // exitSignal 反映是被 signal 干掉 (128 + 信号编号), 让 caller 决定退出码 130/143。
  const watchSignals = options.watchSignals ?? (['SIGINT', 'SIGTERM'] as const);
  const signalHandlers: Array<{ sig: NodeJS.Signals; handler: () => void }> = [];
  for (const sig of watchSignals) {
    const handler = (): void => {
      // 128 + 信号编号 是 POSIX 约定 (130 = SIGINT, 143 = SIGTERM, ...)
      const code = sig === 'SIGINT' ? 130 : sig === 'SIGTERM' ? 143 : 128;
      requestShutdown(code);
      // 主动触发 close, 走和 stdin close 完全一样的 drain 路径
      rl.close();
    };
    process.on(sig, handler);
    signalHandlers.push({ sig, handler });
  }

  // 阻塞直到 stdin 关闭。close 之后,等 chain 排空再 cleanup。
  await new Promise<void>((resolve) => rl.once('close', () => resolve()));
  // P1 follow-up:等 chain 排空 + finish,才能保证 close 之后排队的 request 完整写完 stdout。
  await chain;
  await finish();
  // 卸载 signal handler 避免 leak: 同一进程多次调用 runRpcMode 不能重复挂 signal。
  for (const { sig, handler } of signalHandlers) {
    process.off(sig, handler);
  }
  return exitSignal;
}

async function dispatch(
  client: LLMClient,
  req: RpcRequest,
  workingMessages: ChatMessage[],
  writer: SessionWriter | null,
  options: RpcModeOptions,
  compactionConfig: AgentCompactionConfig | null,
  // Sprint 1c-revive-3-D-12 review P1 修复: 透传 sandboxRunner 进 dispatch,
  // 让 chat request 内的 tool loop 跟 env 配置一致.
  sandboxRunner: SandboxRunner,
  // Sprint 1c-revive-3-D-13: 透传 yes 进 dispatch.
  yes: boolean,
): Promise<unknown> {
  switch (req.method) {
    case 'chat': {
      const prompt = req.params?.['prompt'];
      if (typeof prompt !== 'string') {
        throw new Error('chat: params.prompt must be a string');
      }
      const stream = req.params?.['stream'] === true;
      if (writer) {
        const userEvent: SessionEvent = { kind: 'user', ts: Date.now(), content: prompt };
        await writer.append(userEvent);
      }
      // 构造 turn 消息:历史 + 本轮 user。Sprint 1a 修 P1 — user 必须进 LLM。
      const turnMessages: ChatMessage[] = [...workingMessages, { role: 'user', content: prompt }];
      // Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): compactionConfig 存在
      // 走 runToolLoopWithCompaction, 跨 chat request 复用 CompactionState (paused
      // / failures 跨 request 持续, 跟 test 1c-revive-2-D-5-2 拍板).
      const summaryFn: SummarizeFn | null = compactionConfig
        ? makeLlmSummarizeFn(client, compactionConfig.protocol)
        : null;
      const result: ToolLoopResult = await (async () => {
        if (compactionConfig !== null && summaryFn !== null) {
          return runToolLoopWithCompaction(
            client,
            turnMessages,
            {
              registry: createDefaultRegistry({ sandboxRunner }),
              ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
              ...(stream
                ? {
                    onChunk: (chunk: { content?: string }) => {
                      if (chunk.content) {
                        const notif: RpcNotification = {
                          method: 'chat.delta',
                          params: { content: chunk.content },
                        };
                        process.stdout.write(`${JSON.stringify(notif)}\n`);
                      }
                    },
                  }
                : {}),
              policy: staticToolPolicy,
              isInteractive: false, // rpc 拍板非交互 (D-13)
              yes,
              ...(writer ? { writer } : {}),
            },
            compactionConfig,
            summaryFn,
          );
        }
        return runToolLoop(client, turnMessages, {
          registry: createDefaultRegistry({ sandboxRunner }),
          ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
          ...(stream
            ? {
                onChunk: (chunk) => {
                  if (chunk.content) {
                    const notif: RpcNotification = {
                      method: 'chat.delta',
                      params: { content: chunk.content },
                    };
                    process.stdout.write(`${JSON.stringify(notif)}\n`);
                  }
                },
              }
            : {}),
          policy: staticToolPolicy,
          isInteractive: false, // rpc 拍板非交互 (D-13)
          yes,
          ...(writer ? { writer } : {}),
        });
      })();
      if (writer) {
        try {
          await persistToolLoopSteps(writer, result.steps);
        } catch {
          /* best-effort */
        }
      }
      // 跑完回写 workingMessages,下一个 request 拿到的是包含本轮 assistant 步骤的 history。
      // 修 Sprint 1a follow-up: 之前不写回,后续 chat 永远基于空历史。
      workingMessages.length = 0;
      workingMessages.push(...result.messages);
      // Sprint 1b: 顶层暴露 cache_hit_rate / cost_turn, 让 RPC caller 不用 deep dive 到 usage
      // (跟 print/REPL 状态栏对齐: 关键可观测性 1 层扁平访问)
      const resultObj: Record<string, unknown> = {
        content: result.final.content,
        usage: result.final.usage,
        steps: result.steps.length,
      };
      if (result.final.usage?.cache_hit_rate !== undefined) {
        resultObj['cache_hit_rate'] = result.final.usage.cache_hit_rate;
      }
      if (result.final.usage?.cost_turn !== undefined) {
        resultObj['cost_turn'] = result.final.usage.cost_turn;
      }
      return resultObj;
    }
    default:
      throw new Error(`method not found: '${req.method}'`);
  }
}

function sendOk(id: string, result: unknown): void {
  const resp: RpcResponse = { id, result };
  process.stdout.write(`${JSON.stringify(resp)}\n`);
}

function sendError(code: string, message: string, id: string): void {
  const resp: RpcResponse = { id, error: { code, message } };
  process.stdout.write(`${JSON.stringify(resp)}\n`);
}

/**
 * 生成 LLM summary callback (Sprint 1c-revive-2-D-6).
 * 跟 startRepl / runPrintMode 同形态 helper 拍板一致. 跨 openai/anthropic
 * 同形态 (走 LLMClient 统一契约).
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
