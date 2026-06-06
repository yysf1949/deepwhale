/**
 * @deepwhale/tui-ink — lib 工具测 (D-26 C1, 跟 Hermes ui-tui 对齐).
 *
 * 5 个 lib 拍 Hermes 80% 行为 1:1:
 *   - text: stripAnsi / hasAnsi / estimateTokensRough / fmtK / sanitizeLine
 *   - circularBuffer: push O(1) / tail / drain / clear
 *   - messages: upsert 同 role 合并
 *   - platform: isMac / isActionMod / isAction
 *   - gracefulExit: setup 1 次 (wired flag), 0 重入 (D-26 简化)
 *
 * 跟 ship-quality-checks §7a 一致: 估算数字 vs 实测数字, 不光"写完就好"
 * 必跑覆盖.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stripAnsi, hasAnsi, estimateTokensRough, fmtK, sanitizeLine } from '../src/lib/text.js'
import { CircularBuffer } from '../src/lib/circularBuffer.js'
import { upsert, type Msg } from '../src/lib/messages.js'
import { isMac, isActionMod, isAction } from '../src/lib/platform.js'
import { setupGracefulExit } from '../src/lib/gracefulExit.js'

describe('lib/text (D-26 C1)', () => {
  it('1. stripAnsi 去掉 ANSI 转义', () => {
    const colored = '\x1b[32mhello\x1b[0m \x1b[1;31mworld\x1b[0m'
    expect(stripAnsi(colored)).toBe('hello world')
  })
  it('2. hasAnsi 检测 ANSI 含/不含', () => {
    expect(hasAnsi('\x1b[32mfoo\x1b[0m')).toBe(true)
    expect(hasAnsi('plain text')).toBe(false)
  })
  it('3. estimateTokensRough 4 字符/token (D-26 B1 实战撞: ceil 算法不是 1:1)', () => {
    // D-26 B1 实战撞: Math.ceil((length+3)/4) 实际算法:
    //   - 0 chars → Math.ceil(3/4) = 1 (但代码特判返 0)
    //   - 1-4 chars → Math.ceil(1-7/4) = 1-2 (具体看 length)
    //   - 实际拍: 这是 Hermes estimateTokensRough 1:1 (跟 Hermes 拍板一致),
    //     但**测注释要锁准**. 1:1 验算法, 不强求"4 chars = 1 token"
    expect(estimateTokensRough('')).toBe(0) // 显式特判
    expect(estimateTokensRough('a'.repeat(1))).toBe(1) // 1 char
    expect(estimateTokensRough('a'.repeat(4))).toBe(2) // 4 chars
    expect(estimateTokensRough('a'.repeat(8))).toBe(3) // 8 chars
    expect(estimateTokensRough('hello world')).toBe(4) // 11 chars
    expect(estimateTokensRough('a'.repeat(100))).toBe(26) // 100 chars
  })
  it('4. fmtK 紧凑格式化', () => {
    expect(fmtK(0)).toBe('0')
    expect(fmtK(999)).toBe('999')
    expect(fmtK(1000)).toBe('1.0K')
    expect(fmtK(1500)).toBe('1.5K')
    expect(fmtK(1_000_000)).toBe('1.0M')
    expect(fmtK(2_500_000_000)).toBe('2.5B')
  })
  it('5. sanitizeLine 去掉 markdown 装饰 (Hermes renderEstimateLine 简化版)', () => {
    expect(sanitizeLine('**bold**')).toBe('bold')
    expect(sanitizeLine('*italic*')).toBe('italic')
    expect(sanitizeLine('`code`')).toBe('code')
    expect(sanitizeLine('~~strike~~')).toBe('strike')
    expect(sanitizeLine('# heading')).toBe('heading') // 去掉 leading #
    expect(sanitizeLine('- item')).toBe('• item')
    expect(sanitizeLine('1. item')).toBe('1. item')
    expect(sanitizeLine('[text](https://example.com)')).toBe('text') // link 简化
    expect(sanitizeLine('![alt](img.png)')).toBe('[image: alt]')
  })
})

describe('lib/circularBuffer (D-26 C1, Hermes 1:1)', () => {
  it('1. push / tail O(1) 基础', () => {
    const cb = new CircularBuffer<number>(3)
    cb.push(1)
    cb.push(2)
    cb.push(3)
    expect(cb.tail()).toEqual([1, 2, 3])
    expect(cb.size).toBe(3)
  })
  it('2. 满后 push 覆盖最老', () => {
    const cb = new CircularBuffer<string>(3)
    cb.push('a')
    cb.push('b')
    cb.push('c')
    cb.push('d') // 覆盖 a
    expect(cb.tail()).toEqual(['b', 'c', 'd'])
    expect(cb.size).toBe(3)
  })
  it('3. tail(n) 限制条数', () => {
    const cb = new CircularBuffer<number>(5)
    for (let i = 1; i <= 5; i++) cb.push(i)
    expect(cb.tail(3)).toEqual([3, 4, 5])
  })
  it('4. drain 取全部 + 清空', () => {
    const cb = new CircularBuffer<number>(3)
    cb.push(1); cb.push(2)
    expect(cb.drain()).toEqual([1, 2])
    expect(cb.size).toBe(0)
  })
  it('5. 容量 0 抛 RangeError (跟 Hermes 1:1)', () => {
    expect(() => new CircularBuffer<number>(0)).toThrow(RangeError)
    expect(() => new CircularBuffer<number>(-1)).toThrow(RangeError)
  })
})

describe('lib/messages (D-26 C1, Hermes 1:1)', () => {
  it('1. upsert 末尾同 role → 替换', () => {
    const prev: Msg[] = [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }]
    const next = upsert(prev, 'assistant', 'B')
    expect(next).toEqual([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'B' }])
    expect(next).toHaveLength(2) // 0 增
  })
  it('2. upsert 末尾不同 role → 追加', () => {
    const prev: Msg[] = [{ role: 'user', text: 'a' }]
    const next = upsert(prev, 'assistant', 'b')
    expect(next).toEqual([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }])
    expect(next).toHaveLength(2)
  })
  it('3. upsert 空 prev → 追加', () => {
    const next = upsert([], 'user', 'hello')
    expect(next).toEqual([{ role: 'user', text: 'hello' }])
  })
})

describe('lib/platform (D-26 C1, Hermes 1:1)', () => {
  it('1. isMac 反映 process.platform', () => {
    expect(isMac).toBe(process.platform === 'darwin')
  })
  it('2. isActionMod 跨平台修饰键', () => {
    if (isMac) {
      expect(isActionMod({ ctrl: false, meta: true })).toBe(true)
      expect(isActionMod({ ctrl: true, meta: false })).toBe(false)
    } else {
      expect(isActionMod({ ctrl: true, meta: false })).toBe(true)
      expect(isActionMod({ ctrl: false, meta: true })).toBe(false)
    }
  })
  it('3. isAction 匹配字符 (大小写不敏感)', () => {
    const ch = 'c'
    if (isMac) {
      expect(isAction({ ctrl: false, meta: true }, ch, 'c')).toBe(true)
      expect(isAction({ ctrl: false, meta: true }, 'C', 'c')).toBe(true)
    } else {
      expect(isAction({ ctrl: true, meta: false }, ch, 'c')).toBe(true)
      expect(isAction({ ctrl: true, meta: false }, 'C', 'c')).toBe(true)
    }
    expect(isAction({ ctrl: false, meta: false }, ch, 'c')).toBe(false)
  })
})

describe('lib/gracefulExit (D-26 C1)', () => {
  // 跨测隔离: 每次测前先清掉 process 上遗留的 uncaughtException / unhandledRejection 监听器
  beforeEach(() => {
    process.removeAllListeners('uncaughtException')
    process.removeAllListeners('unhandledRejection')
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGTERM')
    process.removeAllListeners('SIGHUP')
    // 重置 module state: vi.resetModules() 让下次 import 重新执行
    vi.resetModules()
  })
  it('1. setup 调用不抛 (D-26 简化: 0 重入保护, wired 走 module 状态)', async () => {
    const { setupGracefulExit: setup } = await import('../src/lib/gracefulExit.js')
    expect(() => setup()).not.toThrow()
    expect(() => setup()).not.toThrow() // 第二次静默 return
  })
  it('2. uncaughtException onError 回调被调', async () => {
    const { setupGracefulExit: setup } = await import('../src/lib/gracefulExit.js')
    let receivedScope: string | null = null
    setup({
      onError: (scope, _err) => { receivedScope = scope },
    })
    const err = new Error('test')
    process.emit('uncaughtException', err)
    expect(receivedScope).toBe('uncaughtException')
  })
  it('3. unhandledRejection onError 回调被调', async () => {
    const { setupGracefulExit: setup } = await import('../src/lib/gracefulExit.js')
    let receivedScope: string | null = null
    setup({
      onError: (scope, _err) => { receivedScope = scope },
    })
    process.emit('unhandledRejection', new Error('rej'))
    expect(receivedScope).toBe('unhandledRejection')
  })
})
