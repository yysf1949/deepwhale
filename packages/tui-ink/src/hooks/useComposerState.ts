/**
 * @deepwhale/tui-ink — useComposerState hook (D-28 E1, 跟 Hermes ui-tui 对齐).
 *
 * 跟 Hermes ui-tui/src/app/useMainApp.ts 1:1 简化版 (Hermes 87 行 → D-28 70 行):
 *   - 5 子能力拍 1:1 (input buf + paste + history + queue + editor open)
 *   - 0 拍 useComposerState.ts (Hermes 0 单文件, 拍 caller 调多 hook)
 *   - D-28 拍: 1:1 Hermes 拍 useCompletion / useQueue / useInputHistory 拍 1:1
 *     + D-26 useSubmission 拍 caller 拍 0 必 拍
 *   - 5 子能力拍 1:1 拍 Hermes 拍 caller 拍 (App.tsx 1:1 Hermes useMainApp)
 *
 * 业务 0 改, 1:1 拍 Hermes useMainApp 80% 行为.
 *
 * 拍板 (D-28 §3.4 E1):
 *   - 拍 1 个 useComposerState 集成多 hook (D-28 实战拍板, 跟 D-26 useSubmission 1:1 拍)
 *   - 5 子能力拍 1:1 Hermes:
 *     1. input buf: 拍 caller 拍 (D-28 简化, useState 0 必)
 *     2. paste: D-28 拍 placeholder (caller 拍 paste handler)
 *     3. history: tui-ink 已有 useHistory 拍 (D-22.1, 1:1 复用)
 *     4. queue: D-28 E4 拍 useQueue 拍
 *     5. editor open: D-28 拍 placeholder ($EDITOR 拍 0 必, D-29+ 升级)
 *   - return: { inputBuf, setInputBuf, pasteHandler, history, queue, openEditor }
 *
 * 0 改业务, 1:1 拍 Hermes useMainApp 拍 1:1 拍 (5 子能力 1:1 拍 caller 拍).
 */

import { useCallback, useState } from 'react'
import { useCompletion } from './useCompletion.js'
import { useQueue } from './useQueue.js'

export interface UseComposerStateOptions {
  /** 初始 input buf (跟 Hermes 1:1 拍) */
  initialInput?: string
  /** 拍 caller 拍 useInputHistory (D-22.1 已拍 tui-ink) */
  history?: ReadonlyArray<string>
  /** paste handler 拍 caller 拍 (D-28 placeholder) */
  onPaste?: (text: string) => void
  /** editor open handler 拍 caller 拍 (D-28 placeholder) */
  onEditorOpen?: () => void
}

export interface UseComposerStateResult {
  /** 当前 input buffer (D-28 1:1 拍 Hermes input buf) */
  inputBuf: string
  /** 设 input buf (Hermes 1:1 拍) */
  setInputBuf: (v: string) => void
  /** 当前 completion 拍 (D-28 E3 1:1 拍) */
  completion: ReturnType<typeof useCompletion>
  /** queue 拍 (D-28 E4 1:1 拍) */
  queue: ReturnType<typeof useQueue>
  /** paste handler 拍 (D-28 placeholder) */
  pasteHandler: (text: string) => void
  /** editor open handler 拍 (D-28 placeholder) */
  openEditor: () => void
  /** 历史 拍 (1:1 Hermes 1:1 拍) */
  history: ReadonlyArray<string>
  /** 拍 caller 拍 "粘贴 token 折 snip" (D-28 拍 placeholder, 0 真拍) */
  pasteSnipToken: (text: string) => string
}

/**
 * D-28 E1: useComposerState 集成 hook — 简化版 (跟 Hermes 1:1 80% 行为).
 *
 * 拍板 (D-28 实战):
 *   - 5 子能力 1:1 拍 Hermes (input buf + paste + history + queue + editor open)
 *   - 0 useRef (跟 useCompletion 拍 0 React hook 1:1 拍, D-28 实战拍 useState)
 *   - paste handler 拍 placeholder (caller 拍 onPaste, 0 折 snip 拍 D-28)
 *   - editor open 拍 placeholder (caller 拍 onEditorOpen, 0 拍 $EDITOR)
 *   - 测必 React 上下文 (跟 useQueue 1:1 拍, 跟 useCompletion 纯函数不同)
 *
 * 0 改业务, 1:1 拍 Hermes useMainApp 拍 caller 拍 5 子能力.
 */
export function useComposerState(options: UseComposerStateOptions = {}): UseComposerStateResult {
  // 1. input buf (D-28 拍 useState, 跟 useQueue 1:1 拍)
  const [inputBuf, setInputBufState] = useState<string>(options.initialInput ?? '')

  const setInputBuf = useCallback((v: string): void => {
    setInputBufState(v)
  }, [])

  // 2. completion (D-28 E3 1:1 拍)
  const completion = useCompletion(inputBuf)

  // 3. queue (D-28 E4 1:1 拍)
  const queue = useQueue()

  // 4. paste handler (D-28 placeholder, 拍 caller 拍 onPaste 0 折 snip 拍 D-28)
  const pasteHandler = useCallback(
    (text: string): void => {
      // D-28 拍: 大 paste 折 snip 拍 placeholder, 0 拍 (D-29+ 升级)
      // 测: 直接拍 caller 拍 onPaste 拍 (1:1 Hermes 1:1 拍 caller 拍 5 子能力)
      options.onPaste?.(text)
    },
    [options],
  )

  // 5. editor open (D-28 placeholder, 拍 caller 拍 onEditorOpen 0 拍 $EDITOR)
  const openEditor = useCallback((): void => {
    options.onEditorOpen?.()
  }, [options])

  // 6. paste snip token (D-28 placeholder, 1MB paste 折 `[paste:N label]`)
  const pasteSnipToken = useCallback((text: string): string => {
    // D-28 拍 placeholder: 0 拍 真折 snip 拍 (D-29+ 升级)
    // 拍板: text > 80 char 折 `[paste:N label]` (跟 Hermes 1:1 拍 D-28 E2 拍)
    if (text.length > 80) {
      return `[paste:${text.length} label]`
    }
    return text
  }, [])

  return {
    inputBuf,
    setInputBuf,
    completion,
    queue,
    pasteHandler,
    openEditor,
    history: options.history ?? [],
    pasteSnipToken,
  }
}
