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
import { DeepSeekClient, isLLMError } from '@deepwhale/llm';
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
  const client = new DeepSeekClient();
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

  const rl: RLInterface = createInterface({ input: process.stdin, terminal: false });
  let exitCode = 0;
  let exiting = false;

  const finish = async (code: number): Promise<void> => {
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
    exitCode = code;
  };

  rl.on('line', async (line) => {
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

  rl.on('close', () => {
    void finish(0);
  });

  process.on('SIGINT', () => {
    void finish(0);
  });
  process.on('SIGTERM', () => {
    void finish(0);
  });

  // 阻塞直到 stdin 关闭
  await new Promise<void>((resolve) => rl.once('close', () => resolve()));
  return exitCode;
}

async function dispatch(
  client: DeepSeekClient,
  req: RpcRequest,
  workingMessages: Awaited<ReturnType<typeof loadSession>>['messages'],
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
      const result: ToolLoopResult = await runToolLoop(client, workingMessages, {
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
