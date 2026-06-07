/**
 * @deepwhale/tui-ink — Confirm 组件 ink-testing-library 单测 (D-29.3.4).
 *
 * 验证 Confirm 渲染契约 (跟 src/components/Confirm.tsx 1:1):
 *   - 无 pendingConfirm → 返 null (conditional 渲染)
 *   - 有 pendingConfirm → 渲染 '  ? ' + pendingConfirm.prompt + '  y/N: '
 *   - controller.hasPending() → true 时加 '(waiting for input)'
 *   - 0 改 src, 0 改现有 125 passed 测
 *
 * 4 it: 无 pending 不渲染 + 有 pending 渲染完整 + hasPending=true 加 (waiting) + prompt 字段透传.
 * 跟 transcript-markdown.test.tsx 风格一致: render + lastFrame + toContain.
 *
 * 拍板 (实测 2026-06-07 _dbg4 验): PendingConfirm 字段是 prompt/toolName/ts
 * (不是 plan 估算的 tool/reason), prompt 字段由 caller 拼好 (含 [y/N]: 后缀),
 * Confirm 只渲染不处理.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import type { ReplConfirmController } from '@deepwhale/coding-agent'
import { Confirm } from '../../src/components/Confirm.js'
import { $uiState, type PendingConfirm, type UiState } from '../../src/store/ui.js'

/** Mock controller: only hasPending() 跟 Confirm 实际调用. */
function makeMockController(hasPending: boolean): ReplConfirmController {
  return {
    hasPending: (): boolean => hasPending,
  } as unknown as ReplConfirmController
}

function setUi(patch: Partial<UiState>): void {
  $uiState.set({ ...$uiState.get(), ...patch })
}

describe('tui-ink/components/Confirm', () => {
  beforeEach(() => {
    setUi({ mode: 'idle', usage: null, model: '', pendingConfirm: null, lastError: null })
  })

  it('1. 无 pendingConfirm: 返 null, frame 无 y/N:', () => {
    const controller = makeMockController(false)
    const { lastFrame, unmount } = render(
      React.createElement(Confirm, { controller })
    )
    const out = lastFrame() ?? ''
    // null 组件不渲染任何字符, frame 是空字符串
    expect(out).not.toContain('y/N')
    expect(out).not.toContain('?')
    unmount()
  })

  it('2. 有 pendingConfirm: 渲染 prompt + y/N:', () => {
    const pc: PendingConfirm = {
      prompt: 'Allow bash? (overwrite foo.txt) [y/N]: ',
      toolName: 'bash',
      ts: Date.now(),
    }
    setUi({ pendingConfirm: pc })
    const controller = makeMockController(false)
    const { lastFrame, unmount } = render(
      React.createElement(Confirm, { controller })
    )
    const out = lastFrame() ?? ''
    // prompt 字段透传
    expect(out).toContain('Allow bash?')
    expect(out).toContain('overwrite foo.txt')
    expect(out).toContain('[y/N]')
    unmount()
  })

  it('3. controller.hasPending()=true: 加 "(waiting for input)"', () => {
    const pc: PendingConfirm = {
      prompt: 'Allow write? [y/N]: ',
      toolName: 'write',
      ts: Date.now(),
    }
    setUi({ pendingConfirm: pc })
    const controller = makeMockController(true)
    const { lastFrame, unmount } = render(
      React.createElement(Confirm, { controller })
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Allow write?')
    expect(out).toContain('(waiting for input)')
    unmount()
  })

  it('4. prompt 字段透传, 含 caller 拼的 [y/N]: 后缀 (跟 tui.ts 1:1)', () => {
    // caller (App) 拼好 prompt 含 ' [y/N]: ' 后缀, Confirm 透传不重处理
    const pc: PendingConfirm = {
      prompt: 'Allow unknown_tool? (custom reason here) [y/N]: ',
      toolName: 'unknown_tool',
      ts: Date.now(),
    }
    setUi({ pendingConfirm: pc })
    const controller = makeMockController(false)
    const { lastFrame, unmount } = render(
      React.createElement(Confirm, { controller })
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Allow unknown_tool?')
    expect(out).toContain('custom reason here')
    expect(out).toContain('[y/N]:')
    // Confirm 不处理 toolName 截断 (caller 决定), 透传 caller 拼好的 prompt
    expect(out).toContain('unknown_tool')
    unmount()
  })
})
