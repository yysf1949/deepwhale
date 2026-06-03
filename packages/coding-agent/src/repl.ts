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
import process from 'node:process';
import { stdin, stdout, stderr } from 'node:process';
import { t } from '@deepwhale/core';
import { SessionReader, SessionWriter, type SessionEvent } from '@deepwhale/core';
import {
  APIKeyMissingError,
  ChatMessage,
  DeepSeekClient,
  isLLMError,
  LLMAuthError,
  LLMClient,
  LLMNetworkError,
  LLMRateLimitError,
  LLMStreamError,
  LLMUnknownError,
} from '@deepwhale/llm';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  ToolLoopLimitError,
  type ToolLoopResult,
  type ToolLoopStep,
} from './agent/index.js';
import { createDefaultRegistry } from './tools/registry.js';

const VERSION = '0.1.0';

export interface ReplOptions {
  /** 注入 LLM 客户端（默认 DeepSeekClient）。单测用。 */
  client?: LLMClient;
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
  const client = options.client ?? new DeepSeekClient();
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;

  // greeting
  out.write(`${t('cli.greeting', VERSION, client.model)}\n`);
  if (!process.env['DEEPSEEK_API_KEY']) {
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
      if (line.startsWith('/')) {
        out.write(`${t('cli.builtin_unknown', line)}\n`);
        prompt();
        return;
      }

      // chat
      const ac = new AbortController();
      try {
        if (enableToolLoop) {
          await runAgentTurn(client, line, workingMessages, writer, out, err, ac.signal);
        } else {
          const turn = await runOneTurn(client, line, [], { signal: ac.signal });
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
 */
async function runAgentTurn(
  client: LLMClient,
  userInput: string,
  workingMessages: ChatMessage[],
  writer: SessionWriter | null,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
  signal: AbortSignal,
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

  // 2) 调 tool loop
  let result: ToolLoopResult;
  try {
    result = await runToolLoop(client, workingMessages, {
      registry: createDefaultRegistry(),
      onChunk: (chunk) => {
        if (chunk.content) out.write(chunk.content);
      },
      signal,
    });
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

  // 3) 打印 final content 的剩余部分（onChunk 已经增量打印，但保险起见再 print）
  if (result.final.content) {
    out.write(`${result.final.content}\n\n`);
  }

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

function formatError(e: unknown): string {
  if (e instanceof APIKeyMissingError) return t('error.api_key_missing');
  if (e instanceof LLMAuthError) return t('cli.error.auth', String(e.status));
  if (e instanceof LLMRateLimitError) return t('cli.error.rate_limit');
  if (e instanceof LLMNetworkError) {
    const msg = e.cause instanceof Error ? e.cause.message : e.message;
    return t('cli.error.network', msg);
  }
  if (e instanceof LLMStreamError) return t('cli.error.stream', e.message);
  if (e instanceof LLMUnknownError) {
    const detail = e.status !== undefined ? `HTTP ${e.status}` : e.message;
    return t('cli.error.unknown', detail);
  }
  if (e instanceof ToolLoopLimitError) return t('cli.tool_loop_limit', e.steps);
  if (isLLMError(e)) return t('cli.error.unknown', e.message);
  if (e instanceof Error) return t('cli.error.unknown', e.message);
  return t('cli.error.unknown', String(e));
}
