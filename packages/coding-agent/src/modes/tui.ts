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
import { homedir } from 'node:os';
import { mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

// ---- D-23.1 主题 (2026-06-06) ----
//
// 用户拍板 A + B + D 全要. D-23.1 主题先行, 不动 turn 路径, 仅改 colorize 内部查找表.
// 3 preset:
//   - default:    现状 (cyan + dim)
//   - solarized:  暖色 (yellow/blue/magenta 暖冷对比)
//   - monochrome: 无前景色, 仅 dim + bold (黑/白终端, 旧 CRT 风格, 不刺眼)
//
// 6 role (每个 preset 都填): header / model / divider / prompt / error / success
//
// 选: env `DEEPWHALE_TUI_THEME` (默认 `default`), 或 CLI `--theme <name>`.
// 启动期 resolve 一次, 后续 colorize 查表.

export type TuiThemeName = 'default' | 'solarized' | 'monochrome';

export interface TuiTheme {
  header: string;
  model: string;
  divider: string;
  prompt: string;
  error: string;
  success: string;
  /** D-23.1 (2026-06-06): 工具名 (tool call/result 行), 跟 model 同级, 用同色变体 */
  toolName: string;
}

export const THEMES: Record<TuiThemeName, TuiTheme> = {
  default: {
    header: ANSI.bold,
    model: ANSI.cyan + ANSI.bold,
    divider: ANSI.dim,
    prompt: ANSI.bold,
    error: ANSI.red,
    success: ANSI.green,
    toolName: ANSI.magenta + ANSI.bold,
  },
  solarized: {
    // 暖冷对比: divider yellow, model blue, prompt bold, error red, success green
    header: ANSI.yellow + ANSI.bold,
    model: ANSI.blue + ANSI.bold,
    divider: ANSI.yellow,
    prompt: ANSI.bold,
    error: ANSI.red,
    success: ANSI.green,
    toolName: ANSI.magenta + ANSI.bold, // solarized 仍 magenta 突出 tool
  },
  monochrome: {
    // 全黑白, 区分靠 dim/bold, 不刺眼
    header: ANSI.bold,
    model: ANSI.bold,
    divider: ANSI.dim,
    prompt: ANSI.bold,
    error: ANSI.dim + ANSI.bold, // monochrome 无红, 仍用 dim+bold 强调错误
    success: ANSI.bold,
    toolName: ANSI.dim + ANSI.bold, // monochrome tool name 用 dim+bold
  },
};

const VALID_THEME_NAMES: ReadonlySet<TuiThemeName> = new Set<TuiThemeName>(['default', 'solarized', 'monochrome']);

/**
 * 解析 theme 来源 (env > 默认), 找不到或 invalid 时退化到 'default' + stderr warning.
 * 不抛: 启动期不阻塞, 跟 env-gate 风格一致.
 */
export function resolveTuiTheme(themeArg?: string): TuiThemeName {
  const fromArg = themeArg ?? process.env.DEEPWHALE_TUI_THEME;
  if (fromArg === undefined || fromArg === '') return 'default';
  if (VALID_THEME_NAMES.has(fromArg as TuiThemeName)) return fromArg as TuiThemeName;
  // invalid: stderr 提醒, 退化
  stderr.write(`warning: unknown TUI theme '${fromArg}', falling back to 'default' (valid: ${[...VALID_THEME_NAMES].join(', ')})\n`);
  return 'default';
}

/**
 * 染色 wrapper (D-23.1 改签名) — 用 role 查当前 theme.
 * 非 TTY 时退化到原文, 让 CI/管道 log 不带 ANSI.
 */
function colorize(text: string, role: keyof TuiTheme, theme: TuiTheme = THEMES.default): string {
  if (!isTty()) return text;
  return `${theme[role]}${text}${ANSI.reset}`;
}

// ---- 视觉元素 (D-21.2 轻量升级, 2026-06-06) ----
// 复用红线 (D-20.3 P0-B): 不装新依赖 (无 Ink), 仍用 readline + ANSI.
// 新增仅 2 个 helper, 替换 header 1 处 + status bar 1 处. 不动 prompt / onChunk /
// confirm / session 路径.

/**
 * 画一条横线分隔符, 宽度按 `width` 截 (默认终端列宽, fallback 80).
 * 配色 dim + cyan 拼接, 非 TTY 退化到 `─` 重复, 让 CI/管道 log 也可读.
 */
function horizontalRule(width?: number, theme: TuiTheme = THEMES.default): string {
  const cols = width ?? (stdout.columns && stdout.columns > 20 ? stdout.columns : 80);
  const w = Math.max(20, Math.min(cols - 4, 100));
  const line = '─'.repeat(w);
  return colorize('  ' + line, 'divider', theme);
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
function formatTuiStatusBar(usage: string | null, model: string, theme: TuiTheme = THEMES.default): string {
  if (usage === null) {
    return colorize(`  ${model} · (no usage)`, 'divider', theme);
  }
  // formatUsageStatus 输出形如 "tokens 1.2k · cached 80% · out 200 · cost $0.0012"
  // 我们把 model 提到前面 + 加色 + 末尾补分隔线
  const bar = `${model} · ${usage}`;
  // 终端窄时: 简单截断, 不做折行 (readline prompt 单行假设)
  const cols = stdout.columns && stdout.columns > 20 ? stdout.columns : 80;
  const max = Math.max(40, cols - 4);
  const text = bar.length > max ? bar.slice(0, max - 1) + '…' : bar;
  // 颜色: model 走 model role (theme 决定), usage 走 divider (跟 horizontalRule 一致)
  return colorize('  ' + text, 'divider', theme);
}

// ---- D-22.1 命令历史持久化 (2026-06-06) ----
//
// 复用红线 (D-20.3 P0-B): TUI-only feature, 不动 REPL/print mode.
// 复用红线 (D-19 复用 confirm controller): 历史加载在 runTuiMode 启动期, confirm 期间不动 history.
//
// 存储: ~/.deepwhale/tui-history (JSONL, 每行 1 条 raw prompt, 0o600 权限, max 1000 条 LRU).
// readline history 数组语义: 最新一条在尾部 (所以 load 时反序, append 时 push 后写尾).

const TUI_HISTORY_MAX = 1000;

function tuiHistoryPath(): string {
  return join(homedir(), '.deepwhale', 'tui-history');
}

function tuiHistoryLoad(): string[] {
  const p = tuiHistoryPath();
  try {
    const text = readFileSync(p, 'utf-8');
    // JSONL: 1 行 = 1 个对象 { ts, line }
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const out: string[] = [];
    for (const l of lines) {
      try {
        const obj = JSON.parse(l) as { line?: unknown };
        if (typeof obj.line === 'string' && obj.line.length > 0) {
          out.push(obj.line);
        }
      } catch {
        // 跳过坏行, 不破坏整个文件
      }
    }
    // 保留最新 1000 条 (LRU 截断)
    if (out.length > TUI_HISTORY_MAX) {
      out.splice(0, out.length - TUI_HISTORY_MAX);
    }
    return out;
  } catch {
    // 文件不存在 / 权限错 → 返空 (不抛, 不阻塞启动)
    return [];
  }
}

function tuiHistoryAppend(line: string): void {
  // 过滤空行 + 内建命令 (跟其它 shell history 一样, 跟 token 浪费)
  if (line.length === 0) return;
  if (line.startsWith('/')) return; // /help /verify /exit 不入历史
  if (line === 'q' || line === 'exit' || line === 'quit') return;

  const p = tuiHistoryPath();
  try {
    // 0o700 权限父目录 + 0o600 文件 (跟 ~/.bash_history 一样, 仅用户可读)
    mkdirSync(dirname(p), { mode: 0o700, recursive: true });
    const entry = JSON.stringify({ ts: Date.now(), line }) + '\n';
    appendFileSync(p, entry, { mode: 0o600 });
  } catch {
    // best-effort, 不阻塞 turn 完成
  }
}

// 暴露 tuiHistoryAppend 供测试用 (D-22.1 verification)
export { tuiHistoryAppend, tuiHistoryLoad, tuiHistoryPath, TUI_HISTORY_MAX };

// ---- D-22.2 流式 token spinner (2026-06-06) ----
//
// 5 帧: ⠋ ⠙ ⠹ ⠸ ⠼, 80ms / 帧. 走 \r carriage return + \x1b[K clear-to-end-of-line.
// Windows 兼容: cursorTo(0) + clearLine(1) 兜底 (Win10/11 终端对 \r 也支持).

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼'] as const;
const SPINNER_INTERVAL_MS = 80;
const SPINNER_LABEL = 'thinking…';

class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private active = false;

  start(stream: NodeJS.WritableStream = stdout): void {
    if (this.active) return;
    if (!isTty()) return; // 非 TTY 不转 (跟 colorize 一致, 避免管道/重定向被转)
    this.active = true;
    this.frame = 0;
    this.render(stream);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.render(stream);
    }, SPINNER_INTERVAL_MS);
  }

  stop(stream: NodeJS.WritableStream = stdout): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // 清除当前行 (覆盖 spinner 字符)
    // Windows 兼容: cursorTo(0) + clearLine(1) 是 TTY 行为, stdout 在 isTTY 时有这俩方法.
    // 非 TTY 走空格 + \r 兜底.
    const ttyStream = stream as unknown as {
      cursorTo?: (x: number) => boolean;
      clearLine?: (dir: number) => boolean;
    };
    if (typeof ttyStream.cursorTo === 'function' && typeof ttyStream.clearLine === 'function') {
      try {
        ttyStream.cursorTo(0);
        ttyStream.clearLine(1);
      } catch {
        stream.write('\r' + ' '.repeat(SPINNER_LABEL.length + 4) + '\r');
      }
    } else {
      stream.write('\r' + ' '.repeat(SPINNER_LABEL.length + 4) + '\r');
    }
  }

  private render(stream: NodeJS.WritableStream): void {
    const text = `${SPINNER_FRAMES[this.frame]} ${SPINNER_LABEL}`;
    // \r 回行首, [K 清到行尾
    stream.write(`\r${text}\x1b[K`);
  }
}

// 暴露 Spinner 类供测试用 (D-22.2 verification)
export { Spinner, SPINNER_FRAMES, SPINNER_INTERVAL_MS, SPINNER_LABEL };

// ---- D-22.3 Multi-line input (2026-06-06) ----
//
// Hermes 风格: `\` 续行 + `\\` 转义. readline 维持 terminal: true 拿 ↑↓ history.
// 续行机制: 维护 `multiLineBuffer` 状态, 收到 `\` 结尾行不喂给 turn, 下次行追加.
// 全局单例 (TUI 单 stream), 在 runTuiMode 闭包内状态化.

function isContinuationLine(line: string): boolean {
  return line.endsWith('\\') && !line.endsWith('\\\\');
}

function joinContinuation(lines: string[]): string {
  // ["line1\\", "line2\\", "line3"] → "line1\nline2\nline3"
  return lines.map((l) => l.replace(/\\$/, '')).join('\n');
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
  /** D-23.1 (2026-06-06): TUI 主题. 不传或 invalid → 'default' (跟 env DEEPWHALE_TUI_THEME 协同). */
  theme?: TuiThemeName;
  /** compaction config 跟 print mode 同形态 */
  compactionConfig?: Omit<AgentCompactionConfig, 'writer' | 'state'> | null;
}

// ---- TUI 主入口 ----

export async function runTuiMode(options: TuiModeOptions = {}): Promise<number> {
  const out = options.output ?? stdout;
  const err = options.errorOutput ?? stderr;
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;
  // D-23.1 (2026-06-06): 解析 theme. options.theme 优先 > DEEPWHALE_TUI_THEME env > 'default'.
  // 解析里含 invalid → stderr warning + 退化, 不抛 (跟 env-gate 风格一致).
  const themeName = resolveTuiTheme(options.theme);
  const theme: TuiTheme = THEMES[themeName];

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
          colorize(`  ${loaded.messages.length} messages resumed from session\n`, 'divider', theme) + '\n',
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
  out.write(horizontalRule(undefined, theme) + '\n');
  out.write(
    colorize('  deepwhale tui ', 'header', theme) +
      colorize(modelName, 'model', theme) +
      colorize('  ·  type a prompt, /help, /verify, /exit (or q)\n', 'divider', theme),
  );
  out.write(horizontalRule(undefined, theme) + '\n\n');
  if (initialClientState.error) {
    err.write(`warning: API key not set, chat will fail until DEEPSEEK_API_KEY or ANTHROPIC_AUTH_TOKEN is set.\n`);
  }

  // readline (跟 REPL 同形态)
  // D-22 (2026-06-06) 拍板: terminal: true 拿 ↑↓ history (D-22.1) + cursor (multi-line D-22.3).
  // 复用红线: SIGINT 仍走 process.on('SIGINT', onSigint) (D-19 P2-Ctrl+C), readline 不接管
  // (它 terminal mode 默认会按 Ctrl+C 抛 'SIGINT' 事件, 我们的 onSigint 仍 process 级别接收).
  const rl: RLInterface = createInterface({
    input: options.input ?? stdin,
    terminal: true,
    output: out,
  });
  // D-22.1: 加载历史到 readline (从老到新, 跟 readline 内部 history 数组语义一致)
  // 注: Node 18+ readline 实例有 `.history: string[]` 字段, 但官方 .d.ts 没声明,
  // 用 any cast 兜底.
  const rlAny = rl as unknown as { history?: string[] };
  rlAny.history = tuiHistoryLoad();

  return new Promise<number>((resolve) => {
    let exiting = false;
    let turnInFlight = false;
    let pendingExit = false;

    // D-22.3: multi-line input buffer (Hermes 风格 `\ 续行 + \\ 转义)
    const multiLineBuffer: string[] = [];
    // D-22.2: 流式 token spinner (assistant stream 期间)
    const spinner = new Spinner();

    const finish = async (code: number): Promise<void> => {
      if (exiting) return;
      exiting = true;
      process.off('SIGINT', onSigint);
      // D-22.2: 退出前停 spinner (兜底, 避免动画卡住 shell prompt)
      spinner.stop(out);
      rl.close();
      if (writer) {
        try {
          await writer.close();
        } catch {
          /* best-effort */
        }
      }
      out.write('\n' + colorize('  Goodbye!\n', 'divider', theme));
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
      out.write(colorize('  > ', 'prompt', theme));
    };
    prompt();

    rl.on('line', async (rawLine: string) => {
      // D-22.3 (2026-06-06): Hermes 风格多行输入.
      // - 末尾 `\` 续行 (不喂给 turn, 攒入 multiLineBuffer)
      // - 末尾 `\\` (转义) 不当续行, 当字面 `\` 处理
      // - 空行 + 末尾 `\` → 取消续行, 提交空 prompt
      const isCont = isContinuationLine(rawLine);
      if (isCont) {
        multiLineBuffer.push(rawLine);
        // 续行提示 (跟 shell 类似 `> `)
        out.write(colorize('  … ', 'divider', theme));
        return;
      }
      // 收尾 (非续行), 把 buffer 最后一行 + 当前行合并
      const assembled = multiLineBuffer.length > 0
        ? joinContinuation([...multiLineBuffer, rawLine])
        : rawLine;
      multiLineBuffer.length = 0;
      const line = assembled.trim();

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
            'divider',
            theme,
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
        out.write(colorize('  (turn in flight, please wait)\n', 'divider', theme));
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
          // D-22.2 (2026-06-06): turn 启动立刻启 spinner, content 来了就停
          spinner.start(out);
          result = await runToolLoop(liveClient, turnMessages, {
            registry: createDefaultRegistry({ sandboxRunner }),
            onChunk: (chunk) => {
              if (chunk.content) {
                spinner.stop(out);
                out.write(chunk.content);
              }
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
          // D-22.2 (2026-06-06): spinner 启, content 来了停
          spinner.start(out);
          const streamResult = await liveClient.stream(turnMessages, {
            onChunk: (chunk) => {
              if (chunk.delta.content) {
                spinner.stop(out);
                out.write(chunk.delta.content);
              }
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
            const status = step.result.success ? colorize('✓', 'success', theme) : colorize('✗', 'error', theme);
            out.write(
              `\n  ${status} ${colorize(step.tool_call.name, 'toolName', theme)} (${step.duration_ms}ms)\n`,
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
        // D-22.2: 异常时停 spinner (兜底)
        spinner.stop(out);
        if (isToolLoopError(e)) {
          err.write(`\nerror: tool loop hit max steps (${e.steps})\n`);
        } else {
          err.write(`\nerror: ${e instanceof Error ? e.message : String(e)}\n`);
        }
      } finally {
        // D-22.2: turn 完 (正常/异常/abort) 停 spinner
        spinner.stop(out);
        // D-22.1: turn 完 (非空, 非内建命令) append 历史
        // 注意: 续行合并后 assembled 才是真 prompt, 但历史里只存 trimmed 单行
        // (跟 bash history 一致, 多行 prompt 存 \n 不易)
        tuiHistoryAppend(assembled);
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
