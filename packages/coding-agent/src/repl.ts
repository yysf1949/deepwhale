/**
 * deepwhale REPL — Sprint 0.3 最小闭环入口。
 *
 * 设计原则（v1.0 Release Rule）：
 * - 一次输入 → 一次 chat → 打印回复 → 回到 prompt
 * - 不调工具、不持久化 session、不做多轮（v1.0.x 才上 tool loop + history）
 * - 缺 API key 时给明确指引而非 stack trace
 * - 内建命令：exit / quit / /exit / /help
 *
 * 文件职责：
 * - stdin line-by-line（readline + signal-aware）
 * - LLMError → 用户友好 i18n 错误
 * - Ctrl-C 优雅退出
 */

import { createInterface, type Interface as RLInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { t } from '@deepwhale/core';
import { DeepSeekClient } from '@deepwhale/llm';
import {
  APIKeyMissingError,
  LLMAuthError,
  LLMNetworkError,
  LLMRateLimitError,
  LLMUnknownError,
  isLLMError,
} from '@deepwhale/llm';
import type { LLMClient } from '@deepwhale/llm';
import type { ChatMessage } from '@deepwhale/llm';

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
  /** 每条 chat 后是否清空消息历史。Sprint 0.3 = true（不持久化）。 */
  singleTurn?: boolean;
}

/**
 * 单轮 chat 工具函数：把 user 输入 → LLM chat → 输出 assistant 文本。
 * 不修改 messages；调用者自己决定是否保留历史（v1.0.x 才上 multi-turn）。
 *
 * 返回值：{ kind: 'chat', assistant } | { kind: 'error', error } | { kind: 'empty' }
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
    const result = await client.chat(allMessages, options.signal);
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
  const singleTurn = options.singleTurn ?? true;

  const client = options.client ?? new DeepSeekClient();

  // greeting — 在创建 readline 之前就显示（避免与 prompt 错位）
  out.write(`${t('cli.greeting', VERSION, client.model)}\n`);
  if (!process.env['DEEPSEEK_API_KEY']) {
    // 不通过 client.chat 触发：直接告诉用户，方便本地排错
    err.write(`${t('error.api_key_missing')}\n`);
  }
  out.write(`${t('cli.no_api_key_hint')}\n\n`);

  const rl: RLInterface = createInterface({
    input: options.input ?? stdin,
    terminal: false, // Sprint 0.3 用非交互模式（避免 TTY 依赖）
    output: options.output ?? stdout,
  });

  let messages: ChatMessage[] = [];

  return new Promise<number>((resolve) => {
    let exiting = false;

    const finish = (code: number) => {
      if (exiting) return;
      exiting = true;
      rl.close();
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
        finish(0);
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
      const turn = await runOneTurn(client, line, messages, { signal: ac.signal });
      if (turn.kind === 'error') {
        err.write(`${turn.error}\n\n`);
      } else if (turn.kind === 'chat') {
        out.write(`${turn.assistant}\n\n`);
      }
      // 错误/成功都按单轮重置（v1.0.x 才上 history）
      if (singleTurn) {
        messages = [];
      }
      prompt();
    });

    rl.on('close', () => {
      // stdin EOF（管道/Ctrl-D）→ 优雅退出
      finish(0);
    });

    const prompt = () => {
      if (exiting) return;
      out.write(t('cli.prompt'));
    };

    // 第一个 prompt
    prompt();
  });
}

function formatError(e: unknown): string {
  if (e instanceof APIKeyMissingError) return t('error.api_key_missing');
  if (e instanceof LLMAuthError) return t('cli.error.auth', String(e.status));
  if (e instanceof LLMRateLimitError) return t('cli.error.rate_limit');
  if (e instanceof LLMNetworkError) {
    const msg = e.cause instanceof Error ? e.cause.message : e.message;
    return t('cli.error.network', msg);
  }
  if (e instanceof LLMUnknownError) {
    const detail = e.status !== undefined ? `HTTP ${e.status}` : e.message;
    return t('cli.error.unknown', detail);
  }
  if (isLLMError(e)) return t('cli.error.unknown', e.message);
  if (e instanceof Error) return t('cli.error.unknown', e.message);
  return t('cli.error.unknown', String(e));
}
