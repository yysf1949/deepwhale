/**
 * @deepwhale/tui-ink — App 烟雾测试 (D-24.2).
 *
 * 5 个核心单测 (跟 plan 2026-06-06-D-24-2-impl.md §7 一致):
 *   1. render → 退出 (Ctrl+C 透传)            useAbortController + useInput
 *   2. theme 切换 (default → solarized → monochrome)  resolveTuiTheme + THEMES lookup
 *   3. highlight 工具白名单                     highlightChunk (D-23.2 搬后 smoke)
 *   4. history append + load                    tuiHistoryAppend/Load (D-22.1 搬后 smoke)
 *   5. transcript append 顺序                   $transcript 累积, 3 entry 顺序对
 *
 * 不测 (留现有 tui-smoke.test.ts 0 改动):
 *   - multi-line `\` 续行 (ink-text-input 自带行为)
 *   - 真 SIGINT (vitest 不是 TTY)
 *   - 真 runToolLoop 调用 (集成测试, 留 D-24.4+)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render } from 'ink-testing-library'
import React from 'react'

import { App } from '../src/app.js'
import {
  $transcript,
  pushEntry,
  appendToLastAssistant,
  sealLastAssistant,
} from '../src/store/ui.js'
import { resolveTuiTheme, THEMES } from '../src/theme/index.js'
import { highlightChunk } from '../src/highlight/chunk.js'
import {
  tuiHistoryLoad,
  tuiHistoryAppend,
  tuiHistoryPath,
  tuiHistoryTruncate,
  TUI_HISTORY_MAX,
} from '../src/history/index.js'

// ---- Test 1: render + Ctrl+C 透传 ----
describe('App render', () => {
  it('1. render → exit (smoke)', () => {
    // vitest 不是 TTY, runTuiInkMode 早返 'not-tty', 这里直接挂 <App/>
    // 验 Ink render 链路 + 立即 unmount 不 crash
    const app = render(React.createElement(App, {
      options: {},
      onExit: () => {},
    }))
    // 立即 unmount (D-24.2 smoke, 不等 user input)
    app.unmount()
    // 没异常 = pass
    expect(true).toBe(true)
  })
})

// ---- Test 2: theme 切换 ----
describe('resolveTuiTheme', () => {
  beforeEach(() => {
    delete process.env.DEEPWHALE_TUI_THEME
  })
  it('2a. arg > env > default', () => {
    process.env.DEEPWHALE_TUI_THEME = 'monochrome'
    expect(resolveTuiTheme('solarized')).toBe('solarized')
    // 无参时拿 env, env 是 monochrome → monochrome (不是 default)
    expect(resolveTuiTheme()).toBe('monochrome')
    // 清掉 env → 无参回退 default
    delete process.env.DEEPWHALE_TUI_THEME
    expect(resolveTuiTheme()).toBe('default')
  })
  it('2b. invalid → default + warning', () => {
    const result = resolveTuiTheme('bogus-theme')
    expect(result).toBe('default')
  })
  it('2c. THEMES 3 preset 都有 7 role', () => {
    for (const name of ['default', 'solarized', 'monochrome'] as const) {
      const t = THEMES[name]
      expect(t.header).toBeTruthy()
      expect(t.model).toBeTruthy()
      expect(t.divider).toBeTruthy()
      expect(t.prompt).toBeTruthy()
      expect(t.error).toBeTruthy()
      expect(t.success).toBeTruthy()
      expect(t.toolName).toBeTruthy()
    }
  })
})

// ---- Test 3: highlight 工具白名单 ----
describe('highlightChunk', () => {
  it('3a. tool name 染色 (forceColor=true)', () => {
    const out = highlightChunk('Use BashTool to run ls', THEMES.default, true)
    // 染色后含 ANSI 转义码 (非空 + 比原文长, 因 escape)
    expect(out).toContain('BashTool')
    expect(out.length).toBeGreaterThan('Use BashTool to run ls'.length)
  })
  it('3b. number 染色', () => {
    const out = highlightChunk('total 42 items', THEMES.default, true)
    expect(out).toContain('42')
    expect(out.length).toBeGreaterThan('total 42 items'.length)
  })
  it('3c. path 染色', () => {
    const out = highlightChunk('see ./src/index.ts', THEMES.default, true)
    expect(out).toContain('./src/index.ts')
    expect(out.length).toBeGreaterThan('see ./src/index.ts'.length)
  })
  it('3d. forceColor=false 返原文', () => {
    const text = 'Use BashTool to run ls total 42'
    expect(highlightChunk(text, THEMES.default, false)).toBe(text)
  })
  it('3e. 空字符串返空', () => {
    expect(highlightChunk('', THEMES.default, true)).toBe('')
  })
})

// ---- Test 4: history append + load ----
describe('tuiHistory', () => {
  let tmpHome: string
  beforeEach(() => {
    // 用 tmp HOME 隔离 (避免污染用户 ~/.deepwhale/tui-history)
    tmpHome = mkdtempSync(join(tmpdir(), 'tui-ink-test-'))
    process.env.HOME = tmpHome
    process.env.USERPROFILE = tmpHome
    // D-25 A1: 测 DEEPWHALE_HOME 优先级时必清, 避免污染
    delete process.env.DEEPWHALE_HOME
  })
  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
    delete process.env.DEEPWHALE_HOME
  })
  it('4a. empty load 返 []', () => {
    expect(tuiHistoryLoad()).toEqual([])
  })
  it('4b. append + load 顺序对 (最新在末尾)', () => {
    tuiHistoryAppend('first line')
    tuiHistoryAppend('second line')
    tuiHistoryAppend('third line')
    expect(tuiHistoryLoad()).toEqual(['first line', 'second line', 'third line'])
  })
  it('4c. 空 line 不 append', () => {
    tuiHistoryAppend('')
    tuiHistoryAppend('   ')
    expect(tuiHistoryLoad()).toEqual([])
  })
  it('4d. path 是 ~/.deepwhale/tui-history', () => {
    expect(tuiHistoryPath()).toContain('.deepwhale')
    expect(tuiHistoryPath()).toContain('tui-history')
  })
  it('4e. truncate LRU', () => {
    const lines = Array.from({ length: 1500 }, (_, i) => `line ${i}`)
    const truncated = tuiHistoryTruncate(lines)
    expect(truncated.length).toBe(TUI_HISTORY_MAX) // 1000
    // 1500 - 1000 = 500, 截断后保留最后 1000 条, 即 line 500..1499
    expect(truncated[0]).toBe('line 500')
    expect(truncated[999]).toBe('line 1499')
  })
  // D-25 A1 (F4): 3 路径优先级 + Windows USERPROFILE 探测
  it('4f. homeOverride 优先于 env (D-25 A1)', () => {
    const overrideHome = mkdtempSync(join(tmpdir(), 'override-'))
    try {
      process.env.DEEPWHALE_HOME = mkdtempSync(join(tmpdir(), 'env-'))
      tuiHistoryAppend('via-override', overrideHome)
      // override home 应有 1 条
      expect(tuiHistoryLoad(overrideHome)).toEqual(['via-override'])
      // env home 仍 0 条 (被 override 跳过)
      expect(tuiHistoryLoad(process.env.DEEPWHALE_HOME)).toEqual([])
    } finally {
      rmSync(overrideHome, { recursive: true, force: true })
      rmSync(process.env.DEEPWHALE_HOME!, { recursive: true, force: true })
    }
  })
  it('4g. DEEPWHALE_HOME env 优先于 HOME/USERPROFILE (D-25 A1)', () => {
    const envHome = mkdtempSync(join(tmpdir(), 'env-home-'))
    try {
      process.env.DEEPWHALE_HOME = envHome
      tuiHistoryAppend('via-env')
      // env home 应有 1 条
      expect(tuiHistoryLoad(envHome)).toEqual(['via-env'])
      // tmpHome (HOME+USERPROFILE) 仍 0 条
      expect(tuiHistoryLoad(tmpHome)).toEqual([])
    } finally {
      rmSync(envHome, { recursive: true, force: true })
    }
  })
  it('4h. Windows: USERPROFILE 优先, HOME fallback (D-25 A1)', () => {
    // 模拟 Windows: USERPROFILE 跟 HOME 不一致, USERPROFILE 应胜出
    const winHome = mkdtempSync(join(tmpdir(), 'win-home-'))
    const unixHome = mkdtempSync(join(tmpdir(), 'unix-home-'))
    try {
      process.env.USERPROFILE = winHome
      process.env.HOME = unixHome
      delete process.env.DEEPWHALE_HOME
      tuiHistoryAppend('windows-style')
      // 应该是 winHome 收到 (USERPROFILE 优先)
      expect(tuiHistoryLoad(winHome)).toEqual(['windows-style'])
      expect(tuiHistoryLoad(unixHome)).toEqual([])
    } finally {
      rmSync(winHome, { recursive: true, force: true })
      rmSync(unixHome, { recursive: true, force: true })
    }
  })
})

// ---- Test 5: transcript 顺序 ----
describe('$transcript', () => {
  beforeEach(() => {
    $transcript.set([])
  })
  it('5a. push 3 entries 顺序对', () => {
    pushEntry({ kind: 'user', text: 'hello' })
    pushEntry({ kind: 'assistant', text: 'hi', streaming: true })
    pushEntry({ kind: 'tool', text: '✓ (10ms)', toolName: 'BashTool', status: 'success', durationMs: 10 })
    const entries = $transcript.get()
    expect(entries).toHaveLength(3)
    expect(entries[0].kind).toBe('user')
    expect(entries[1].kind).toBe('assistant')
    expect(entries[2].kind).toBe('tool')
  })
  it('5b. appendToLastAssistant 增量追加', () => {
    pushEntry({ kind: 'assistant', text: 'a', streaming: true })
    appendToLastAssistant('b')
    appendToLastAssistant('c')
    const entries = $transcript.get()
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('abc')
  })
  it('5c. sealLastAssistant 标记 streaming=false', () => {
    pushEntry({ kind: 'assistant', text: 'done', streaming: true })
    sealLastAssistant()
    expect($transcript.get()[0].streaming).toBe(false)
  })
  it('5d. 末尾不是 assistant 时 appendToLastAssistant 自动 push', () => {
    pushEntry({ kind: 'tool', text: '✓' })
    appendToLastAssistant('new text')
    const entries = $transcript.get()
    expect(entries).toHaveLength(2)
    expect(entries[1].kind).toBe('assistant')
    expect(entries[1].text).toBe('new text')
  })
})
