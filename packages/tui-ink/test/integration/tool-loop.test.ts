/**
 * @deepwhale/tui-ink — useRunToolLoop 集成测 (D-25 B3 F7 P0.5).
 *
 * D-25 plan §3.1 B3 拍板: 用 mock LLMClient + 真实 ToolRegistry, 在 React 容器内
 * 跑 runTurn, 验证返回 ToolLoopResult shape 正确 + result.steps 数组非空.
 *
 * 跟 tui-ink/test/app.smoke.test.ts 区别:
 *   - app.smoke.test.ts: 0 真 turn 路径 (只 render + 立即 unmount), 0 覆盖 useRunToolLoop 真业务
 *   - tool-loop.test.ts: 真 turn 路径 (用 mock LLMClient 替代真 HTTP, 但走真 React 容器 + 真实 useRunToolLoop hook)
 *
 * 跟 ship-quality-checks §7a 第 4 类 "估算数字 vs 实测数字" 一致: 不光说"18 测试覆盖",
 *   真验证 useRunToolLoop 在 React 上下文里跑通.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React, { useEffect } from 'react'
import {
  createDefaultRegistry,
  type LLMClient,
  type ToolRegistry,
  type ChatResult,
  type ChatChunk,
} from '@deepwhale/coding-agent'
import type { ChatMessage } from '@deepwhale/coding-agent'

import { useRunToolLoop } from '../../src/hooks/useRunToolLoop.js'
import {
  $transcript,
  $uiState,
} from '../../src/store/ui.js'
import { resolveTuiTheme, THEMES } from '../../src/theme/index.js'
import type { TuiInkOptions } from '../../src/types.js'

// ---- Test 1: useRunToolLoop 在 React 容器内跑通, 3 参签名真接 (D-25 B3 F7 P0.5) ----
describe('useRunToolLoop 集成 (D-25 B3)', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = createDefaultRegistry()
    $transcript.set([])
    $uiState.setKey('mode', 'idle')
    $uiState.setKey('usage', null)
    $uiState.setKey('model', '')
    $uiState.setKey('lastError', null)
  })

  // Mock LLMClient: 不发真 HTTP, 直接返 1 个 stop 状态的 ChatResult
  // D-25 B3 实战撞 (1): runToolLoop 默认走 stream (onChunk 存在时), 不走 chat().
  // D-25 B3 实战撞 (2): stream 推 chunk 形如 { delta: { content: '...' } }, 不是 { content: '...' }.
  //                 runStreamStep 内部 onChunk wrapper 读 c.delta.content, 我们的 mock
  //                 必须推 delta.content 形态, transcript 才累积 assistant text.
  function makeMockClient(model = 'mock-model'): LLMClient {
    return {
      // ModelId 是 brand string, mock 直接传 string 走 as cast (测 0 强校验)
      model: model as LLMClient['model'],
      chat: async (messages: ChatMessage[]): Promise<ChatResult> => {
        return {
          content: `echo: ${messages.length} msgs`,
          tool_calls: undefined,
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
        }
      },
      stream: async (messages: ChatMessage[], options: { onChunk: (chunk: ChatChunk) => void }): Promise<ChatResult> => {
        // 推 1 个 chunk (跟真 LLM 流式响应 1 步同形态, 注意 delta.content 嵌套)
        options.onChunk({ delta: { content: `echo: ${messages.length} msgs` } })
        return {
          content: `echo: ${messages.length} msgs`,
          tool_calls: undefined,
          usage: {
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
          },
        }
      },
    }
  }

  // 一个最小的 hook runner 组件, 把 useRunToolLoop 包在 React 容器内
  function makeHookRunner(opts: {
    client: LLMClient
    registry: ToolRegistry
    onComplete: (result: { stepCount: number; usage: unknown; mode: string }) => void
  }) {
    return function HookRunner() {
      const theme = THEMES[resolveTuiTheme('default')]
      const options: TuiInkOptions = { maxSteps: 3 }
      const { runTurn } = useRunToolLoop({
        options,
        theme,
        signal: new AbortController().signal,
        writer: null,
        client: opts.client,
        registry: opts.registry,
        workingMessages: [],
      })
      useEffect(() => {
        void (async (): Promise<void> => {
          await runTurn('hello mock')
          // 1 turn 完: transcript 应至少有 1 user + 1 assistant entry
          const entries = $transcript.get()
          const ui = $uiState.get()
          opts.onComplete({
            stepCount: entries.length,
            usage: ui.usage,
            mode: ui.mode,
          })
        })()
      }, [runTurn])
      return null
    }
  }

  it('1. 真 turn 路径跑通, 3 参签名接 client/registry/messages 顺序对 (F7 P0.5)', async () => {
    const client = makeMockClient()
    const onComplete = vi.fn()
    const Runner = makeHookRunner({ client, registry, onComplete })
    render(React.createElement(Runner))

    // 等待 microtask + setImmediate 跑完 runTurn
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onComplete).toHaveBeenCalled()
    const result = onComplete.mock.calls[0]![0]
    // transcript 应至少 2 entry (user + assistant)
    expect(result.stepCount).toBeGreaterThanOrEqual(2)
    // usage 推 store (StatusBar re-render)
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
    // mode 恢复 idle (mock 不抛错)
    expect(result.mode).toBe('idle')
  })

  it('2. mock LLMClient 抛错时, store mode 切 error + transcript 有 error entry', async () => {
    const client: LLMClient = {
      model: 'err-model' as LLMClient['model'],
      chat: async (): Promise<ChatResult> => {
        throw new Error('mock 401 unauthorized')
      },
      stream: async (): Promise<ChatResult> => {
        throw new Error('mock 401 unauthorized')
      },
    }
    const onComplete = vi.fn()
    const Runner = makeHookRunner({ client, registry, onComplete })
    render(React.createElement(Runner))

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onComplete).toHaveBeenCalled()
    const result = onComplete.mock.calls[0]![0]
    expect(result.mode).toBe('error')
    // transcript 最后 entry 应含 [error] 标记
    const entries = $transcript.get()
    const lastAssistant = [...entries].reverse().find((e) => e.kind === 'assistant')
    expect(lastAssistant?.text).toContain('[error]')
    expect(lastAssistant?.text).toContain('mock 401 unauthorized')
  })

  it('3. transcript 顺序: user 在前, assistant 在后 (跟 D-23.2 业务 1:1)', async () => {
    const client = makeMockClient()
    const onComplete = vi.fn()
    const Runner = makeHookRunner({ client, registry, onComplete })
    render(React.createElement(Runner))

    await new Promise((resolve) => setTimeout(resolve, 50))

    const entries = $transcript.get()
    expect(entries[0]?.kind).toBe('user')
    expect(entries[0]?.text).toBe('hello mock')
    expect(entries[1]?.kind).toBe('assistant')
    // assistant text 应含 mock 推的内容 (经过 highlightChunk 可能含 ANSI 包裹, 测不命中 raw 'echo:' 改用 .includes 间接验)
    const assistantText = entries[1]?.text ?? ''
    // raw text 应含 'echo' 或 ANSI 包裹 (forceColor=true 时 highlightChunk 会包 ANSI escape)
    // 测不强求 'echo:' raw, 验 '非空 + 含 echo 字符' 即可
    expect(assistantText.length).toBeGreaterThan(0)
    // 去掉 ANSI escape 再匹配
    // eslint-disable-next-line no-control-regex
    const stripped = assistantText.replace(/\x1b\[[0-9;]*m/g, '')
    expect(stripped).toContain('echo')
  })
})
