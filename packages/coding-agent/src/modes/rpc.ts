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
import { DeepSeekClient, isLLMError, type ChatMessage, type LLMClient } from '@deepwhale/llm';
import { SessionReader, SessionWriter, type SessionEvent } from '@deepwhale/core';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  type ToolLoopResult,
} from '../agent/index.js';
import { createDefaultRegistry } from '../tools/registry.js';

export interface RpcModeOptions {
  sessionPath?: string;
  maxSteps?: number;
  /** 注入 LLM 客户端（默认 DeepSeekClient）。Sprint 1a follow-up:单测用。 */
  client?: LLMClient;
  /** 注入输入流（默认 process.stdin）。Sprint 1a follow-up:单测用。 */
  input?: NodeJS.ReadableStream;
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
  const client: LLMClient = options.client ?? new DeepSeekClient();
  const sessionPath = options.sessionPath;

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

  process.stderr.write('deepwhale rpc mode (Sprint 1a stub)\n');
  process.stderr.write('  methods: chat { prompt, stream? }\n');
  process.stderr.write('  notifications: stderr only\n');

  const rl: RLInterface = createInterface({ input: options.input ?? process.stdin, terminal: false });
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
        const result = await dispatch(client, req, workingMessages, writer, options);
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
    requestShutdown(0);
  });

  process.on('SIGINT', () => {
    requestShutdown(0);
  });
  process.on('SIGTERM', () => {
    requestShutdown(0);
  });

  // 阻塞直到 stdin 关闭。close 之后,等 chain 排空再 cleanup。
  await new Promise<void>((resolve) => rl.once('close', () => resolve()));
  // P1 follow-up:等 chain 排空 + finish,才能保证 close 之后排队的 request 完整写完 stdout。
  await chain;
  await finish();
  return exitSignal;
}

async function dispatch(
  client: LLMClient,
  req: RpcRequest,
  workingMessages: ChatMessage[],
  writer: SessionWriter | null,
  options: RpcModeOptions,
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
      const turnMessages: ChatMessage[] = [
        ...workingMessages,
        { role: 'user', content: prompt },
      ];
      const result: ToolLoopResult = await runToolLoop(client, turnMessages, {
        registry: createDefaultRegistry(),
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
      });
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
      return {
        content: result.final.content,
        usage: result.final.usage,
        steps: result.steps.length,
      };
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
