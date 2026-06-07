/**
 * @deepwhale/tui-ink — Divider 组件 ink-testing-library 单测 (D-29.3.2).
 *
 * 验证 Divider 渲染契约 (跟 src/components/Divider.tsx 1:1):
 *   - 默认 width=60 横线 (60x U+2500, D-21.2)
 *   - 前面 2 个 space prefix (跟 readline 容器 tui.ts 1:1)
 *   - 独占一行 (single line in frame)
 *
 * 最小组件, 2 it. 0 改 src, 0 改现有 125 passed 测.
 */

import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Divider } from '../../src/components/Divider.js'

describe('tui-ink/components/Divider', () => {
  it('1. 默认渲染 60 个 U+2500 横线 (D-21.2 契约)', () => {
    const { lastFrame, unmount } = render(React.createElement(Divider))
    const out = lastFrame()!
    // 60x ─ 至少 (D-21.2 横线长度契约)
    expect(out).toMatch(/─{60,}/)
    unmount()
  })

  it('2. 独占一行, 前面 2 空格 (跟 readline 容器 out.write 1:1)', () => {
    const { lastFrame, unmount } = render(React.createElement(Divider))
    const out = lastFrame()!
    // 一行 strip ANSI 后, 应是 "  " + "─"x60
    // eslint-disable-next-line no-control-regex
    const stripped = out.replace(/\u001b\[[0-9;]*m/g, '')
    expect(stripped).toBe('  ' + '─'.repeat(60))
    unmount()
  });
})
