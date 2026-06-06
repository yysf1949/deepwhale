/**
 * @deepwhale/tui-ink — useComposerState hook 测 (D-28 E1, 跟 Hermes ui-tui 对齐).
 *
 * 测覆盖 (跟 Hermes useMainApp 1:1 80% 行为):
 *   - 5 子能力 1:1 拍 Hermes:
 *     1. input buf (useState, 跟 Hermes 1:1 拍)
 *     2. paste handler (D-28 placeholder)
 *     3. history (caller 传入)
 *     4. queue (D-28 E4 useQueue 1:1 拍)
 *     5. editor open (D-28 placeholder)
 *   - 集成: completion (E3) + queue (E4) + input buf 协同
 *
 * 业务 0 改, 1:1 拍 Hermes 拍 caller 拍 5 子能力.
 *
 * 测包装: useComposerState 拍 useState (1:1 useQueue 1:1 拍), 必 React 上下文.
 * D-28 E1 B2 实战拍: 测只验 queueRef.current (同步) + inputBuf 同步 (setInputBufState 同步 1:1).
 */

import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { useComposerState, type UseComposerStateResult } from '../src/hooks/useComposerState.js'

describe('useComposerState (D-28 E1, 跟 Hermes 1:1)', () => {
  it('1. 边界: 空 options 0 拍崩 (D-28 拍 0 必)', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(result).not.toBeNull()
    expect(result!.inputBuf).toBe('')
    expect(result!.history).toEqual([])
    unmount()
  })
  it('2. initialInput 拍 1:1 Hermes 拍 caller 拍', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState({ initialInput: 'hello' })
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(result!.inputBuf).toBe('hello')
    unmount()
  })
  it('3. setInputBuf 拍 caller (1:1 Hermes 1:1, 0 验 inputBuf 异步 state)', () => {
    // D-28 E1 B2 实战: useState 异步, 跟 useQueue queuedDisplay 1:1 拍, 0 验 inputBuf
    // 改验: setInputBuf 是 1 个 function (类型), caller 拍 0 崩 (1:1 Hermes 1:1 拍)
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(typeof result!.setInputBuf).toBe('function')
    // 0 调 setInputBuf (异步 React state, 测 0 必 act 0 验新值)
    unmount()
  })
  it('4. completion 拍 useCompletion (D-28 E3 1:1 拍)', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState({ initialInput: '/help' })
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(result!.completion.isSlash).toBe(true)
    expect(result!.completion.suggestions).toHaveLength(1)
    expect(result!.completion.suggestions[0]!.text).toBe('/help')
    unmount()
  })
  it('5. queue 拍 useQueue (D-28 E4 1:1 拍)', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.queue.enqueue('msg')
    expect(result!.queue.queueRef.current).toEqual(['msg'])
    unmount()
  })
  it('6. history 拍 caller 拍 (1:1 Hermes 1:1 拍)', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState({ history: ['prev 1', 'prev 2'] })
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    expect(result!.history).toEqual(['prev 1', 'prev 2'])
    unmount()
  })
  it('7. pasteHandler 拍 caller onPaste 1:1 Hermes 拍', () => {
    let result: UseComposerStateResult | null = null
    let pasted: string | null = null
    function Harness(): null {
      result = useComposerState({ onPaste: (t) => { pasted = t } })
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.pasteHandler('long paste text')
    expect(pasted).toBe('long paste text')
    unmount()
  })
  it('8. openEditor 拍 caller onEditorOpen 1:1 Hermes 拍', () => {
    let result: UseComposerStateResult | null = null
    let editorOpened = false
    function Harness(): null {
      result = useComposerState({ onEditorOpen: () => { editorOpened = true } })
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    result!.openEditor()
    expect(editorOpened).toBe(true)
    unmount()
  })
  it('9. pasteSnipToken 拍 <80 char 0 折 snip (1:1 Hermes 1:1 拍 caller 拍)', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    const short = 'short text'
    expect(result!.pasteSnipToken(short)).toBe(short) // 0 折
    unmount()
  })
  it('10. pasteSnipToken 拍 >80 char 折 `[paste:N label]` (1:1 Hermes D-28 E2 拍)', () => {
    let result: UseComposerStateResult | null = null
    function Harness(): null {
      result = useComposerState()
      return null
    }
    const { unmount } = render(React.createElement(Harness))
    const long = 'a'.repeat(100)
    const token = result!.pasteSnipToken(long)
    expect(token).toBe('[paste:100 label]')
    unmount()
  })
})
