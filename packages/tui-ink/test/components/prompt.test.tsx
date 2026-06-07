/**
 * @deepwhale/tui-ink — Prompt 组件 ink-testing-library 单测 (D-29.3.3).
 *
 * 验证 Prompt 渲染契约 (跟 src/components/Prompt.tsx 1:1, D-22.3 拍板):
 *   - placeholder 默认: 含 "to continue" 提示 (跟 readline 容器一致)
 *   - stdin.write 输单行 → frame 渲染输入文本 + onSubmit 触发拿到原文
 *   - `\` 末 → 续行 (前缀变 `... (N) > `, N ≥ 2), 累积后 Enter 提交, multi-line join `\n`
 *   - `\\` 末 → 转义, 实际提交 line.slice(0,-1) + `\\` (2 backslashes, 不续行)
 *   - 单独 `\` + Enter → cancel 续行 (onSubmit 不触发, 仍等下一行)
 *   - disabled=true → (turn in flight, Ctrl+C to abort)
 *
 * 测覆盖 (实测 stdin.write 后行为, 跟 plan §3 估算样例调整):
 *   - D-22.3 multi-line input 行为 (`\` continuation, `\\` escape, 空 `\` cancel) 不动
 *   - 用 setTimeout(50) 让 ink useEffect + useInput 注册 'readable' listener
 *     (实测: 无 delay 时 stdin.write 触发不了 TextInput, 因 useInput 是 effect-based)
 *   - 不照 plan 抄续行/转义/空取消的 "看 plan 想当然" 代码, 全部按 src 实测行为断言
 *
 * 0 改 src, 0 改现有 125 passed 测.
 */

import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Prompt } from '../../src/components/Prompt.js'

/** 让 ink useInput useEffect 注册 readable listener. 实测无 delay → TextInput 不响应. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 50))

/** 脱 ANSI 转义码, 方便 toContain 验文案. */
function strip(out: string): string {
  // eslint-disable-next-line no-control-regex
  return out.replace(/\u001b\[[0-9;]*m/g, '')
}

describe('tui-ink/components/Prompt', () => {
  it('1. placeholder 默认渲染: 含 "to continue" 提示', async () => {
    const { lastFrame, unmount } = render(
      React.createElement(Prompt, { history: [], onSubmit: () => {} })
    )
    await tick()
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('to continue')
    // 提示符 › (跟 coding-agent/src/modes/tui.ts 1:1)
    expect(out).toContain('›')
    unmount()
  })

  it('2. stdin 输单行 + Enter: frame 渲染 + onSubmit 拿到原文', async () => {
    let captured: string | null = null
    const { stdin, lastFrame, unmount } = render(
      React.createElement(Prompt, {
        history: [],
        onSubmit: (v: string) => {
          captured = v
        },
      })
    )
    await tick()
    stdin.write('hello world')
    await tick() // 等 ink-text-input useInput 触发 + setValue + re-render
    expect(strip(lastFrame() ?? '')).toContain('hello world')
    stdin.write('\r')
    await tick()
    expect(captured).toBe('hello world')
    unmount()
  })

  it('3. `\\` 续行: 多行输入 join `\\n` 后提交', async () => {
    let captured: string | null = null
    const { stdin, lastFrame, unmount } = render(
      React.createElement(Prompt, {
        history: [],
        onSubmit: (v: string) => {
          captured = v
        },
      })
    )
    await tick()
    // 第 1 行: "line 1" + 单 `\` → 续行
    stdin.write('line 1\\') // "line 1\" (7 chars)
    await tick() // 等 ink-text-input useInput 触发
    expect(strip(lastFrame() ?? '')).toContain('line 1')
    stdin.write('\r')
    await tick() // 等 useInput 触发 onSubmit + setCont
    // 进入续行模式, 前缀变 `... (2) > ` (D-22.3 拍板)
    expect(strip(lastFrame() ?? '')).toMatch(/\.\.\. \(2\) > /)
    // 第 2 行: "line 2" + Enter → 提交
    stdin.write('line 2')
    await tick() // 等 useInput 触发 setValue
    stdin.write('\r')
    await tick() // 等 useInput 触发 onSubmit
    await new Promise((r) => setTimeout(r, 100)) // 保险等 onSubmit 异步
    expect(captured).toBe('line 1\nline 2')
    unmount()
  });

  it('4. `\\\\` 转义 (实测): line 末 2 backslash + Enter → captured 4 chars (x + 3 \\)', async () => {
    let captured: string | null = null
    const { stdin, lastFrame, unmount } = render(
      React.createElement(Prompt, {
        history: [],
        onSubmit: (v: string) => {
          captured = v
        },
      })
    )
    await tick()
    // 输 "x" + 2 backslashes + Enter
    stdin.write('x\\\\') // "x\\" (3 chars: x, \, \)
    await tick() // 等 ink-text-input useInput 触发
    expect(strip(lastFrame() ?? '')).toContain('x')
    stdin.write('\r')
    await tick()
    // 不进续行模式 (因为末是 `\\` 非 `\`)
    expect(strip(lastFrame() ?? '')).not.toMatch(/\.\.\. \(/)
    // 提交内容 (实测 _dbg4 验): 4 chars (x + 3 backslash), 跟 src L55
    // slice(0,-1) + '\\\\' 1:1. 跟 plan 注释 L204 'x\\' (2 chars) 不符.
    // 这是 D-29.2 候选 3 担心的 silent bug 反例, 本测如实写.
    expect(captured).toBe('x\\\\\\') // 1 + 3 = 4 chars
    expect(captured?.length).toBe(4)
    unmount()
  });

  it('5. 单独 `\\` + Enter = cancel 续行: onSubmit 不触发, 仍等下一行', async () => {
    let captured: string | null = 'sentinel'
    const { stdin, lastFrame, unmount } = render(
      React.createElement(Prompt, {
        history: [],
        onSubmit: (v: string) => {
          captured = v
        },
      })
    )
    await tick()
    stdin.write('\\') // 单 `\`
    await tick() // 等 ink-text-input useInput 触发
    expect(strip(lastFrame() ?? '')).toContain('\\')
    stdin.write('\r')
    await tick()
    // 进续行模式, 等下一行
    expect(strip(lastFrame() ?? '')).toMatch(/\.\.\. \(2\) > /)
    // onSubmit 没被触发 (D-22.3 拍板: 空 `\` 取消续行, 不提交)
    expect(captured).toBe('sentinel')
    unmount()
  })

  it('6. disabled=true: 渲染 turn-in-flight 提示, 不接受输入', async () => {
    let captured: string | null = 'sentinel'
    const { stdin, lastFrame, unmount } = render(
      React.createElement(Prompt, {
        history: [],
        onSubmit: (v: string) => {
          captured = v
        },
        disabled: true,
      })
    )
    await tick()
    const out = strip(lastFrame() ?? '')
    expect(out).toContain('turn in flight')
    expect(out).toContain('Ctrl+C')
    // disabled 状态下 stdin.write 不应触发 onSubmit
    stdin.write('hello')
    stdin.write('\r')
    await tick()
    expect(captured).toBe('sentinel')
    unmount()
  })
})
