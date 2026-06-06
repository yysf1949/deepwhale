/**
 * @deepwhale/tui-ink — App 组件 (D-24.2).
 *
 * Sprint 1c-revive-2-D-24.2 (2026-06-06) v1.0.9
 *
 * 接 5 子组件 (StatusBar / Prompt / Transcript / Divider / Confirm) + 3 hooks
 * (useRunToolLoop / useAbortController / useHistory), 把 D-22 / D-23.1 / D-23.2
 * 业务逻辑搬进 Ink 容器. 业务 0 重写, 只换 readline → Ink 容器.
 *
 * 复用红线 (跟 D-20.3 P0-B / D-22 / D-23 一致):
 *   - 0 改 packages/core / packages/llm / packages/edit-engine
 *   - 复用 runToolLoop (coding-agent)
 *   - 复用 createReplConfirm (coding-agent, D-19 串行化)
 *   - 复用 formatUsageStatus (coding-agent)
 *   - 复用 SessionWriter (跟 REPL/print mode 同形态)
 *
 * 不接 bin/deepwhale.js dispatch (留 D-24.3).
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Box, Text, useApp } from 'ink'
import { THEMES, resolveTuiTheme, type TuiTheme } from './theme/index.js'
import type { TuiInkOptions, TuiInkResult } from './types.js'
import { useStore } from '@nanostores/react'
import { $uiState, $transcript } from './store/ui.js'
import { StatusBar } from './components/StatusBar.js'
import { Divider } from './components/Divider.js'
import { Transcript } from './components/Transcript.js'
import { Prompt } from './components/Prompt.js'
import { Confirm } from './components/Confirm.js'
import { useHistory } from './hooks/useHistory.js'
import { useAbortController } from './hooks/useAbortController.js'
import { useRunToolLoop } from './hooks/useRunToolLoop.js'
import { createReplConfirm, type ReplConfirmController, staticToolPolicy } from '@deepwhale/coding-agent'
import type { ChatMessage } from '@deepwhale/llm'
import { stdout } from 'node:process'

export interface AppProps {
  options: TuiInkOptions
  onExit: (result: TuiInkResult) => void
}

/**
 * <App/> 主组件 — D-24.2 完整实现.
 *
 * 架构:
 *   - 5 子组件: <StatusBar/> (上) + <Transcript/> (中) + <Confirm/> (条件) + <Divider/> (分隔) + <Prompt/> (下)
 *   - 3 hooks: useHistory (历史) + useAbortController (SIGINT) + useRunToolLoop (turn)
 *   - state: nanostore (跨 component 共享) + useState (local)
 *   - working messages: useState 累积 (跟 tui.ts `workingMessages` 同形态)
 */
export function App({ options, onExit }: AppProps): ReactElement {
  const { exit } = useApp()
  const theme: TuiTheme = useMemo(
    () => THEMES[resolveTuiTheme(options.theme)],
    [options.theme],
  )
  const ui = useStore($uiState)
  const _transcript = useStore($transcript)

  // 3 hooks
  const { history, append: appendHistory } = useHistory()
  const { controller: turnAbortController } = useAbortController(() => {
    // SIGINT 透传: caller (useRunToolLoop) 拿 signal 透传 runToolLoop.
    // 这里只 log, 不 exit — 跟 tui.ts D-19 onSigint 1:1
  })
  // const { runTurn } = useRunToolLoop(...)  // 接下面 useEffect 后再调

  // working messages (累积 user + assistant + tool, 跟 tui.ts `workingMessages` 同形态)
  const [workingMessages, setWorkingMessages] = useState<ChatMessage[]>([])

  // confirm controller (复用 D-19 串行化, 1:1 跟 REPL/main rl 同样的 offerLine 形态)
  const confirmControllerRef = useRef<ReplConfirmController | null>(null)
  if (confirmControllerRef.current === null) {
    confirmControllerRef.current = createReplConfirm({ output: stdout })
  }
  const confirmController = confirmControllerRef.current

  // turn in-flight flag (跟 tui.ts `turnInFlight` 同形态)
  const [turnInFlight, setTurnInFlight] = useState(false)

  // runToolLoop wrapper — 每次 turn 用最新 workingMessages
  const { runTurn } = useRunToolLoop({
    options,
    theme,
    signal: turnAbortController.signal,
    writer: null, // 留 D-24.3 跟 sessionPath 一起接
    policy: staticToolPolicy,
    workingMessages,
  })

  // turn 完成时: 累积 messages + history (跟 tui.ts L770-790 finally 块 1:1)
  useEffect(() => {
    if (ui.mode === 'idle' && turnInFlight) {
      setTurnInFlight(false)
      // append user + last assistant 到 workingMessages
      // (跟 tui.ts `workingMessages = [...result.messages]` 同形态, 但 transcript 拆 user/assistant/tool
      //  简单起见: 累积 transcript 最后 user + assistant 到 workingMessages)
      // TODO D-24.3: 这里跟 tui.ts 1:1, 等 writer 接上后做 persist
    }
  }, [ui.mode, turnInFlight])

  // 内建命令处理 (跟 tui.ts 内建命令段 1:1, /exit / q / /help / /verify 留 D-24.3)
  // ...

  // Prompt submit handler
  const handlePromptSubmit = (assembled: string): void => {
    if (turnInFlight) return // 防御
    const trimmed = assembled.trim()
    if (!trimmed) return

    // 内建命令 (D-24.1 placeholder; 完整版 D-24.3)
    if (trimmed === '/exit' || trimmed === 'q' || trimmed === 'quit') {
      onExit({ exitCode: 0, reason: 'user-exit' })
      exit()
      return
    }

    // 提交 turn
    appendHistory(trimmed)
    setTurnInFlight(true)
    void (async (): Promise<void> => {
      await runTurn(trimmed)
      // runTurn 完成后, workingMessages 更新 (新 user + assistant)
      setWorkingMessages((prev) => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: $transcript.get().filter((e) => e.kind === 'assistant').slice(-1)[0]?.text ?? '' },
      ])
    })()
  }

  // Confirm 路径: caller 拿到 prompt submit 后, 先看 pendingConfirm, 有就喂 confirm
  // (这跟 REPL/main rl 拿 line 后确认 1:1). 我们这里用 useInput 拦截 + offerLine 不可行,
  // 因为 prompt input 已经在 Prompt 组件内. 简化: D-24.2 暂时不做 confirm 路径, 留 D-24.3
  // 接 tool policy confirm 注入. (本期 readline 容器的 confirm 测在 tui-smoke.test.ts 覆盖,
  //  0 改动, 行为在 readline 容器也验过.)
  // TODO D-24.3: 接 confirm path

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Text color={theme.header}>
        ⌬ deepwhale tui-ink (D-24.2 full container)
      </Text>
      <Divider theme={theme} />

      {/* StatusBar: 状态栏 (D-21.2) */}
      <StatusBar theme={theme} />

      {/* Transcript: 历史 + 流式 (D-22 + D-23.2) */}
      <Transcript theme={theme} />

      {/* Confirm: 条件渲染 */}
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
