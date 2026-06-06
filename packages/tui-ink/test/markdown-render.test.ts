/**
 * @deepwhale/tui-ink — markdown 引擎测 (D-27 D1, 跟 Hermes ui-tui markdown 对齐).
 *
 * 测覆盖 5 类基础 markdown (D-27 §3.3 D1 拍板):
 *   - fence (3 backtick + lang)
 *   - heading (hash 1-6 个)
 *   - list (unorder + order)
 *   - table (header divider rows)
 *   - inline (code bold italic strike link)
 *
 * 业务 0 重写, 1:1 拍 Hermes markdown.tsx 80% 行为.
 *
 * 拍板 (D-27 D1):
 *   - 测 ReactNode 数组长度, 0 测渲染像素 (跟 tui-ink 集成测同形态)
 *   - 测含 ANSI escape 文本 1:1 透传 (跟 D-23.2 highlightChunk 染色兼容)
 *   - 测空字符串/单行/多行/混合 5 类基础
 */

import { describe, it, expect } from 'vitest'
import { Box } from 'ink'
import React from 'react'
import { render } from 'ink-testing-library'
import { renderMarkdown } from '../src/markdown/render.jsx'
import { THEMES } from '../src/theme/index.js'

const theme = THEMES.default

/** 便利: 跑 renderMarkdown + 用 ink-testing-library 抓 output 文本. */
function renderToText(text: string): string {
  const nodes = renderMarkdown(text, theme)
  // ink-testing-library 4.0.0: render() + lastFrame()
  // 包一层 <Box> 接受任意 ReactNode children (跟 Hermes 1:1)
  const instance = render(React.createElement(Box, null, ...nodes))
  const frame = instance.lastFrame()
  instance.unmount()
  return frame
}

describe('markdown/render (D-27 D1)', () => {
  describe('fence (```lang ... ```)', () => {
    it('1a. 简单 code fence 完整框出', () => {
      const text = '```js\nconst x = 1\nconsole.log(x)\n```'
      const nodes = renderMarkdown(text, theme)
      // 期望 nodes 1 个 (fence 块) + 含 lang + body
      expect(nodes).toHaveLength(1)
      const out = renderToText(text)
      // 验证 fence 完整 (开闭都包含) + 块内含 code
      expect(out).toContain('const x = 1')
      expect(out).toContain('console.log(x)')
    })
    it('1b. 4-space indented body 兼容 GFM (跟 Hermes 1:1)', () => {
      const text = '```python\n    def foo():\n        pass\n```'
      const nodes = renderMarkdown(text, theme)
      expect(nodes).toHaveLength(1)
      const out = renderToText(text)
      expect(out).toContain('def foo')
    })
    it('1c. 多个 fence 块连排', () => {
      const text = '```js\n1\n```\n\n```py\n2\n```'
      const nodes = renderMarkdown(text, theme)
      expect(nodes.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('heading (# H1 ~ ###### H6)', () => {
    it('2a. H1 (# heading)', () => {
      const text = '# Hello'
      const nodes = renderMarkdown(text, theme)
      expect(nodes).toHaveLength(1)
      const out = renderToText(text)
      expect(out).toContain('# Hello')
    })
    it('2b. H6 (###### heading) 仍识别', () => {
      const text = '###### Deep heading'
      const out = renderToText(text)
      expect(out).toContain('###### Deep heading')
    })
    it('2c. 多个 heading 顺序排列', () => {
      const text = '# H1\n## H2\n### H3'
      const nodes = renderMarkdown(text, theme)
      expect(nodes).toHaveLength(3)
    })
  })

  describe('list (-/*/+ unordered + 1. ordered)', () => {
    it('3a. unordered list 用 bullet 渲染', () => {
      const text = '- item 1\n- item 2'
      const out = renderToText(text)
      expect(out).toContain('• item 1')
      expect(out).toContain('• item 2')
    })
    it('3b. * bullet 跟 - bullet 等价', () => {
      const out = renderToText('* a\n* b')
      expect(out).toContain('• a')
      expect(out).toContain('• b')
    })
    it('3c. ordered list 保留编号', () => {
      const text = '1. first\n2. second'
      const out = renderToText(text)
      expect(out).toContain('1. first')
      expect(out).toContain('2. second')
    })
  })

  describe('table (header | divider | rows)', () => {
    it('4a. 3 列 GFM table 渲染', () => {
      const text = '| name | age | city |\n| --- | --- | --- |\n| alice | 30 | sf |\n| bob | 25 | ny |'
      const nodes = renderMarkdown(text, theme)
      expect(nodes).toHaveLength(1)
      const out = renderToText(text)
      expect(out).toContain('alice')
      expect(out).toContain('bob')
      expect(out).toContain('sf')
      expect(out).toContain('ny')
    })
    it('4b. 单行 table 错误 (不够 rows) 0 解析, 走普通 line 路径', () => {
      const text = '| a | b |\n| --- |'
      const nodes = renderMarkdown(text, theme)
      // 单行 table 不够 (header 1 + divider 1 = 2, 0 rows), 拍"0 走 table 路径"
      // 实际: tryParseTable 看 line1 是 divider, 但 row 缺失直接 break → 走普通 line
      // 期望 nodes 数量: 2 (header 1 + divider 1) 走普通 line
      expect(nodes.length).toBeGreaterThan(1)
    })
  })

  describe('inline (`code` / **bold** / *italic* / ~~strike~~ / [text](url))', () => {
    it('5a. inline code 渲染', () => {
      const text = 'use `const x = 1` here'
      const out = renderToText(text)
      expect(out).toContain('`const x = 1`')
    })
    it('5b. **bold** 渲染', () => {
      const text = 'this is **bold** text'
      const out = renderToText(text)
      expect(out).toContain('bold')
    })
    it('5c. *italic* 渲染', () => {
      const text = 'this is *italic* text'
      const out = renderToText(text)
      expect(out).toContain('italic')
    })
    it('5d. ~~strike~~ 渲染', () => {
      const text = 'this is ~~strike~~ text'
      const out = renderToText(text)
      expect(out).toContain('strike')
    })
    it('5e. [text](url) link 渲染', () => {
      const text = 'visit [hermes](https://hermes.ai) for more'
      const out = renderToText(text)
      expect(out).toContain('hermes')
      expect(out).toContain('https://hermes.ai')
    })
  })

  describe('blockquote + horizontal rule', () => {
    it('6a. blockquote 用 │ 字符渲染', () => {
      const text = '> important note here'
      const out = renderToText(text)
      expect(out).toContain('│ important note here')
    })
    it('6b. horizontal rule ---', () => {
      const text = '---'
      const out = renderToText(text)
      // 期望印 ─ 字符 (Hermes 1:1)
      expect(out).toContain('─')
    })
  })

  describe('混合 5 类基础 + 边界', () => {
    it('7a. 5 类基础混合 1 个 input', () => {
      // D-27 B1 实战撞: ink-testing-library 4.0.0 lastFrame() 截断到 80 char 默认 width.
      // 多内容放一行会拼一起, 测期望 'Title' 找不到 (被截 'Titl').
      // 修: 每类基础放独立行, 让 Box column 渲染多行, lastFrame() 能完整捕到.
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
      const nodes = renderMarkdown(text, theme)
      expect(nodes.length).toBeGreaterThanOrEqual(5)
      const out = renderToText(text)
      // 5 类基础 1:1 出现 (D-27 B1 实战: 5 类基础混合测, 全部能找到)
      expect(out).toContain('Title')
      expect(out).toContain('bold')
      expect(out).toContain('list item')
      expect(out).toContain('const x = 1')
      expect(out).toContain('col1')
    })
    it('7b. 空字符串 返 1 个空 line node (不崩)', () => {
      const nodes = renderMarkdown('', theme)
      // 1 个空行 (split('\n') 返 [''] → 1 个 ' ' Text)
      expect(nodes).toHaveLength(1)
    })
    it('7c. 含 ANSI escape 文本 0 解析 (跟 D-23.2 highlight 兼容)', () => {
      // D-23.2 highlightChunk 可能给 assistant text 加 ANSI 染色,
      // D-27 markdown 0 处理 ANSI (职责分离, 跟 Hermes 1:1 拍)
      const text = 'this is \x1b[32mgreen\x1b[0m text with **bold**'
      const out = renderToText(text)
      // ANSI 透传, bold 仍能识别
      expect(out).toContain('green')
      expect(out).toContain('bold')
    })
  })

  describe('MEDIA / audio 协议 (D-27 D4, 跟 Hermes 1:1)', () => {
    it('8a. MEDIA:/path/to/image 1:1 印 [image: path]', () => {
      // D-27 D4 拍: TUI 0 真实图, 跟 Hermes 1:1 印 [image: path]
      const out = renderToText('MEDIA:/path/to/image.png')
      expect(out).toContain('[image: /path/to/image.png]')
    })
    it('8b. MEDIA 接受单/双/反引号包裹 (跟 Hermes 1:1)', () => {
      // 跟 Hermes MEDIA_LINE_RE 1:1 拍
      expect(renderToText('MEDIA: /a.png')).toContain('[image: /a.png]')
      expect(renderToText('`MEDIA: /b.png`')).toContain('[image: /b.png]')
      expect(renderToText('"MEDIA: /c.png"')).toContain('[image: /c.png]')
      expect(renderToText("'MEDIA: /d.png'")).toContain('[image: /d.png]')
    })
    it('8c. [[audio_as_voice]] 1:1 印 🔊 audio (TTS D-28+ 升级)', () => {
      // D-27 D4 拍: TUI 0 调 mmx-cli TTS (D-28+ 升级), 1:1 印 🔊 占位
      const out = renderToText('[[audio_as_voice]]')
      expect(out).toContain('🔊')
      expect(out).toContain('audio')
    })
    it('8d. MEDIA 跟 markdown 5 类基础 0 冲突 (混合测)', () => {
      const text = '# Title\n\nMEDIA: /x.png\n\n**bold**'
      const out = renderToText(text)
      expect(out).toContain('Title')
      expect(out).toContain('[image: /x.png]')
      expect(out).toContain('bold')
    })
  })
})
