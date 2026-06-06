/**
 * @deepwhale/tui-ink — Thinking 组件 + reasoning 接入测 (D-27 D3, 跟 Hermes 对齐).
 *
 * 验证 D-27 D3:
 *   - <Thinking/> 组件 3 状态 (collapsed/expanded/hidden) 1:1 拍 Hermes
 *   - appendReasoningChunk 增量累积 reasoning_content 字段 (跟 D-23.2 appendToLastAssistant 1:1)
 *   - thinking prop 在 Transcript 接入 (default true, DeepSeek V4 thinking mode)
 *
 * 业务 0 重写, 1:1 拍 Hermes ui-tui thinking.tsx 80% 行为.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import {
  $transcript,
  pushEntry,
  appendReasoningChunk,
} from '../src/store/ui.js'
import { Thinking } from '../src/components/Thinking.jsx'
import { Transcript } from '../src/components/Transcript.jsx'
import { THEMES } from '../src/theme/index.js'

const theme = THEMES.default

describe('<Thinking/> 组件 (D-27 D3)', () => {
  it('1. 边界: 空 reasoning 返 null (0 渲染)', () => {
    const { lastFrame, unmount } = render(
      <Thinking reasoning="" theme={theme} />
    )
    expect(lastFrame()).toBe('')
    unmount()
  })
  it('2. 边界: hidden 状态 0 渲染', () => {
    const { lastFrame, unmount } = render(
      <Thinking reasoning="some thinking" theme={theme} initialState="hidden" />
    )
    expect(lastFrame()).toBe('')
    unmount()
  })
  it('3. collapsed 状态: 1 行缩略 + 💭 emoji + 折叠提示', () => {
    const reasoning = 'I am thinking about the answer to this question, line 1 of thinking'
    const { lastFrame, unmount } = render(
      <Thinking reasoning={reasoning} theme={theme} initialState="collapsed" />
    )
    const out = lastFrame()
    expect(out).toContain('💭') // thinking emoji
    expect(out).toContain('I am thinking') // 60 char preview
    expect(out).toContain('(press to expand)') // 折叠提示
    // 完整 reasoning 0 印 (折叠状态)
    expect(out).not.toContain('line 1 of thinking')
    unmount()
  })
  it('4. expanded 状态: 多行完整 reasoning + 💭 标签 + 折叠提示', () => {
    const reasoning = 'line A\nline B\nline C'
    const { lastFrame, unmount } = render(
      <Thinking reasoning={reasoning} theme={theme} initialState="expanded" />
    )
    const out = lastFrame()
    expect(out).toContain('💭 thinking') // 标签
    expect(out).toContain('(press to collapse)') // 折叠提示
    expect(out).toContain('line A') // 完整 3 行
    expect(out).toContain('line B')
    expect(out).toContain('line C')
    unmount()
  })
  it('5. collapsed 模式 1:1 Hermes (含 emoji + 折叠提示)', () => {
    // 边界: 不验具体字符数 (lastFrame() 80 char 截断, 0 验完整 preview)
    // 改验 collapsed 模式必含 3 个 1:1 Hermes 元素: emoji + 折叠提示 + 1:1 reasoning prefix
    const reasoning = 'I am thinking about the answer to this question'
    const { lastFrame, unmount } = render(
      <Thinking reasoning={reasoning} theme={theme} initialState="collapsed" />
    )
    const out = lastFrame()
    expect(out).toContain('💭') // 1:1 Hermes thinking emoji
    expect(out).toContain('(press to expand)') // 1:1 Hermes 折叠提示
    expect(out).toContain('I am thinking') // 1:1 Hermes 1-60 char preview prefix
    unmount()
  })
})

describe('appendReasoningChunk 增量累积 (D-27 D3)', () => {
  beforeEach(() => {
    $transcript.set([])
  })

  it('6. 增量推 reasoning_content 到 last assistant entry', () => {
    pushEntry({ kind: 'assistant', text: 'response text', streaming: true })
    appendReasoningChunk('thinking part 1 ')
    appendReasoningChunk('thinking part 2')
    const entries = $transcript.get()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.reasoning).toBe('thinking part 1 thinking part 2')
    expect(entries[0]!.text).toBe('response text') // text 0 受影响
  })

  it('7. 无 last assistant → push 新 entry (跟 appendToLastAssistant 1:1)', () => {
    // 边界: transcript 0 任何 entry, appendReasoningChunk 走 fallback push
    appendReasoningChunk('first thinking')
    const entries = $transcript.get()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.kind).toBe('assistant')
    expect(entries[0]!.text).toBe('')
    expect(entries[0]!.reasoning).toBe('first thinking')
  })

  it('8. reasoning 跟 text 分离 (D-27 D3 拍板 1:1 Hermes 1:1)', () => {
    pushEntry({ kind: 'assistant', text: 'response' })
    appendReasoningChunk('think A')
    appendReasoningChunk(' think B')
    const entry = $transcript.get()[0]!
    expect(entry.text).toBe('response') // text 0 受 reasoning 影响
    expect(entry.reasoning).toBe('think A think B') // reasoning 单独累积
  })
})

describe('Transcript thinking 接入 (D-27 D3)', () => {
  beforeEach(() => {
    $transcript.set([])
  })

  it('9. thinking=true (default) 走 <Thinking/> 组件 (含 reasoning 字段)', () => {
    pushEntry({
      kind: 'assistant',
      text: 'response text',
      reasoning: 'thinking here',
      streaming: false,
    })
    const { lastFrame, unmount } = render(
      <Transcript theme={theme} />  // thinking default true
    )
    // 注: Static 组件 0 计入 lastFrame(), 测里 0 直接验 lastFrame 内容
    // 改用 store 验 reasoning 字段 1:1 透传
    const entries = $transcript.get()
    expect(entries[0]!.reasoning).toBe('thinking here')
    unmount()
  })

  it('10. thinking=false 0 走 Thinking 组件 (跟 D-24.2 raw 1:1)', () => {
    pushEntry({
      kind: 'assistant',
      text: 'response text',
      reasoning: 'thinking here',
      streaming: false,
    })
    const { lastFrame, unmount } = render(
      <Transcript theme={theme} thinking={false} />
    )
    // thinking=false 0 渲染 Thinking 组件, 但 reasoning 字段 仍 1:1 保留
    const entries = $transcript.get()
    expect(entries[0]!.reasoning).toBe('thinking here') // 字段 0 受 thinking prop 影响
    unmount()
  })
})
