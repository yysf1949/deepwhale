/**
 * @deepwhale/tui-ink — UI state store.
 *
 * Sprint 1c-revive-2-D-24.2 (2026-06-06) v1.0.9
 *
 * 用 nanostores 维护 App 状态. 跟 Hermes ui-tui app/uiStore.js 同形态:
 *   - map: 全局 state (mode / usage / model / pendingConfirm)
 *   - atom: 累积 messages (transcript)
 *
 * 为啥不直接用 React useState:
 *   - 子组件在 App 树深处, 状态提升到 App 顶层 + props drilling 烦
 *   - 跟 Hermes 风格一致 (nanostores + useStore 是 Hermes ui-tui 主流)
 *   - 未来跨多 component 共享 (sprint 1.1 Plan mode 等)
 *
 * 业务逻辑 0 重写: 这是单纯的状态层, 不重写 turn 路径.
 */

import { atom, map } from 'nanostores'
import type { Usage } from '@deepwhale/llm'

/** TUI mode 状态机 (跟 D-20.3 P0-B 拍的 5 状态一致). */
export type Mode = 'idle' | 'streaming' | 'confirm' | 'tool' | 'error'

export interface PendingConfirm {
  /** prompt 文案 (含 `[y/N]: ` 后缀, caller 拼好) */
  prompt: string
  /** 工具名 (confirm 提示用, 跟 tui.ts L780-790 一致) */
  toolName: string
  /** 创建 confirm 时的 timestamp (超时检测用, 暂不实现) */
  ts: number
}

export interface UiState {
  mode: Mode
  /** turn usage object (StatusBar 调 formatUsageStatus 转 string), null = 不显示状态栏 */
  usage: Usage | null
  /** 当前模型显示名 (跟 formatTuiStatusBar L187-198 一致) */
  model: string
  /** in-flight 的 confirm (null = 无 pending). 跟 D-19 createReplConfirm pending 1:1 */
  pendingConfirm: PendingConfirm | null
  /** turn abort error (D-19 / D-20.6.4 abort 链), 给 <ErrorBar/> 用 (本期不实现) */
  lastError: string | null
}

export const $uiState = map<UiState>({
  mode: 'idle',
  usage: null,
  model: '',
  pendingConfirm: null,
  lastError: null,
})

/** transcript 累积 entry. 跟 tui.ts L755-770 tool call/result 1:1 */
export interface TranscriptEntry {
  kind: 'user' | 'assistant' | 'tool'
  text: string
  /** stream 模式下, assistant entry 的 text 持续 append (delta) */
  streaming?: boolean
  /** D-27 D3: reasoning_content 累积 (DeepSeek V4 thinking mode), 跟 text 分离, 走 <Thinking/> 折叠 */
  reasoning?: string
  /** tool entry 字段 */
  status?: 'success' | 'error'
  toolName?: string
  durationMs?: number
}

export const $transcript = atom<TranscriptEntry[]>([])

// ---- helpers (跟 D-22/D-23 store 操作 1:1) ----

/** append 一条新 entry (user / tool 一次性, assistant 起始). */
export function pushEntry(entry: TranscriptEntry): void {
  $transcript.set([...$transcript.get(), entry])
}

/** append delta 到 last assistant entry (D-23.2 onChunk 染色后增量). */
export function appendToLastAssistant(delta: string): void {
  const entries = $transcript.get()
  const last = entries[entries.length - 1]
  if (last && last.kind === 'assistant') {
    $transcript.set([...entries.slice(0, -1), { ...last, text: last.text + delta }])
  } else {
    // 无 last assistant → push 新 entry
    $transcript.set([...entries, { kind: 'assistant', text: delta }])
  }
}

/** 标记 last assistant entry streaming=false (turn 完成). */
export function sealLastAssistant(): void {
  const entries = $transcript.get()
  const last = entries[entries.length - 1]
  if (last && last.kind === 'assistant' && last.streaming) {
    $transcript.set([...entries.slice(0, -1), { ...last, streaming: false }])
  }
}

/**
 * D-27 D3: 增量累积 reasoning_content (DeepSeek V4 thinking mode).
 * 跟 appendToLastAssistant 1:1, 单独累积 reasoning 字段 (不跟 text 混合).
 * 走 <Thinking/> 组件折叠渲染, 跟 Hermes thinking.tsx 1:1.
 */
export function appendReasoningChunk(delta: string): void {
  const entries = $transcript.get()
  const last = entries[entries.length - 1]
  if (last && last.kind === 'assistant') {
    const newReasoning = (last.reasoning ?? '') + delta
    $transcript.set([...entries.slice(0, -1), { ...last, reasoning: newReasoning }])
  } else {
    // 无 last assistant → push 新 entry (跟 appendToLastAssistant 一致)
    $transcript.set([...entries, { kind: 'assistant', text: '', reasoning: delta }])
  }
}
