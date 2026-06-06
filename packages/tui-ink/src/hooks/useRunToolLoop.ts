/**
 * @deepwhale/tui-ink — useRunToolLoop hook (D-24.2 + D-25 B2).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts line 600-770 turn 主循环 1:1 同步.
 * 业务逻辑 0 重写: 调 coding-agent 导出的 `runToolLoop`, 把 onChunk / step / usage
 * 推到 store + transcript.
 *
 * D-25 B2 (2026-06-06) — 修 F2 (useRunToolLoop 调错 3 参签名):
 *   - 修前: runToolLoop(turnMessages, options)  (传 messages 当 client, TS2345 错)
 *   - 修后: runToolLoop(client, turnMessages, options) (3 参签名跟 tool-loop.ts 1:1)
 *   - client 来自: App 用 createDefaultClient({provider, model}) factory 注入
 *   - registry 来自: App 用 createDefaultRegistry() 注入
 *   - 跟 modes/tui.ts L482 + L770 1:1 同步 (legacy fallback 也修)
 *
 * 复用红线 (跟 D-20.3 P0-B 一致):
 *   - 不绕过 ToolPolicy (默认 staticToolPolicy, 跟 readline 容器同形态)
 *   - 不绕过 SessionWriter (D-19.5 finish 路径)
 *   - 复用 createReplConfirm 注入 policy.confirm (D-19 串行化, 跟 readline 容器同形态)
 *
 * 不做 (defer):
 *   - 真 LLM cache 命中验证 (sprint 2)
 *   - 真 SIGINT 透传到 runToolLoop 的覆盖测 (D-24.7 P0)
 */

import { useCallback } from 'react'
import {
  runToolLoop,
  persistToolLoopSteps,
  staticToolPolicy,
  type ToolPolicy,
  type ToolRegistry,
} from '@deepwhale/coding-agent'
import type { LLMClient } from '@deepwhale/coding-agent'
import { highlightChunk } from '../highlight/chunk.js'
import { pushEntry, appendToLastAssistant, sealLastAssistant, $uiState } from '../store/ui.js'
import type { TuiTheme } from '../theme/index.js'
import type { TuiInkOptions } from '../types.js'
import type { ChatMessage } from '@deepwhale/coding-agent'
import type { SessionWriter } from '@deepwhale/coding-agent'

export interface UseRunToolLoopArgs {
  options: TuiInkOptions
  theme: TuiTheme
  signal: AbortSignal
  writer: SessionWriter | null
  /** D-25 B2: 注入 LLM 客户端 (来自 createDefaultClient factory, App 容器初始化). */
  client: LLMClient
  /** D-25 B2: 注入 ToolRegistry (来自 createDefaultRegistry(), App 容器初始化). */
  registry: ToolRegistry
  policy?: ToolPolicy
  /** working messages (loaded session + 累积 user/assistant/tool steps). 跟 tui.ts `workingMessages` 同形态. */
  workingMessages: ChatMessage[]
}

export interface UseRunToolLoopResult {
  /** 跑一轮 turn (跟 tui.ts runTuiMode 内的 rl.on('line') 异步 handler 1:1) */
  runTurn: (userPrompt: string) => Promise<void>
}

export function useRunToolLoop(args: UseRunToolLoopArgs): UseRunToolLoopResult {
  const runTurn = useCallback(
    async (userPrompt: string): Promise<void> => {
      const { options, theme, signal, writer, client, registry, workingMessages } = args
      const modelName = options.model ?? client.model ?? 'model'

      // 1. push user entry
      pushEntry({ kind: 'user', text: userPrompt })
      $uiState.setKey('mode', 'streaming')
      $uiState.setKey('model', modelName)

      // 2. push 新 assistant entry (streaming=true, 后续 onChunk append delta)
      pushEntry({ kind: 'assistant', text: '', streaming: true })

      // 3. 调 runToolLoop
      const resolvedPolicy = args.policy ?? staticToolPolicy
      const turnMessages: ChatMessage[] = [
        ...workingMessages,
        { role: 'user', content: userPrompt },
      ]

      try {
        // D-25 B2: runToolLoop(client, messages, options) 3 参签名
        const result = await runToolLoop(client, turnMessages, {
          registry,
          onChunk: (chunk: { content?: string }) => {
            if (chunk.content) {
              // D-23.2: 染色后增量推 (跟 tui.ts L645 1:1)
              const colored = highlightChunk(chunk.content, theme, true)
              appendToLastAssistant(colored)
            }
          },
          maxSteps: options.maxSteps ?? 5,
          policy: resolvedPolicy,
          isInteractive: true, // TUI = 交互
          yes: options.yes ?? false,
          signal,
          writer,
        })

        // 4. tool call/result entry (跟 tui.ts L755-770 1:1)
        for (const step of result.steps) {
          if (step.kind === 'tool') {
            const status = step.result.success ? '✓' : '✗'
            pushEntry({
              kind: 'tool',
              text: `${status} (${step.duration_ms}ms)`,
              toolName: step.tool_call.name,
              status: step.result.success ? 'success' : 'error',
              durationMs: step.duration_ms,
            })
          }
        }

        // 5. seal last assistant (turn 完成)
        sealLastAssistant()

        // 6. usage 推 store (StatusBar 会 re-render)
        $uiState.setKey('usage', result.final.usage ?? null)

        // 7. 持久化 (跟 tui.ts L770-780 1:1)
        if (writer) {
          try {
            await persistToolLoopSteps(writer, result.steps)
          } catch {
            /* best-effort, 跟 tui.ts 一致 */
          }
        }
      } catch (e) {
        // 异常: 标记 last assistant seal, 推 error 到 store
        sealLastAssistant()
        $uiState.setKey('mode', 'error')
        $uiState.setKey('lastError', e instanceof Error ? e.message : String(e))
        pushEntry({
          kind: 'assistant',
          text: `\n[error] ${e instanceof Error ? e.message : String(e)}`,
        })
      } finally {
        // 跟 tui.ts L790 finally 1:1: 恢复正常 mode (除了 error 状态, 留给 caller 处理)
        if ($uiState.get().mode !== 'error') {
          $uiState.setKey('mode', 'idle')
        }
      }
    },
    [args],
  )

  return { runTurn }
}
