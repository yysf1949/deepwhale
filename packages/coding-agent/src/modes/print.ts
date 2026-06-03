/**
 * Print 模式 — Sprint 1a
 *
 * 一次性 chat + tool loop：接 stdin prompt（不是从 readline），跑完退出。
 *
 * 用法：
 *   deepwhale -p "列出当前目录"
 *   echo "..." | deepwhale -p ""    # 从 stdin 读 prompt
 *
 * 行为契约：
 *   - 接 tool loop（默认）+ session（可选）
 *   - 流式输出到 stdout（不缓冲）
 *   - 退出码：0 正常 / 1 错误 / 2 用法错
 *
 * Sprint 1a 简化：不读 stdin（Sprint 0.3 同），只读 -p 参数。
 */

import process from 'node:process';
import { DeepSeekClient, type ChatMessage, type LLMClient } from '@deepwhale/llm';
import { SessionReader, SessionWriter, type SessionEvent } from '@deepwhale/core';
import {
  isToolLoopError,
  loadSession,
  persistToolLoopSteps,
  runToolLoop,
  type ToolLoopResult,
  type ToolLoopStep,
} from '../agent/index.js';
import { createDefaultRegistry } from '../tools/registry.js';

export interface PrintModeOptions {
  prompt: string;
  sessionPath?: string;
  enableToolLoop?: boolean;
  maxSteps?: number;
  /** 注入 LLM 客户端（默认 DeepSeekClient）。Sprint 1a follow-up:单测用。 */
  client?: LLMClient;
}

export async function runPrintMode(options: PrintModeOptions): Promise<number> {
  const client: LLMClient = options.client ?? new DeepSeekClient();
  const enableToolLoop = options.enableToolLoop ?? true;
  const sessionPath = options.sessionPath;

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

    // 调 tool loop（流式 + 实时打印）
    let result: ToolLoopResult;
    try {
      const maxSteps = enableToolLoop ? options.maxSteps : 1;
      result = await runToolLoop(client, turnMessages, {
        registry: createDefaultRegistry(),
        onChunk: (chunk) => {
          if (chunk.content) process.stdout.write(chunk.content);
        },
        ...(maxSteps !== undefined ? { maxSteps } : {}),
      });
    } catch (e) {
      if (isToolLoopError(e)) {
        process.stderr.write(`\nerror: tool loop hit max steps (${e.steps})\n`);
      } else {
        process.stderr.write(`\nerror: ${e instanceof Error ? e.message : String(e)}\n`);
      }
      return 1;
    }

    // 流式已实时打印 final content;非流式分支(no onChunk)此处补打印一次。
    // Sprint 1a print 模式总是传 onChunk,所以这里不再重复打印。
    printStepSummary(result.steps);

    // 持久化 steps
    if (writer) {
      try {
        await persistToolLoopSteps(writer, result.steps);
      } catch {
        /* best-effort */
      }
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
