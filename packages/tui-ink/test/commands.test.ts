/**
 * @deepwhale/tui-ink — slash command 测 (D-26 C2 + C3, 跟 Hermes 对齐).
 *
 * 11 测覆盖 9 命令 + registry 索引:
 *   - 1. SLASH_COMMANDS 9 条 (跟 D-26 §3.2 拍板 1:1)
 *   - 2. findSlashCommand 别名解析 (e/q/quit 走 exit, mem 走 heapdump)
 *   - 3. isSlashCommand: / 开头 true, 普通 input false
 *   - 4. /help 印 9 命令列表
 *   - 5. /exit /q /quit 调 ctx.exit({exitCode:0, reason:user-exit}) 1:1
 *   - 6. /clear 调 ctx.clearTranscript() 一次 + push 提示
 *   - 7. /status 印 model + mode + session + usage + transcript 数
 *   - 8-10. /model 切 model + provider
 *   - 11. /heapdump 印 process.memoryUsage() 5 字段
 *
 * 业务 0 重写, 1:1 拍 Hermes ui-tui/src/app/slash/registry + commands/* 行为.
 *
 * D-26 B2 实战撞: mock state 用对象引用, 不**用 let 闭包** (return snapshot 错位)
 * -- 用 overrides 注入 pushEntry/clearTranscript/setModel/exit, 测里通过同一个引用验
 */

import { describe, it, expect } from 'vitest'
import {
  SLASH_COMMANDS,
  findSlashCommand,
  isSlashCommand,
  type SlashContext,
} from '../src/commands/index.js'
import type { TranscriptEntry } from '../src/store/ui.js'

describe('slash registry (D-26 C2)', () => {
  it('1. SLASH_COMMANDS 9 条 (跟 D-26 §3.2 拍板)', () => {
    expect(SLASH_COMMANDS).toHaveLength(9)
    const names = SLASH_COMMANDS.map(c => c.name)
    expect(names).toContain('help')
    expect(names).toContain('exit')
    expect(names).toContain('clear')
    expect(names).toContain('verify')
    expect(names).toContain('status')
    expect(names).toContain('model')
    expect(names).toContain('resume')
    expect(names).toContain('personality')
    expect(names).toContain('heapdump')
  })
  it('2. findSlashCommand: 别名解析 (e/q/quit 走 exit, mem 走 heapdump)', () => {
    expect(findSlashCommand('exit')?.name).toBe('exit')
    expect(findSlashCommand('q')?.name).toBe('exit')
    expect(findSlashCommand('quit')?.name).toBe('exit')
    expect(findSlashCommand('mem')?.name).toBe('heapdump')
    expect(findSlashCommand('help')?.name).toBe('help')
    expect(findSlashCommand('notfound')).toBeUndefined()
    // 大小写不敏感 (跟 Hermes 1:1)
    expect(findSlashCommand('EXIT')?.name).toBe('exit')
  })
  it('3. isSlashCommand: / 开头 true, 普通 input false', () => {
    expect(isSlashCommand('/help')).toBe(true)
    expect(isSlashCommand('/exit')).toBe(true)
    expect(isSlashCommand('hello world')).toBe(false)
    expect(isSlashCommand('')).toBe(false)
  })
})

describe('slash /help (D-26 C3, core 1/5)', () => {
  it('4. /help 印 9 命令列表 (跟 D-26 §3.2 拍板 1:1)', () => {
    const pushed: TranscriptEntry[] = []
    const ctx: SlashContext = {
      theme: { header: 'h', model: 'm', divider: 'd', prompt: 'p', error: 'e', success: 's', toolName: 't' },
      ui: { mode: 'idle', usage: null, model: 'mock', pendingConfirm: null, lastError: null },
      transcript: [],
      model: 'mock-model',
      sessionPath: undefined,
      pushEntry: (entry) => { pushed.push(entry) },
      clearTranscript: () => {},
      setModel: () => {},
      exit: () => {},
    }
    const cmd = findSlashCommand('help')!
    cmd.run('', ctx)
    expect(pushed).toHaveLength(1)
    const text = pushed[0]!.text
    // 9 命令 1:1 印
    for (const cmdName of ['/help', '/exit', '/clear', '/verify', '/status', '/model', '/resume', '/personality', '/heapdump']) {
      expect(text).toContain(cmdName)
    }
  })
})

describe('slash /exit (D-26 C3, core 2/5)', () => {
  it('5. /exit /q /quit 调 ctx.exit({exitCode:0, reason:user-exit}) 1:1', () => {
    for (const name of ['exit', 'q', 'quit']) {
      let exitArg: { exitCode?: number; reason?: string } | undefined
      const ctx: SlashContext = {
        theme: { header: 'h', model: 'm', divider: 'd', prompt: 'p', error: 'e', success: 's', toolName: 't' },
        ui: { mode: 'idle', usage: null, model: 'mock', pendingConfirm: null, lastError: null },
        transcript: [],
        model: 'mock-model',
        sessionPath: undefined,
        pushEntry: () => {},
        clearTranscript: () => {},
        setModel: () => {},
        exit: (result) => { exitArg = result },
      }
      const cmd = findSlashCommand(name)!
      cmd.run('', ctx)
      expect(exitArg, `command ${name} 应触发 ctx.exit`).toBeDefined()
      expect(exitArg?.exitCode).toBe(0)
      expect(exitArg?.reason).toBe('user-exit')
    }
  })
})

describe('slash /clear (D-26 C3, core 3/5)', () => {
  it('6. /clear 调 ctx.clearTranscript() 一次 + push 提示', () => {
    let clearedCount = 0
    const pushed: TranscriptEntry[] = []
    const ctx: SlashContext = {
      theme: { header: 'h', model: 'm', divider: 'd', prompt: 'p', error: 'e', success: 's', toolName: 't' },
      ui: { mode: 'idle', usage: null, model: 'mock', pendingConfirm: null, lastError: null },
      transcript: [],
      model: 'mock-model',
      sessionPath: undefined,
      pushEntry: (entry) => { pushed.push(entry) },
      clearTranscript: () => { clearedCount++ },
      setModel: () => {},
      exit: () => {},
    }
    const cmd = findSlashCommand('clear')!
    cmd.run('', ctx)
    expect(clearedCount).toBe(1)
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.text).toContain('transcript cleared')
  })
})

describe('slash /status (D-26 C3, core 4/5)', () => {
  it('7. /status 印 model + mode + session + usage + transcript 数', () => {
    const pushed: TranscriptEntry[] = []
    const ctx: SlashContext = {
      theme: { header: 'h', model: 'm', divider: 'd', prompt: 'p', error: 'e', success: 's', toolName: 't' },
      ui: { mode: 'streaming', usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, model: 'deepseek-v4-flash', pendingConfirm: null, lastError: null },
      transcript: [
        { kind: 'user', text: 'a' },
        { kind: 'assistant', text: 'b', streaming: false },
      ],
      model: 'deepseek-v4-flash',
      sessionPath: '/tmp/test.jsonl',
      pushEntry: (entry) => { pushed.push(entry) },
      clearTranscript: () => {},
      setModel: () => {},
      exit: () => {},
    }
    const cmd = findSlashCommand('status')!
    cmd.run('', ctx)
    const text = pushed[0]!.text
    expect(text).toContain('deepseek-v4-flash')
    expect(text).toContain('streaming')
    expect(text).toContain('/tmp/test.jsonl')
    expect(text).toContain('100 prompt')
    expect(text).toContain('50 completion')
    expect(text).toContain('150 total')
    expect(text).toContain('2 entries')
  })
})

describe('slash /model (D-26 C3, session 1/3)', () => {
  // D-26 B2 实战撞: closure let 写值, return snapshot 错位. 用对象引用:
  //   const state = { setModelCall: null } ; setModel 改 state.setModelCall
  //   return state → 测里 state.setModelCall 读最新值
  function makeModelCtx(): { ctx: SlashContext; state: { setModelCall: { model: string; provider?: string } | null; pushed: TranscriptEntry[] } } {
    const state: { setModelCall: { model: string; provider?: string } | null; pushed: TranscriptEntry[] } = { setModelCall: null, pushed: [] }
    const ctx: SlashContext = {
      theme: { header: 'h', model: 'm', divider: 'd', prompt: 'p', error: 'e', success: 's', toolName: 't' },
      ui: { mode: 'idle', usage: null, model: 'mock', pendingConfirm: null, lastError: null },
      transcript: [],
      model: 'mock-model',
      sessionPath: undefined,
      pushEntry: (entry) => { state.pushed.push(entry) },
      clearTranscript: () => {},
      setModel: (model, provider) => { state.setModelCall = { model, provider } },
      exit: () => {},
    }
    return { ctx, state }
  }

  it('8. /model deepseek-v4-flash 调 ctx.setModel 跟 provider=deepseek', () => {
    const { ctx, state } = makeModelCtx()
    const cmd = findSlashCommand('model')!
    cmd.run('deepseek-v4-flash', ctx)
    expect(state.setModelCall).toEqual({ model: 'deepseek-v4-flash', provider: 'deepseek' })
    expect(state.pushed).toHaveLength(1)
    expect(state.pushed[0]!.text).toContain('deepseek-v4-flash')
  })
  it('9. /model claude-sonnet-4-5 推 provider=anthropic', () => {
    const { ctx, state } = makeModelCtx()
    const cmd = findSlashCommand('model')!
    cmd.run('claude-sonnet-4-5', ctx)
    expect(state.setModelCall).toEqual({ model: 'claude-sonnet-4-5', provider: 'anthropic' })
  })
  it('10. /model (无 arg) push 提示, 0 调 setModel', () => {
    const { ctx, state } = makeModelCtx()
    const cmd = findSlashCommand('model')!
    cmd.run('', ctx)
    expect(state.setModelCall).toBeNull()
    expect(state.pushed[0]!.text).toContain('requires a model name')
  })
})

describe('slash /heapdump (D-26 C3, debug 1/1)', () => {
  it('11. /heapdump 印 process.memoryUsage() 5 字段', () => {
    const pushed: TranscriptEntry[] = []
    const ctx: SlashContext = {
      theme: { header: 'h', model: 'm', divider: 'd', prompt: 'p', error: 'e', success: 's', toolName: 't' },
      ui: { mode: 'idle', usage: null, model: 'mock', pendingConfirm: null, lastError: null },
      transcript: [],
      model: 'mock-model',
      sessionPath: undefined,
      pushEntry: (entry) => { pushed.push(entry) },
      clearTranscript: () => {},
      setModel: () => {},
      exit: () => {},
    }
    const cmd = findSlashCommand('heapdump')!
    cmd.run('', ctx)
    const text = pushed[0]!.text
    expect(text).toContain('rss:')
    expect(text).toContain('heapTotal:')
    expect(text).toContain('heapUsed:')
    expect(text).toContain('external:')
    expect(text).toContain('arrayBuffers:')
  })
})
