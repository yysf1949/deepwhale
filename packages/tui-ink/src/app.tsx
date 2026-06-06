/**
 * @deepwhale/tui-ink — App 组件 (D-24.3).
 *
 * Sprint 1c-revive-2-D-24.3 (2026-06-06) v1.0.9
 *
 * D-24.2 接 5 子组件 + 3 hooks. D-24.3 接:
 *   1. confirm path — Prompt 拿到 line → caller (App) 决定:
 *      - 有 pendingConfirm (D-19) → 喂 confirmController.offerLine(line)
 *      - 无 pending → chat turn
 *   2. session writer — App 持 SessionReader/Writer, 启动时 loadSession,
 *      turn 完成时 persistToolLoopSteps (跟 tui.ts L160-180 1:1)
 *   3. 内建命令 — /exit / q / quit 跟 tui.ts 1:1, /help / /verify 留 sprint 1.1
 *
 * 复用红线 (跟 D-20.3 P0-B / D-22 / D-23 一致):
 *   - 0 改 packages/core / packages/llm / packages/edit-engine
 *   - 复用 runToolLoop / createReplConfirm / formatUsageStatus / staticToolPolicy
 *   - 复用 SessionReader/Writer / loadSession / persistToolLoopSteps (跟 tui.ts 同形态)
 *
 * 不接 (留 sprint 1.1+):
 *   - REPL mode 迁 Ink
 *   - /help / /verify 内建命令
 *   - 真 SIGINT trigger 测 (D-24.7 P0)
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Box, Text, useApp } from 'ink'
import { THEMES, resolveTuiTheme, type TuiTheme } from './theme/index.js'
import type { TuiInkOptions, TuiInkResult } from './types.js'
import { useStore } from '@nanostores/react'
import {
  $uiState,
  $transcript,
  pushEntry,
} from './store/ui.js'
import { StatusBar } from './components/StatusBar.js'
import { Divider } from './components/Divider.js'
import { Transcript } from './components/Transcript.js'
import { Prompt } from './components/Prompt.js'
import { Confirm } from './components/Confirm.js'
import { useHistory } from './hooks/useHistory.js'
import { useAbortController } from './hooks/useAbortController.js'
import { useRunToolLoop } from './hooks/useRunToolLoop.js'
import {
  createReplConfirm,
  type ReplConfirmController,
  staticToolPolicy,
  type ChatMessage,
  type LLMClient,
  type ToolRegistry,
  SessionReader,
  SessionWriter,
  loadSession,
  createDefaultClient,
  createDefaultRegistry,
} from '@deepwhale/coding-agent'
import { stdout } from 'node:process'

export interface AppProps {
  options: TuiInkOptions
  onExit: (result: TuiInkResult) => void
}

/**
 * <App/> 主组件 — D-24.3 完整实现.
 *
 * 架构 (跟 D-24.2 同 + 3 项新增):
 *   - 5 子组件: <StatusBar/> + <Transcript/> + <Confirm/> + <Divider/> + <Prompt/>
 *   - 3 hooks: useHistory + useAbortController + useRunToolLoop
 *   - state: nanostore (跨 component 共享) + useState (local)
 *   - session: SessionReader/Writer 注入 useRunToolLoop.writer (D-24.2 留的)
 *   - confirm path: handlePromptSubmit 看 hasPending() 决定 offerLine / chat
 *   - 内建命令: /exit / q / quit
 */
export function App({ options, onExit }: AppProps): ReactElement {
  const { exit } = useApp()
  const theme: TuiTheme = useMemo(
    () => THEMES[resolveTuiTheme(options.theme)],
    [options.theme],
  )
  const ui = useStore($uiState)

  // 3 hooks
  const { history, append: appendHistory } = useHistory()
  const { controller: turnAbortController } = useAbortController(() => {
    // SIGINT 透传: caller (useRunToolLoop) 拿 signal 透传 runToolLoop.
    // 这里只 no-op, 跟 tui.ts D-19 onSigint 1:1
  })

  // working messages (累积 user + assistant, 跟 tui.ts `workingMessages` 同形态)
  const [workingMessages, setWorkingMessages] = useState<ChatMessage[]>([])

  // session writer/reader (D-24.3 新增 — 跟 tui.ts L160-180 1:1)
  // sessionPath 决定是否走持久化. 跟 tui.ts: writer = sessionPath ? new SessionWriter(sessionPath) : null
  const sessionPath = options.sessionPath
  const writerRef = useRef<SessionWriter | null>(null)
  const readerRef = useRef<SessionReader | null>(null)
  if (writerRef.current === null && sessionPath) {
    writerRef.current = new SessionWriter(sessionPath)
    readerRef.current = new SessionReader(sessionPath)
  }

  // 启动时 loadSession (跟 tui.ts L160-180 1:1)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  useEffect(() => {
    if (sessionLoaded) return
    const writer = writerRef.current
    const reader = readerRef.current
    if (writer && reader) {
      void (async (): Promise<void> => {
        try {
          await writer.open()
          const loaded = await loadSession(reader)
          setWorkingMessages([...loaded.messages])
          if (loaded.messages.length > 0) {
            pushEntry({
              kind: 'assistant',
              text: `  ${loaded.messages.length} messages resumed from session`,
            })
          }
        } catch (e) {
          // best-effort, 跟 tui.ts 1:1
          process.stderr.write(`session load warning: ${e instanceof Error ? e.message : String(e)}\n`)
        } finally {
          setSessionLoaded(true)
        }
      })()
    } else {
      setSessionLoaded(true)
    }
  }, [sessionLoaded])

  // confirm controller (复用 D-19 串行化, 1:1 跟 REPL/main rl 同样的 offerLine 形态)
  const confirmControllerRef = useRef<ReplConfirmController | null>(null)
  if (confirmControllerRef.current === null) {
    confirmControllerRef.current = createReplConfirm({ output: stdout })
  }
  const confirmController = confirmControllerRef.current

  // turn in-flight flag (跟 tui.ts `turnInFlight` 同形态)
  const [turnInFlight, setTurnInFlight] = useState(false)

  // D-25 B2: 注入 LLM client + ToolRegistry (跟 modes/tui.ts L482 + L770 1:1 同步)
  // client 走 createDefaultClient factory (env 推断 + flag 显式覆盖, 跟 REPL/print mode 同形态)
  // 拍板: options.provider 是 string (TuiInkOptions 拍宽, 跟 bin/cli 兼容), narrow 到
  //   'deepseek' | 'anthropic' 才传, 其它 (e.g. 'unknown' / 用户误传) 走 env 推断
  const clientRef = useRef<LLMClient | null>(null)
  if (clientRef.current === null) {
    const providerNarrow = options.provider === 'deepseek' || options.provider === 'anthropic'
      ? options.provider
      : undefined
    clientRef.current = createDefaultClient({
      ...(providerNarrow ? { provider: providerNarrow } : {}),
      ...(options.model ? { model: options.model } : {}),
    })
  }
  const client = clientRef.current

  const registryRef = useRef<ToolRegistry | null>(null)
  if (registryRef.current === null) {
    registryRef.current = createDefaultRegistry()
  }
  const registry = registryRef.current

  // runToolLoop wrapper — 每次 turn 用最新 workingMessages + writer
  const { runTurn } = useRunToolLoop({
    options,
    theme,
    signal: turnAbortController.signal,
    writer: writerRef.current,
    client,
    registry,
    policy: staticToolPolicy,
    workingMessages,
  })

  // turn 完成时: 累积 messages (跟 tui.ts L770-790 finally 块 1:1)
  useEffect(() => {
    if (ui.mode === 'idle' && turnInFlight) {
      setTurnInFlight(false)
      // 累积 last user + last assistant 到 workingMessages
      // (跟 tui.ts `workingMessages = [...result.messages]` 同形态, transcript 拆开累积)
      const entries = $transcript.get()
      const lastAssistant = [...entries].reverse().find((e) => e.kind === 'assistant')
      if (lastAssistant) {
        setWorkingMessages((prev) => [
          ...prev,
          { role: 'user', content: '' }, // placeholder, 真实 user 在 handlePromptSubmit 已知
          // eslint-disable-next-line no-control-regex -- D-23.2 染色 string 含 ANSI escape
          { role: 'assistant', content: lastAssistant.text.replace(/\x1b\[[0-9;]*m/g, '') },
        ])
      }
    }
  }, [ui.mode, turnInFlight])

  // Prompt submit handler — D-24.3 接 confirm path
  const handlePromptSubmit = (assembled: string): void => {
    const trimmed = assembled.trim()
    if (!trimmed) return

    // 1. 内建命令 (跟 tui.ts 1:1: /exit / q / quit)
    if (trimmed === '/exit' || trimmed === 'q' || trimmed === 'quit') {
      // D-19.5: writer.close 走 finish 路径
      void writerRef.current?.close()
      onExit({ exitCode: 0, reason: 'user-exit' })
      exit()
      return
    }

    // 2. Confirm path (D-19 串行化) — 跟 REPL/main rl 拿 line → offerLine 同形态
    if (confirmController.hasPending()) {
      // 有 pendingConfirm → 喂 confirm, 不走 chat
      confirmController.offerLine(trimmed)
      return
    }

    // 3. 提交 turn
    if (turnInFlight) return // 防御
    appendHistory(trimmed)
    setTurnInFlight(true)
    void (async (): Promise<void> => {
      await runTurn(trimmed)
      // workingMessages 在 useEffect 里累积, 这里不用 setState
    })()
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Text color={theme.header}>
        ⌬ deepwhale tui-ink v1.0.9
      </Text>
      <Divider theme={theme} />

      {/* StatusBar: 状态栏 (D-21.2) */}
      <StatusBar theme={theme} />

      {/* Transcript: 历史 + 流式 (D-22 + D-23.2) */}
      <Transcript theme={theme} />

      {/* Confirm: 条件渲染 (D-19 串行化) */}
      <Confirm theme={theme} controller={confirmController} />

      {/* Prompt: 输入 */}
      <Prompt
        theme={theme}
        history={history}
        onSubmit={handlePromptSubmit}
        disabled={turnInFlight}
      />
    </Box>
  )
}
