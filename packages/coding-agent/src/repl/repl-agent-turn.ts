/**
 * REPL agent turn runner — Sprint 1c-revive-3-D-29.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1a 以来 runAgentTurn 是 repl.ts 内 export 函数, 给单测
 *   `test/modes-followup.test.ts:18` 通过 `import { runAgentTurn } from
 *   '../src/repl.js'` 调. 跑一轮 agent turn: append user → runToolLoop → 持久化 →
 *   打印 final content. workingMessages 由 caller 持有 (startRepl 闭包), turn 跑完
 *   后 caller 用新 messages 覆盖.
 *
 *   Sprint 1a 修 P1: user 必须进 LLM.
 *   Sprint 1a 修 P2-A: 流式不再重复打印 final content.
 *   Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): 可选 compactionConfig —
 *   传时调 runToolLoopWithCompaction (入口测 token, 触发则 compact + 写 event),
 *   不传 = 走裸 runToolLoop (向后兼容, 单测 baseline 244 不变). summaryFn 内部
 *   用 client + 固定 prompt 模板生成, 跟 test 1c-revive-2-D-5 cluster 拍板一致.
 *
 * 拍板 (D-29.2):
 *   - 文件: `repl-agent-turn.ts` (kebab-case, 跟 `repl-confirm.ts` /
 *     `repl-signal-coordinator.ts` / `repl-session.ts` 同形态).
 *   - 公共 API 1:1 保: repl.ts 跟 `src/index.ts` re-export `runAgentTurn`, 11
 *     个参数顺序/类型/默认值全保. test/modes-followup.test.ts:18 caller import
 *     path 不变 (走 `../src/repl.js` re-export).
 *   - 行为 1:1: 函数体逐字迁移, 8 段流程 (persist user / build turnMessages /
 *     runToolLoop-or-WithCompaction / catch 4-branch / persist steps / update
 *     workingMessages / step summary / usage status) 1:1.
 *   - 红线 (D-19.6.1): catch 分支 signal.aborted 优先于 isToolLoopError
 *     (runToolLoop 内部 abort 时 throw Error('Tool loop aborted by caller'),
 *     顺序不能动).
 *
 * 拍板 (D-29.2 §out of scope):
 *   - 不动 startRepl 主循环 (L151-522) — 那是 5 红线密集区, 留给 D-29.3+.
 *   - 不动 runOneTurn (L121-146) — 单轮 chat 工具函数, 跟 runAgentTurn 职责
 *     互补不重叠, 跟 repl.ts 闭包耦合轻, 留 repl.ts 即可.
 *   - 不抽 startRepl 内 finish() / rl.on('line') / rl.on('close') — 留给 D-29.3+.
 */

import { t, type SessionEvent } from '@deepwhale/core';
import { ChatMessage, isLLMError, type LLMClient } from '@deepwhale/llm';
import {
  isToolLoopError,
  persistToolLoopSteps,
  runToolLoop,
  runToolLoopWithCompaction,
  type AgentCompactionConfig,
  type ToolLoopResult,
} from '../agent/index.js';
import { staticToolPolicy } from '../policy/static-rules.js';
import { createDefaultRegistry } from '../tools/registry.js';
import { formatError } from './repl-format-error.js';
import { makeLlmSummarizeFn } from './repl-compaction-summary.js';
import { appendStepSummary } from './repl-step-summary.js';
import { appendUsageStatus, type UsageEmaState } from './repl-session.js';
import type { SessionWriter } from '@deepwhale/core';
import type { ToolPolicy } from '../policy/types.js';
import type { SandboxRunner } from '../sandbox/types.js';
import type { SummarizeFn } from '@deepwhale/core';

/**
 * 跑一轮 agent turn: append user → runToolLoop → 持久化 → 打印 final content.
 *
 * workingMessages 由 caller 持有 (startRepl 闭包), turn 跑完后 caller 用新 messages 覆盖.
 *
 * Sprint 1a 修 P1: user 必须进 LLM. Sprint 1a 修 P2-A: 流式不再重复打印 final content.
 * Sprint 1c-revive-2-D-6 (review P1 修复, 2026-06-04): 可选 compactionConfig — 传
 * 时调 runToolLoopWithCompaction (入口测 token, 触发则 compact + 写 event),
 * 不传 = 走裸 runToolLoop (向后兼容, 单测 baseline 244 不变). summaryFn 内部
 * 用 client + 固定 prompt 模板生成, 跟 test 1c-revive-2-D-5 cluster 拍板一致.
 * 单测通过 export 暴露, 直接注入 mock LLMClient + WritableStream 验证行为.
 */
export async function runAgentTurn(
  client: LLMClient,
  userInput: string,
  workingMessages: ChatMessage[],
  writer: SessionWriter | null,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
  signal: AbortSignal,
  compactionConfig: AgentCompactionConfig | null = null,
  // Sprint 1c-revive-3-D-12 review P1 修复: startRepl 把 env 解析的 runner
  // 传进来, 工具注册表跟 env 状态对齐. 不传 = 用 LocalSandboxRunner (向后兼容).
  sandboxRunner?: SandboxRunner,
  // Sprint 1c-revive-3-D-13: 透传 yes 进 turn.
  yes?: boolean,
  // Sprint 1c-revive-3-D-15: 透传 policy 进 turn (REPL 注入 replPolicy; 单测传
  // staticToolPolicy 走 baseline). undefined = 默认 staticToolPolicy (向后兼容).
  policy?: ToolPolicy,
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
  // EMA state 透传 (闭包持有). 旧 caller 不传 = 默认 { sampleCount: 0 }, 行为兼容
  // (不显示 avg 段). REPL 路径必传, 跨 turn 累积.
  emaState?: UsageEmaState,
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

  // 2) 构造 turn 消息:历史 + 本轮 user. Sprint 1a 修 P1 — user 必须进 LLM.
  const turnMessages: ChatMessage[] = [...workingMessages, { role: 'user', content: userInput }];

  // 3) 调 tool loop. Sprint 1c-revive-2-D-6: 传 compactionConfig 时走
  //    runToolLoopWithCompaction (带入口 compaction + 写 compaction event),
  //    不传 = 裸 runToolLoop (向后兼容, baseline 244 不变).
  const summaryFn: SummarizeFn | null = compactionConfig
    ? makeLlmSummarizeFn(client, compactionConfig.protocol)
    : null;
  // 拍板 (D-15, 2026-06-05): REPL 注入 replPolicy; 显式传 policy 也用, 默认 staticToolPolicy.
  // 拍板红线 (D-13.5 P1 重排): --yes 永远先于 confirm, replPolicy.confirm 只在 yes=false 才被调.
  const resolvedPolicy: ToolPolicy = policy ?? staticToolPolicy;
  let result: ToolLoopResult;
  try {
    if (compactionConfig !== null && summaryFn !== null) {
      result = await runToolLoopWithCompaction(
        client,
        turnMessages,
        {
          registry: createDefaultRegistry({
            ...(sandboxRunner !== undefined ? { sandboxRunner } : {}),
          }),
          onChunk: (chunk) => {
            if (chunk.content) out.write(chunk.content);
          },
          signal,
          policy: resolvedPolicy,
          isInteractive: true, // REPL = 交互模式 (D-13 拍板)
          yes: yes ?? false,
          ...(writer ? { writer } : {}),
        },
        compactionConfig,
        summaryFn,
      );
    } else {
      result = await runToolLoop(client, turnMessages, {
        registry: createDefaultRegistry({
          ...(sandboxRunner !== undefined ? { sandboxRunner } : {}),
        }),
        onChunk: (chunk) => {
          if (chunk.content) out.write(chunk.content);
        },
        signal,
        policy: resolvedPolicy,
        isInteractive: true, // REPL = 交互模式 (D-13 拍板)
        yes: yes ?? false,
        ...(writer ? { writer } : {}),
      });
    }
  } catch (e) {
    // === Sprint 1c-revive-3-D-19.6.1 (2026-06-05): Q3 修法 — abort-aware 分支 ===
    // 拍板 (D-19.6.1, user review 2026-06-05 P2.1): D-19.6 P1 修法让 close 路径 abort
    // in-flight turn, runToolLoop 内部 throw "Tool loop aborted by caller", 老 catch
    // 走 cli.error.unknown ("Unexpected error: {0}") 污染 stderr 为 unexpected error.
    // 修法: 检测 signal.aborted 优先于 isToolLoopError/isLLMError, 走专门 i18n key
    // (cli.turn_aborted_shutdown). 文案 "no audit gap" 强调 user_denied 该落的都
    // 落了 (D-19.6 P1 dismiss+abort+pendingExit 链路已保审计). 不走 unexpected
    // 路径, stderr 不再被 intentional shutdown 污染.
    //
    // 顺序红线: signal.aborted 检查必须在 isToolLoopError 之前 — runToolLoop 内部
    // abort 时 throw Error('Tool loop aborted by caller'), 这 Error 满足 isToolLoopError
    // 的某些宽松判定 (e.g. 有 .message 但无 .steps) 是不稳的. signal.aborted 是
    // 最直接的真相, 优先.
    if (signal.aborted) {
      err.write(`${t('cli.turn_aborted_shutdown')}\n\n`);
    } else if (isToolLoopError(e)) {
      err.write(`${t('cli.tool_loop_limit', e.steps)}\n\n`);
    } else if (isLLMError(e)) {
      err.write(`${formatError(e)}\n\n`);
    } else {
      err.write(`${t('cli.error.unknown', String(e))}\n\n`);
    }
    return;
  }

  // 4) 流式已实时打印;非流式分支此处补打印 final content(给上层 caller 留 fallback).
  //    Sprint 1a REPL 总是传 onChunk 走流式,所以这里不再重复打印。

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

  // 7) Sprint 1b: Prefix-cache 可观测性 — 每 turn 打印一行 status 到 stderr
  // 风格: 分两行(跟 plan 拍板), 不污染 stdout 流式输出, 不打 prompt 前面
  // 字段: cache_hit_rate / cost_turn / prompt / completion, 多字段同值时去冗余(Hermes footer 教训)
  // Sprint 1c-revive-2-D-21.1 (2026-06-06, 修 cache 96%↔85% 跳变 footer 焦虑):
  // 加 EMA 滚动平均 5-turn 平滑, 显示 "cache: 90% (avg 85%)". per-turn 数字
  // 仍是真实值, avg 是过去 5 turn 平滑趋势. user 不会被单 turn 抖动骗.
  // === Sprint 1c-revive-3-D-29.1.2 (2026-06-07): EMPTY_EMA 内联, repl-session.ts 内私有 ===
  // 行为 1:1: 旧 EMPTY_EMA = { sampleCount: 0 }, 旧 caller 兜底 = 内联值保持.
  appendUsageStatus(result.final.usage, err, emaState ?? { sampleCount: 0 });
}
