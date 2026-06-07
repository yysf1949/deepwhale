/**
 * REPL bootstrap — Sprint 1c-revive-3-D-29.3.4 (2026-06-07).
 *
 * 历史:
 *   Sprint 1a 以来 startRepl 前置段 (L142-279) 包含 5 段: lazy client init / sandbox
 *   env / policy / confirm / greeting / session loading / compaction config / rl setup.
 *   Sprint 1c-revive-2-D-11-4 (2026-06-04): lazy client 化修 P1 (REPL 无 key 也能启动).
 *   Sprint 1c-revive-2-D-6 (2026-06-04): CompactionState 闭包持有 review P1.
 *   Sprint 1c-revive-3-D-12 (2026-06-05): sandbox env 解析 review P1.
 *   Sprint 1c-revive-3-D-13 (2026-06-05): --yes 标志透传.
 *   Sprint 1c-revive-3-D-19 (2026-06-05): confirm controller 拍板 (单 readline 路径).
 *   Sprint 1c-revive-2-D-21.1 (2026-06-06): EMA 平滑闭包 state 拍板.
 *
 * 拍板 (D-29.3.4):
 *   - 文件: `repl-bootstrap.ts` (kebab-case).
 *   - 公共: createReplBootstrap 工厂 (async, 返 ReplBootstrap result). 抽后 startRepl
 *     收 5 段副产物 (clientFromOptions / tryCreateClient / sandboxRunner / policyYes /
 *     confirmController / replPolicy / enableToolLoop / writer / workingMessages /
 *     emaState / compactionConfig / rl) 1 个 return 对象.
 *   - 行为 1:1: 函数体逐字迁移. greeting (cli.greeting / cli.no_api_key_hint) /
 *     session resume (cli.session_resumed / cli.session_load_warning) / compaction
 *     warning (English 'warning: compactionConfig requires sessionPath; ...') 1:1.
 *   - 拍板 (D-11-4): lazy client 化 — tryCreateClient 内部 closure, 失败 stderr
 *     "[deepwhale] init error: ..." 1:1 保. greeting 不依赖 client.model.
 *   - 拍板 (D-6): CompactionState 跨 turn 持续 — 跟 session 加载同 scope, 抽后行为保.
 *   - module-private (不 re-export).
 *
 * 拍板 (D-29.3.4 §out of scope):
 *   - 不动 startRepl 顶层 + rl.on('line'/'close') wiring — 留给 D-29.4+.
 *   - 不写新测试.
 */

import { createInterface, type Interface as RLInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { t, CompactionState, type ChatMessage } from '@deepwhale/core';
import { SessionReader, SessionWriter } from '@deepwhale/core';
import type { LLMClient } from '@deepwhale/llm';
import { loadSession, type AgentCompactionConfig } from '../agent/index.js';
import { createDefaultClient } from '../llm-factory.js';
import { resolveSandboxRunnerFromEnv } from '../sandbox/env-gate.js';
import { staticToolPolicy } from '../policy/static-rules.js';
import { createReplConfirm } from './repl-confirm.js';
import type { UsageEmaState } from './repl-session.js';
import type { ReplConfirmController } from './repl-confirm.js';
import type { SandboxRunner } from '../sandbox/types.js';
import type { ToolPolicy } from '../policy/types.js';
import type { ReplOptions } from '../repl.js';

export interface ReplBootstrapResult {
  clientFromOptions: LLMClient | undefined;
  tryCreateClient: () => { client: LLMClient | null; error: Error | null };
  enableToolLoop: boolean;
  sandboxRunner: SandboxRunner | undefined;
  policyYes: boolean;
  confirmController: ReplConfirmController;
  replPolicy: ToolPolicy;
  writer: SessionWriter | null;
  workingMessages: ChatMessage[];
  emaState: UsageEmaState;
  compactionConfig: AgentCompactionConfig | null;
  rl: RLInterface;
  sessionPath: string | undefined;
  // version 透传 (greeting 用)
  version: string;
}

export interface ReplBootstrapDeps {
  options: ReplOptions;
  out: NodeJS.WritableStream;
  err: NodeJS.WritableStream;
  version: string;
  t: typeof t;
}

export async function createReplBootstrap(deps: ReplBootstrapDeps): Promise<ReplBootstrapResult> {
  const { options, out, err, version, t: tFn } = deps;

  // === Sprint 1c-revive-3-D-12 (2026-06-05): 入口解析 sandbox env ===
  // 未知值 throw (fail-closed), 由 CLI `main().catch` 写到 stderr + exit 1.
  const sandboxRunner = resolveSandboxRunnerFromEnv({ sandboxRoot: process.cwd() });
  // Sprint 1c-revive-3-D-13: --yes 标志透传.
  const policyYes = options.yes ?? false;

  // === Sprint 1b.5 Step 2 (2.5 C3 拍板): provider 由 options.client / options.provider / env 推断 ===
  // Sprint 1c-revive-2-D-11-4 review P1 修复 (2026-06-04): **lazy** client 初始化.
  //   之前 146 行抢创 createDefaultClient() 在无 LLM key 时抛 APIKeyMissingError,
  //   REPL 根本进不去 → 跟 README "/verify 不依赖 key" 承诺冲突. 修复:
  //     1. options.client 显式给 → 立即 bind (单测路径不变)
  //     2. options.client 未给 → 走 tryCreateClient, 失败存 clientError, 不抛
  //     3. /verify 路径完全跳过 client 引用 (跟 deepwhale --verify 同语义)
  //     4. chat 路径首次调 getClient() 时才真创, clientError 走 i18n 输出
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修默认走 Anthropic 误判 bug):
  //   tryCreateClient 之前 catch 静默存 clientError, stderr 啥都不说, 用户根本
  //   不知道. 现在 catch 时显式 stderr 写一行 [deepwhale] init error, 跟 chat
  //   路径 (L494 error.api_key_missing) 互补.
  const clientFromOptions = options.client;
  let client: LLMClient | null = clientFromOptions ?? null;
  let clientError: Error | null = clientFromOptions ? null : null;
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
        // 原始 err.message (有 "Both set" 关键信息), 不强行套 i18n.
        stderr.write(`[deepwhale] init error: ${err.message}\n`);
      }
      return { client: null, error: err };
    }
  };

  // === Sprint 1c-revive-2-D-6 (review P2 修复, 2026-06-04): tool loop 兜底 ===
  // requestedToolLoop 默认 true, caller 显式 false 才不跑.
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;

  // === Sprint 1c-revive-3-D-19 (2026-06-05): confirm controller ===
  // 不再开第二个 readline 抢同一 input. createReplConfirm 返回 controller
  // (confirm + offerLine + hasPending + dismiss), 主 rl.on('line') 是 stdin 唯一消费者.
  // 拍板红线: --yes 永远先于 confirm (D-13.5 P1 重排), replPolicy.confirm 只在 yes=false
  // 才被 tool-loop 调.
  const confirmController = createReplConfirm({
    output: options.output ?? stdout,
  });
  const replPolicy: ToolPolicy = {
    ...staticToolPolicy,
    confirm: confirmController.confirm,
  };

  // === greeting — Sprint 1c-revive-2-D-11-4 review P1 修复 ===
  // 不依赖 client.model (lazy 化后 client 可能未创). 这里 greeting 只显示 ready + 版本号,
  // 跟 1b.5 时代 'model 在 greeting 显示' 比, 牺牲一点 UX 换 REPL 可在无 key 状态启动.
  const initialClientState = tryCreateClient();
  out.write(
    `${tFn('cli.greeting', version, initialClientState.client?.model ?? 'not-configured')}\n`,
  );
  if (initialClientState.error) {
    // 无 key 提示沿用 1b.5 时代 163-166 行的 stderr 警告语义.
    err.write(`${tFn('error.api_key_missing')}\n`);
  }
  out.write(`${tFn('cli.no_api_key_hint')}\n\n`);

  // === session 加载 ===
  let workingMessages: ChatMessage[] = [];
  // Sprint 1c-revive-2-D-21.1 (2026-06-06): EMA 平滑闭包 state. 跨 turn 累积, 闭包内 mutable,
  // 不持久化 (session reload 后 sampleCount 重置为 0).
  const emaState: UsageEmaState = { sampleCount: 0 };
  const writer = sessionPath ? new SessionWriter(sessionPath) : null;
  const reader = sessionPath ? new SessionReader(sessionPath) : null;
  if (writer && reader) {
    try {
      await writer.open();
      const loaded = await loadSession(reader);
      workingMessages = [...loaded.messages];
      if (workingMessages.length > 0) {
        out.write(`${tFn('cli.session_resumed', workingMessages.length, sessionPath)}\n\n`);
      }
    } catch (e) {
      err.write(`${tFn('cli.session_load_warning', String(e))}\n\n`);
    }
  }

  // === Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): CompactionState 闭包持有 ===
  // 跨 turn 持续累计 failures (paused 状态跨 turn 生效).
  //   - 传 options.compactionConfig + writer 存在 → 构造完整 AgentCompactionConfig 注入
  //   - 不传 / writer 缺失 → 走 baseline 行为, compactionConfig = null
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

  // === rl setup ===
  const rl: RLInterface = createInterface({
    input: options.input ?? stdin,
    terminal: false,
    output: options.output ?? stdout,
  });

  return {
    clientFromOptions,
    tryCreateClient,
    enableToolLoop,
    sandboxRunner,
    policyYes,
    confirmController,
    replPolicy,
    writer,
    workingMessages,
    emaState,
    compactionConfig,
    rl,
    sessionPath,
    version,
  };
}
