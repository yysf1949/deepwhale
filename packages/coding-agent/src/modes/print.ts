/**
 * Print 模式 — Sprint 1a
 *
 * 一次性 chat（默认）+ tool loop：接 -p prompt，跑完退出。
 *
 * 用法：
 *   deepwhale -p "列出当前目录"
 *
 * 行为契约：
 *   - enableToolLoop=true（默认）：接 tool loop（runToolLoop + createDefaultRegistry）
 *   - enableToolLoop=false（--no-tool-loop）：纯 chat，**完全不暴露 tools schema 给 LLM**，
 *     不调任何工具。即使 LLM 想调 tool_calls，client 端 tools=undefined，
 *     LLM 服务端收到请求 schema 不含 tools，会回纯文本 content。
 *   - 流式输出到 stdout（不缓冲）
 *   - 退出码：0 正常 / 1 错误 / 2 用法错
 *
 * Sprint 1a 简化：不读 stdin，只读 -p 参数。
 */

import process from 'node:process';
import { type ChatMessage, type LLMClient, APIKeyMissingError } from '@deepwhale/llm';
import { SessionReader, SessionWriter, type SessionEvent, type SummarizeFn } from '@deepwhale/core';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  runToolLoopWithCompaction,
  type AgentCompactionConfig,
  type ToolLoopResult,
  type ToolLoopStep,
} from '../agent/index.js';
import { CompactionState } from '@deepwhale/core';
import { createDefaultRegistry } from '../tools/registry.js';
import { formatUsageStatus } from '../repl.js';
import { createDefaultClient, type Provider } from '../llm-factory.js';
import { resolveSandboxRunnerFromEnv } from '../sandbox/env-gate.js';
import { staticToolPolicy } from '../policy/static-rules.js';

export interface PrintModeOptions {
  prompt: string;
  sessionPath?: string;
  enableToolLoop?: boolean;
  maxSteps?: number;
  /**
   * 注入 LLM 客户端（默认 createDefaultClient env 推断, Sprint 1b.5 Step 2.5 C3 拍板）。
   * Sprint 1a follow-up: 单测用。
   */
  client?: LLMClient;
  /** Sprint 1b.5 Step 2.5: 显式 provider, 跟 env 推断冲突时优先. */
  provider?: Provider;
  /** Sprint 1b.5 Step 2.5: 显式 model. 不传则用 provider 默认. */
  model?: string;
  /**
   * Session compaction 集成 (Sprint 1c-revive-2-D-6, review P1 修复 2026-06-04).
   * 不传 = baseline (走 runToolLoop). 传 = 走 runToolLoopWithCompaction.
   * 拍板: writer 字段 print mode 内部构造 (跟 sessionPath 同 instance).
   */
  compactionConfig?: Omit<AgentCompactionConfig, 'writer' | 'state'> | null;
  /**
   * Sprint 1c-revive-3-D-13 (2026-06-05): --yes 标志.
   * yes=true bypass require_confirmation (write_file / edit_file / 危险 bash).
   * 不 bypass deny. 拍板: print mode 默认 isInteractive=false + policy=staticToolPolicy.
   */
  yes?: boolean;
}

export async function runPrintMode(options: PrintModeOptions): Promise<number> {
  // Sprint 1b.5 Step 2.5: print mode 跟 startRepl 一样, 用 createDefaultClient 让 provider
  // 走 env 推断 + 显式 provider 优先 (C3 拍板). 不再写死 DeepSeekClient.
  const client: LLMClient =
    options.client ??
    createDefaultClient({
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
    });
  // Sprint 1c-revive-2-D-6 (review P2 修复, 2026-06-04): 拿掉 anthropic × tool loop
  // 温柔降级 (跟 startRepl 同拍板, 见 repl.ts). D-4 已实装 AnthropicClient tool
  // schema 转换, --provider anthropic 选了就该跑 tool loop.
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;

  // Sprint 1c-revive-3-D-12 review P1 修复 (2026-06-05): 入口解析 sandbox env.
  // 未知值 throw (fail-closed), 由 CLI `main().catch` 写到 stderr + exit 1.
  // 解析成功则把 runner 显式注入 registry, 跟 BashTool 对齐.
  const sandboxRunner = resolveSandboxRunnerFromEnv({ sandboxRoot: process.cwd() });
  // Sprint 1c-revive-3-D-13 (2026-06-05): print mode 拍板 isInteractive=false
  // (非交互, 无用户确认). default policy = staticToolPolicy. --yes 透传 bypass
  // require_confirmation, 不 bypass deny.
  const policyYes = options.yes ?? false;

  // session 加载
  let workingMessages: Awaited<ReturnType<typeof loadSession>>['messages'] = [];
  const writer = sessionPath ? new SessionWriter(sessionPath) : null;
  const reader = sessionPath ? new SessionReader(sessionPath) : null;
  if (writer && reader) {
    try {
      await writer.open();
      const loaded = await loadSession(reader);
      workingMessages = [...loaded.messages];
    } catch (e) {
      process.stderr.write(`warning: could not load session: ${String(e)}\n`);
    }
  }

  // Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): compaction 集成.
  // 传 options.compactionConfig + writer 存在 → 注入完整 AgentCompactionConfig.
  let compactionConfig: AgentCompactionConfig | null = null;
  if (options.compactionConfig && writer) {
    compactionConfig = {
      ...options.compactionConfig,
      writer,
      state: new CompactionState(options.compactionConfig.pauseAfterFailures ?? 2),
    };
  } else if (options.compactionConfig && !writer) {
    process.stderr.write(
      'warning: compactionConfig requires sessionPath; falling back to baseline (no compaction).\n',
    );
  }

  try {
    // 持久化 user 输入
    if (writer) {
      const userEvent: SessionEvent = { kind: 'user', ts: Date.now(), content: options.prompt };
      await writer.append(userEvent);
    }

    // 构造 turn 消息:历史 + 本轮 user。Sprint 1a 修 P1 — user 必须进 LLM。
    const turnMessages: ChatMessage[] = [
      ...workingMessages,
      { role: 'user', content: options.prompt },
    ];

    // 调 LLM。两种模式分支:
    //   - enableToolLoop=true (默认): 走 runToolLoop (有 compactionConfig 时走
    //     runToolLoopWithCompaction, Sprint 1c-revive-2-D-6 拍板), 创 registry
    //   - enableToolLoop=false (--no-tool-loop): 走 client.stream 直发,
    //     tools 字段不传, 强制 LLM 服务端 schema 里不出现 tool, 不会产生 tool_calls
    const summaryFn: SummarizeFn | null = compactionConfig
      ? makeLlmSummarizeFn(client, compactionConfig.protocol)
      : null;
    let result: ToolLoopResult;
    try {
      if (enableToolLoop) {
        if (compactionConfig !== null && summaryFn !== null) {
          result = await runToolLoopWithCompaction(
            client,
            turnMessages,
            {
              registry: createDefaultRegistry({ sandboxRunner }),
              onChunk: (chunk) => {
                if (chunk.content) process.stdout.write(chunk.content);
              },
              ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
              policy: staticToolPolicy,
              isInteractive: false, // print mode = 非交互 (D-13 拍板)
              yes: policyYes,
              ...(writer ? { writer } : {}),
            },
            compactionConfig,
            summaryFn,
          );
        } else {
          result = await runToolLoop(client, turnMessages, {
            registry: createDefaultRegistry({ sandboxRunner }),
            onChunk: (chunk) => {
              if (chunk.content) process.stdout.write(chunk.content);
            },
            ...(options.maxSteps !== undefined ? { maxSteps: options.maxSteps } : {}),
            policy: staticToolPolicy,
            isInteractive: false, // print mode = 非交互 (D-13 拍板)
            yes: policyYes,
            ...(writer ? { writer } : {}),
          });
        }
        printStepSummary(result.steps);
      } else {
        // --no-tool-loop: 真关闭 tool calling。流式 + tools=undefined,
        // 让 LLM 服务端只回 content, 不返回 tool_calls 字段。
        // stream() 内部已累加好 final.content, 这里只负责把增量实写到 stdout。
        // 注意: client.stream 的 onChunk 接 ChatChunk, content 在 delta.content 上
        // (与 runToolLoop 的 onChunk 签名不同, 后者直接 .content)。
        const streamResult = await client.stream(turnMessages, {
          onChunk: (chunk) => {
            if (chunk.delta.content) process.stdout.write(chunk.delta.content);
          },
        });
        // 包装成 ToolLoopResult 形态,让 caller 持久化逻辑无感
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
    } catch (e) {
      if (isToolLoopError(e)) {
        process.stderr.write(`\nerror: tool loop hit max steps (${e.steps})\n`);
      } else if (e instanceof APIKeyMissingError) {
        // Sprint 1c-revive-4-D-20.1 (2026-06-05) review-fix: print mode 缺 key
        // 给 setup hint + 退出码 2 (跟参数错一致), 跟 CLI main().catch 拍板一致.
        process.stderr.write(
          'Error: API key not set. deepwhale needs DEEPSEEK_API_KEY (or ANTHROPIC_AUTH_TOKEN),\n' +
            '       or pass --provider. See --help for full setup.\n' +
            '       Hint: --verify runs build/lint/typecheck/test and does NOT need a key.\n' +
            `       Underlying: ${e.message}\n`,
        );
        return 2;
      } else {
        process.stderr.write(`\nerror: ${e instanceof Error ? e.message : String(e)}\n`);
      }
      return 1;
    }

    // 持久化 steps
    if (writer) {
      try {
        await persistToolLoopSteps(writer, result.steps);
      } catch {
        /* best-effort */
      }
    }

    // Sprint 1b: 退出后打一行 cache / cost summary 到 stderr (不污染 stdout)
    // 跟 REPL 状态栏用同一个 formatUsageStatus, 风格统一
    const usageLine = formatUsageStatus(result.final.usage);
    if (usageLine !== null) {
      process.stderr.write(`  ${usageLine}\n`);
    }

    return 0;
  } finally {
    if (writer) {
      try {
        await writer.close();
      } catch {
        /* best-effort */
      }
    }
  }
}

function printStepSummary(steps: ReadonlyArray<ToolLoopStep>): void {
  for (const step of steps) {
    if (step.kind === 'tool') {
      const status = step.result.success ? '✓' : '✗';
      process.stdout.write(`  ${status} ${step.tool_call.name} (${step.duration_ms}ms)\n`);
    }
  }
}

/**
 * 生成 LLM summary callback (Sprint 1c-revive-2-D-6).
 *
 * 跟 1c-revive-2-D-5 cluster test (compaction-cross-protocol-2d5.test.ts:231)
 * + startRepl 同形态 helper 拍板一致. 跨 openai/anthropic 同形态 (走
 * LLMClient 统一契约).
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
