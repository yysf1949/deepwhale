/**
 * @deepwhale/tui-ink — useRunToolLoop hook (D-24.2).
 *
 * 跟 packages/coding-agent/src/modes/tui.ts line 600-770 turn 主循环 1:1 同步.
 * 业务逻辑 0 重写: 调 coding-agent 导出的 `runToolLoop`, 把 onChunk / step / usage
 * 推到 store + transcript.
 *
 * 复用红线 (跟 D-20.3 P0-B 一致):
 *   - 不绕过 ToolPolicy (默认 staticToolPolicy, 跟 readline 容器同形态)
 *   - 不绕过 SessionWriter (D-19.5 finish 路径)
 *   - 复用 createReplConfirm 注入 policy.confirm (D-19 串行化, 跟 readline 容器同形态)
 *
 * 不做 (defer):
 *   - 真 LLM cache 命中验证 (sprint 2)
 *   - 集成测试 (留 D-24.4+)
 *   - 真 SIGINT 透传到 runToolLoop 的覆盖测 (D-24.7 P0)
 */

import { useCallback } from 'react'
import { runToolLoop, persistToolLoopSteps, staticToolPolicy, type ToolPolicy } from '@deepwhale/coding-agent'
import { highlightChunk } from '../highlight/chunk.js'
import { pushEntry, appendToLastAssistant, sealLastAssistant, $uiState } from '../store/ui.js'
import type { TuiTheme } from '../theme/index.js'
import type { TuiInkOptions } from '../types.js'
import type { ChatMessage } from '@deepwhale/llm'
import type { SessionWriter } from '@deepwhale/core'

export interface UseRunToolLoopArgs {
  options: TuiInkOptions
  theme: TuiTheme
  signal: AbortSignal
  writer: SessionWriter | null
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
      const { options, theme, signal, writer, workingMessages } = args
      const modelName = options.model ?? 'model'

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
        const result = await runToolLoop(turnMessages, {
          onChunk: (chunk) => {
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
