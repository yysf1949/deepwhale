/**
 * TUI 模式 — Sprint 1c-revive-4-D-20.3 P0-B (2026-06-05) v1.0 capability completion
 *
 * Minimal ANSI TUI. **不**装新依赖 (无 Ink), 用 node:readline + ANSI 转义码.
 *
 * 复用红线 (D-20.3 P0-B 拍板):
 *   - 复用 runToolLoop + staticToolPolicy (不绕过 ToolPolicy)
 *   - 复用 createReplConfirm (D-19 串行化, 不重建 2 套 confirm)
 *   - 复用 SessionWriter (不绕过 session audit, 跟 REPL/print mode 同形态)
 *   - 复用 formatUsageStatus (REPL 状态栏 4 字段, 风格统一)
 *
 * 必须实现 (用户红线):
 *   1. `deepwhale tui` 启动
 *   2. 用户可输入 prompt
 *   3. assistant stream 可显示
 *   4. tool call / result 可显示
 *   5. destructive tool 触发 y/N confirm (走 createReplConfirm)
 *   6. y 执行, n/empty 拒绝
 *   7. /exit 或 q 退出
 *   8. session 不损坏 (走 D-19.5 finish 路径, writer.close)
 *   9. TUI 路径复用 ToolPolicy / SessionWriter / runToolLoop
 *
 * Minimal scope (v1.0):
 *   - ANSI 颜色: 标题 / 用户 prompt / tool call / tool result / 状态栏
 *   - 不做: 多行 / 自动补全 / 主题 / 鼠标 / 文件树 / syntax highlight
 *
 * NOT covered (defer to v1.1):
 *   - 全屏 IDE-style TUI
 *   - 主题切换
 *   - 多 session 切换
 *   - Plan mode / recovery
 */

import { createInterface, type Interface as RLInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import type { ChatMessage, LLMClient } from '@deepwhale/llm';
import { SessionReader, SessionWriter, type SessionEvent } from '@deepwhale/core';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  type AgentCompactionConfig,
  type ToolLoopResult,
} from '../agent/index.js';
import { createDefaultRegistry } from '../tools/registry.js';
import { formatUsageStatus } from '../repl.js';
import { createDefaultClient, type Provider } from '../llm-factory.js';
import { resolveSandboxRunnerFromEnv } from '../sandbox/env-gate.js';
import { staticToolPolicy } from '../policy/static-rules.js';
import { createReplConfirm } from '../repl/repl-confirm.js'; // D-19: 复用 REPL confirm controller
import type { ToolPolicy } from '../policy/types.js';
import type { SandboxRunner } from '../sandbox/types.js';

// ---- ANSI 颜色 (no dependency, 直接 escape) ----

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // 前景
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  // 背景
  bgBlue: '\x1b[44m',
} as const;

/** 检测 TTY (跟 REPL 一样, 非 TTY 退回无色输出, 让 test 不依赖 ANSI) */
const isTty = (): boolean => Boolean(stdout.isTTY);

/** 染色 wrapper (非 TTY 时退化到原文) */
function colorize(text: string, color: string): string {
  return isTty() ? `${color}${text}${ANSI.reset}` : text;
}

// ---- 视觉元素 (D-21.2 轻量升级, 2026-06-06) ----
// 复用红线 (D-20.3 P0-B): 不装新依赖 (无 Ink), 仍用 readline + ANSI.
// 新增仅 2 个 helper, 替换 header 1 处 + status bar 1 处. 不动 prompt / onChunk /
// confirm / session 路径.

/**
 * 画一条横线分隔符, 宽度按 `width` 截 (默认终端列宽, fallback 80).
 * 配色 dim + cyan 拼接, 非 TTY 退化到 `─` 重复, 让 CI/管道 log 也可读.
 */
function horizontalRule(width?: number): string {
  const cols = width ?? (stdout.columns && stdout.columns > 20 ? stdout.columns : 80);
  const w = Math.max(20, Math.min(cols - 4, 100));
  const line = '─'.repeat(w);
  return colorize('  ' + line, ANSI.dim);
}

/**
 * 格式化状态栏 — D-21.2 升级:
 * - 复用 formatUsageStatus 的 4 字段 (model / in / cached / out / cost)
 * - 加分隔线 + 颜色 (key: cyan, value: 黄色 token, 灰色 cost)
 * - 改成 1 行, 终端窄时(< 60 列) 截断不溢出
 * - 非 TTY 退化到纯文本 (跟现状一样, 不破坏 test)
 *
 * @param usage - formatUsageStatus 返回的原始行, 已是 `tokens X · cached Y · out Z · cost $W` 形态
 * @param model - 模型名, 走 formatUsageStatus 已含, 这里再拼前面 banner 用 cyan 加粗
 */
function formatTuiStatusBar(usage: string | null, model: string): string {
  if (usage === null) {
    return colorize(`  ${model} · (no usage)`, ANSI.dim);
  }
  // formatUsageStatus 输出形如 "tokens 1.2k · cached 80% · out 200 · cost $0.0012"
  // 我们把 model 提到前面 + 加色 + 末尾补分隔线
  const bar = `${model} · ${usage}`;
  // 终端窄时: 简单截断, 不做折行 (readline prompt 单行假设)
  const cols = stdout.columns && stdout.columns > 20 ? stdout.columns : 80;
  const max = Math.max(40, cols - 4);
  const text = bar.length > max ? bar.slice(0, max - 1) + '…' : bar;
  // 颜色: model 走 cyan 加粗, usage 走 dim, 整体不染色避免跟 dim 横线撞
  return colorize('  ' + text, ANSI.dim);
}

// ---- TUI options ----

export interface TuiModeOptions {
  sessionPath?: string;
  enableToolLoop?: boolean;
  maxSteps?: number;
  client?: LLMClient;
  provider?: Provider;
  model?: string;
  yes?: boolean;
  /** 注入输入流（默认 stdin）。单测用。 */
  input?: NodeJS.ReadableStream;
  /** 注入输出流（默认 stdout）。单测用。 */
  output?: NodeJS.WritableStream;
  /** 注入错误流（默认 stderr）。单测用。 */
  errorOutput?: NodeJS.WritableStream;
  /** compaction config 跟 print mode 同形态 */
  compactionConfig?: Omit<AgentCompactionConfig, 'writer' | 'state'> | null;
}

// ---- TUI 主入口 ----

export async function runTuiMode(options: TuiModeOptions = {}): Promise<number> {
  const out = options.output ?? stdout;
  const err = options.errorOutput ?? stderr;
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;

  // sandbox env 解析 (跟 print mode / REPL 一致)
  const sandboxRunner: SandboxRunner = resolveSandboxRunnerFromEnv({ sandboxRoot: process.cwd() });
  const policyYes = options.yes ?? false;

  // lazy client (跟 REPL D-11-4 拍板一致: 无 key 不阻塞启动, 首次 chat 才报错)
  const clientFromOptions = options.client;
  let client: LLMClient | null = clientFromOptions ?? null;
  let clientError: Error | null = null;
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
      const err0 = e instanceof Error ? e : new Error(String(e));
      clientError = err0;
      return { client: null, error: err0 };
    }
  };

  // D-19 复用 confirm controller
  const confirmController = createReplConfirm({ output: out });
  const tuiPolicy: ToolPolicy = {
    ...staticToolPolicy,
    confirm: confirmController.confirm,
  };

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
        out.write(
          colorize(`  ${loaded.messages.length} messages resumed from session\n`, ANSI.dim) + '\n',
        );
      }
    } catch (e) {
      err.write(`warning: could not load session: ${String(e)}\n`);
    }
  }

  // Sprint 1c-revive-4-D-20.3 P0-B (2026-06-05): TUI minimal scope 不接 compaction
  // (跟 minimal 拍板一致: D-20.3 P0 只做启动/输入/stream/confirm/exit/session 闭环).
  // Compaction 是 D-20.3 P2, 留 v1.1. options.compactionConfig 字段保留 (跟 print mode
  // 同接口), 但当前 implementation 不消费. 这样 binary 接口稳定, 后续 sprint 直接接.
  if (options.compactionConfig && writer) {
    // 显式 silently no-op (minimal TUI 暂不接 compaction, 避免跟 P0 范围扩大).
    // 注: print mode 抛 warning (D-6 拍板), TUI 不抛 (minimal scope, 留扩展点).
  }

  // 顶部 header — D-21.2 轻量升级: 横线分隔 + banner
  const initialClientState = tryCreateClient();
  const modelName = initialClientState.client?.model ?? 'not-configured';
  out.write('\n');
  out.write(horizontalRule() + '\n');
  out.write(
    colorize('  deepwhale tui ', ANSI.bold) +
      colorize(modelName, ANSI.cyan + ANSI.bold) +
      colorize('  ·  type a prompt, /help, /verify, /exit (or q)\n', ANSI.dim),
  );
  out.write(horizontalRule() + '\n\n');
  if (initialClientState.error) {
    err.write(`warning: API key not set, chat will fail until DEEPSEEK_API_KEY or ANTHROPIC_AUTH_TOKEN is set.\n`);
  }

  // readline (跟 REPL 同形态, terminal:false 跟 D-19 P2-Ctrl+C 拍板一致)
  const rl: RLInterface = createInterface({
    input: options.input ?? stdin,
    terminal: false,
    output: out,
  });

  return new Promise<number>((resolve) => {
    let exiting = false;
    let turnInFlight = false;
    let pendingExit = false;

    const finish = async (code: number): Promise<void> => {
      if (exiting) return;
      exiting = true;
      process.off('SIGINT', onSigint);
      rl.close();
      if (writer) {
        try {
          await writer.close();
        } catch {
          /* best-effort */
        }
      }
      out.write('\n' + colorize('  Goodbye!\n', ANSI.dim));
      resolve(code);
    };

    // turn abort controller (D-19 P2-Ctrl+C 拍板)
    let turnAbortController = new AbortController();
    const onSigint = (): void => {
      if (confirmController.hasPending()) {
        confirmController.dismiss();
      }
      if (!turnAbortController.signal.aborted) {
        turnAbortController.abort();
      }
    };
    process.on('SIGINT', onSigint);

    const prompt = (): void => {
      out.write(colorize('  > ', ANSI.cyan + ANSI.bold));
    };
    prompt();

    rl.on('line', async (rawLine: string) => {
      const line = rawLine.trim();

      // D-19 拍板: confirm 期间 line 优先喂 confirm
      if (confirmController.hasPending()) {
        if (line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit' || line === 'q') {
          confirmController.dismiss();
          pendingExit = true;
          return;
        }
        const consumed = confirmController.offerLine(line);
        if (consumed) return;
      }

      // 内建命令
      if (line === '') {
        prompt();
        return;
      }
      if (line === 'q' || line === 'exit' || line === 'quit' || line === '/exit' || line === '/quit') {
        if (turnInFlight) {
          pendingExit = true;
          return;
        }
        await finish(0);
        return;
      }
      if (line === '/help') {
        out.write(
          colorize(
            '\n  Commands:\n' +
              '    /help            show this help\n' +
              '    /verify          run build/lint/typecheck/test (no LLM needed)\n' +
              '    /exit, /quit, q  exit TUI\n\n',
            ANSI.dim,
          ),
        );
        prompt();
        return;
      }
      if (line === '/verify') {
        // 跟 REPL /verify 同语义 — 调 runVerify, 写 verification event
        try {
          const { runVerify, formatReport, buildSummaryAndNext } = await import('../verify/index.js');
          const report = await runVerify();
          const filled = buildSummaryAndNext(report);
          const text = formatReport({ ...report, summary: filled.summary, nextSuggestedAction: filled.nextSuggestedAction });
          out.write(text + '\n');
          if (writer) {
            const { appendVerificationEvent } = await import('../agent/index.js');
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
          err.write(`error: verify failed: ${e instanceof Error ? e.message : String(e)}\n\n`);
        }
        prompt();
        return;
      }

      // 队列守卫 (跟 REPL D-19.5 拍板)
      if (turnInFlight) {
        out.write(colorize('  (turn in flight, please wait)\n', ANSI.dim));
        prompt();
        return;
      }
      turnInFlight = true;
      turnAbortController = new AbortController();

      // lazy client
      const c = clientFromOptions ? { client: clientFromOptions, error: null } : tryCreateClient();
      if (c.client === null) {
        err.write(`error: API key not set. set DEEPSEEK_API_KEY or ANTHROPIC_AUTH_TOKEN.\n\n`);
        turnInFlight = false;
        prompt();
        return;
      }
      const liveClient = c.client;

      try {
        // 持久化 user input
        if (writer) {
          const userEvent: SessionEvent = { kind: 'user', ts: Date.now(), content: line };
          await writer.append(userEvent);
        }

        // 构造 turn messages
        const turnMessages: ChatMessage[] = [
          ...workingMessages,
          { role: 'user', content: line },
        ];

        out.write('\n'); // user 跟 assistant 间空行
        let result: ToolLoopResult;
        if (enableToolLoop) {
          result = await runToolLoop(liveClient, turnMessages, {
            registry: createDefaultRegistry({ sandboxRunner }),
            onChunk: (chunk) => {
              if (chunk.content) out.write(chunk.content);
            },
            ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
            policy: tuiPolicy,
            isInteractive: true, // TUI = 交互
            yes: policyYes,
            // Sprint 1c-revive-5-D-20.6.4 review-fix (2026-06-06): 透传 turnAbortController.signal
            // 给 runToolLoop, 让 SIGINT (onSigint) abort 时透传到 LLM stream / tool exec /
            // policy.confirm. 跟 repl.ts:509 对齐. 之前漏传, SIGINT 只 abort controller
            // 不往下传, 工具循环在 tool execution / confirm 等关键点收不到 abort,
            // hang 住, 跟 D-19 Ctrl+C/cleanup 链路不完整.
            signal: turnAbortController.signal,
            ...(writer ? { writer } : {}),
          });
        } else {
          // --no-tool-loop 直发
          const streamResult = await liveClient.stream(turnMessages, {
            onChunk: (chunk) => {
              if (chunk.delta.content) out.write(chunk.delta.content);
            },
          });
          result = {
            messages: [...turnMessages, { role: 'assistant', content: streamResult.content }],
            final: streamResult,
            steps: [
              {
                kind: 'assistant',
                ts: Date.now(),
                message: { role: 'assistant', content: streamResult.content },
                result: streamResult,
              },
            ],
          };
        }

        // TUI 格式化: tool call / result (跟 print mode printStepSummary 同形态, 但加 ANSI)
        for (const step of result.steps) {
          if (step.kind === 'tool') {
            const status = step.result.success ? colorize('✓', ANSI.green) : colorize('✗', ANSI.red);
            out.write(
              `\n  ${status} ${colorize(step.tool_call.name, ANSI.magenta + ANSI.bold)} (${step.duration_ms}ms)\n`,
            );
          }
        }

        // 持久化
        if (writer) {
          try {
            await persistToolLoopSteps(writer, result.steps);
          } catch {
            /* best-effort */
          }
        }

        // 更新 working messages (跟 REPL 一致, 加 user + 所有 steps 消息)
        workingMessages = [
          ...result.messages,
        ];

        // 状态栏 (复用 formatUsageStatus, 4 字段) — D-21.2 轻量升级: 上下加横线分隔
        const usageLine: string | null = formatUsageStatus(result.final.usage);
        if (usageLine !== null) {
          out.write('\n' + horizontalRule() + '\n');
          out.write(formatTuiStatusBar(usageLine, modelName) + '\n');
          out.write(horizontalRule() + '\n');
        } else {
          out.write('\n' + horizontalRule() + '\n');
        }
      } catch (e) {
        if (isToolLoopError(e)) {
          err.write(`\nerror: tool loop hit max steps (${e.steps})\n`);
        } else {
          err.write(`\nerror: ${e instanceof Error ? e.message : String(e)}\n`);
        }
      } finally {
        turnInFlight = false;
        if (pendingExit) {
          void finish(0);
        } else {
          prompt();
        }
      }
    });
  });
}
