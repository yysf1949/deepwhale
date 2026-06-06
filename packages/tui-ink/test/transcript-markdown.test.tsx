/**
 * @deepwhale/tui-ink — Markdown 组件测 (D-27 D2, 跟 Hermes 对齐).
 *
 * 验证 <Markdown/> 组件 5 类基础 markdown 1:1 渲染 (跟 markdown/render.tsx 1:1).
 *
 * 业务 0 重写, 1:1 拍 Hermes ui-tui Markdown 组件 markdown 行为.
 *
 * 注: Transcript 组件 markdown 接入拍"opt-in", 默认 raw (跟 D-24.2 1:1).
 * Transcript 集成测 0 加 (跟现有 21 smoke 测 0 冲突, 跟 ship-quality-checks §7a 0 破坏).
 */

import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Markdown } from '../src/components/Markdown.jsx'
import { THEMES } from '../src/theme/index.js'

const theme = THEMES.default

describe('<Markdown/> 组件 (D-27 D2)', () => {
  it('1. fence 渲染 (跟 markdown/render.tsx 1:1)', () => {
    const text = '```js\nconst x = 1\n```'
    const { lastFrame, unmount } = render(
      <Markdown text={text} theme={theme} />
    )
    const out = lastFrame()
    expect(out).toContain('const x = 1')
    unmount()
  })

  it('2. heading 渲染', () => {
    const { lastFrame, unmount } = render(
      <Markdown text="# Hello" theme={theme} />
    )
    const out = lastFrame()
    expect(out).toContain('Hello')
    unmount()
  })

  it('3. list 渲染', () => {
    const text = '- item 1\n- item 2'
    const { lastFrame, unmount } = render(
      <Markdown text={text} theme={theme} />
    )
    const out = lastFrame()
    expect(out).toContain('• item 1')
    expect(out).toContain('• item 2')
    unmount()
  })

  it('4. table 渲染', () => {
    const text = '| col1 | col2 |\n| --- | --- |\n| a | b |'
    const { lastFrame, unmount } = render(
      <Markdown text={text} theme={theme} />
    )
    const out = lastFrame()
    expect(out).toContain('col1')
    expect(out).toContain('a')
    unmount()
  })

  it('5. inline prop 走 inline 渲染 (整段 1 个 Text 节点)', () => {
    const text = 'plain text with `code`'
    const { lastFrame, unmount } = render(
      <Markdown text={text} theme={theme} inline={true} />
    )
    const out = lastFrame()
    expect(out).toContain('plain text')
    expect(out).toContain('code')
    unmount()
  })

  it('6. block 模式 (default) 走 column 渲染', () => {
    const text = '```js\nconst x = 1\n```'
    const { lastFrame, unmount } = render(
      <Markdown text={text} theme={theme} />
    )
    const out = lastFrame()
    // block 模式印多行 (fence border)
    expect(out.split('\n').length).toBeGreaterThan(1)
    unmount()
  })

  it('7. 5 类基础混合 1 个 input (跟 D-27 D1 测 7a 1:1)', () => {
    const text = [
      '# Title',
      '',
      '**bold** `code`',
      '',
      '- list item',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      '| col1 | col2 |',
      '| --- | --- |',
      '| a | b |',
    ].join('\n')
    const { lastFrame, unmount } = render(
      <Markdown text={text} theme={theme} />
    )
    const out = lastFrame()
    expect(out).toContain('Title')
    expect(out).toContain('bold')
    expect(out).toContain('list item')
    expect(out).toContain('const x = 1')
    expect(out).toContain('col1')
    unmount()
  })
})

