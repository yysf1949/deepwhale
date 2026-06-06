/** @deepwhale/tui-ink — App 组件 (D-24.3 + D-26 C4/C5, 跟 Hermes 对齐).
 *
 * Sprint 1c-revive-2-D-24.3 (2026-06-06) v1.0.9:
 *   - 5 子组件 + 3 hooks (useHistory + useAbortController + useRunToolLoop)
 *   - confirm path: handlePromptSubmit 看 hasPending() 决定 offerLine / chat
 *   - session writer/reader: 启动 loadSession, turn 完成 persist
 *   - 内建命令: /exit / q / quit (跟 tui.ts 1:1)
 *
 * Sprint 1c-revive-2-D-25 B2 (2026-06-06) v1.0.10:
 *   - useRunToolLoop 接 client + registry 注入 (修 F2 useRunToolLoop 3 参签名错)
 *   - root build 串 tui-ink (F1 验)
 *
 * Sprint 1c-revive-2-D-26 C4/C5 (2026-06-07) v1.0.11:
 *   - useSubmission hook 抽 input 路由 (slash vs chat), 跟 Hermes useSubmission 1:1
 *   - 9 命令 走 slash registry (D-26 C2/C3), 0 字符串硬编码
 *   - 内建命令 (/exit /q/quit 等) 0 走 App.tsx, 走 slash registry
 *   - App.tsx 减重: 60+ 行 (line 195-224 删除, useSubmission 替代)
 *
 * 复用红线 (跟 D-20.3 P0-B / D-22 / D-23 / D-25 一致):
 *   - 0 改 packages/core / packages/llm / packages/edit-engine
 *   - 复用 runToolLoop / createReplConfirm / formatUsageStatus / staticToolPolicy
 *   - 复用 SessionReader/Writer / loadSession / persistToolLoopSteps (跟 tui.ts 同形态)
 *
 * 不接 (留 sprint 1.1+):
 *   - REPL mode 迁 Ink
 *   - 真 SIGINT trigger 测 (D-24.7 P0)
 *   - useInputHandlers (D-26 C4 拍 defer, D-28+ 拍)
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
import { useSubmission } from './hooks/useSubmission.js'
import { type SlashContext } from './commands/index.js'
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
 * <App/> 主组件 — D-24.3 + D-25 B2 + D-26 C4/C5 完整实现.
 *
 * 架构 (跟 D-24.2 同 + 多项新增):
 *   - 5 子组件: <StatusBar/> + <Transcript/> + <Confirm/> + <Divider/> + <Prompt/>
 *   - 5 hooks: useHistory + useAbortController + useRunToolLoop + useSubmission
 *   - state: nanostore (跨 component 共享) + useState (local)
 *   - session: SessionReader/Writer 注入 useRunToolLoop.writer
 *   - confirm path: useSubmission 看 hasPending() 决定 offerLine / chat
 *   - slash commands: useSubmission 走 slash registry (D-26 C2/C3)
 */
export function App({ options, onExit }: AppProps): ReactElement {
  const { exit } = useApp()
  const theme: TuiTheme = useMemo(
    () => THEMES[resolveTuiTheme(options.theme)],
    [options.theme],
  )
  const ui = useStore($uiState)

  // 4 hooks
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

  // D-26 C5: modelName 走 useState (D-26 C3 /model 拍 setModel 真的切)
  // 修前: modelName 走 options.model ?? client.model, 不响应 /model slash
  // 修后: useState 初值 options.model ?? client.model ?? 'model', setModel 改
  const [modelName, setModelName] = useState<string>(
    options.model ?? client.model ?? 'model'
  )

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

  // D-26 C5: SlashContext 构造 (供 useSubmission 路由)
  // 业务 0 改, 1:1 拍 Hermes SlashRunCtx (简化版, 0 gateway RPC)
  const slashContext: SlashContext = useMemo(() => ({
    theme,
    ui: $uiState.get(), // snapshot (每次 submit 拿最新, 见 D-29+ 优化)
    transcript: $transcript.get(),
    model: modelName,
    sessionPath,
    pushEntry,
    clearTranscript: () => { $transcript.set([]) },
    setModel: (model) => { setModelName(model) },
    exit: (result) => {
      // D-19.5: writer.close 走 finish 路径 (跟 D-24.3 /exit 1:1)
      void writerRef.current?.close()
      onExit(result ?? { exitCode: 0, reason: 'user-exit' })
      exit()
    },
  }), [theme, modelName, sessionPath, onExit, exit])

  // D-26 C4: useSubmission hook — 抽 input 路由 (slash vs chat)
  // 修前: handlePromptSubmit 60+ 行 (内建命令字符串硬编码 + confirm + chat)
  // 修后: useSubmission submit() 调 cmd.run(arg, slashContext) (slash) 或 onChat (chat)
  const { submit } = useSubmission({
    slashContext,
    onChat: (prompt) => {
      // 1. Confirm path (D-19 串行化) — 跟 useSubmission 拍板前一致
      if (confirmController.hasPending()) {
        confirmController.offerLine(prompt)
        return
      }
      // 2. 提交 turn
      if (turnInFlight) return // 防御
      appendHistory(prompt)
      setTurnInFlight(true)
      void (async (): Promise<void> => {
        await runTurn(prompt)
        // workingMessages 在 useEffect 里累积, 这里不用 setState
      })()
    },
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header — D-28 ship: bump v1.0.11 → v1.0.12 */}
      <Text color={theme.header}>
        ⌬ deepwhale tui-ink v1.0.12
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
        onSubmit={submit}
        disabled={turnInFlight}
      />
    </Box>
  )
}
