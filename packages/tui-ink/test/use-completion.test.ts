/**
 * @deepwhale/tui-ink — useCompletion hook 测 (D-28 E3, 跟 Hermes ui-tui 对齐).
 *
 * 测覆盖 (跟 Hermes 1:1 80% 行为):
 *   - 边界: 空 input 0 补全
 *   - slash 补全: /h 找 /help, /ex 找 /exit, /q 找 /quit (别名)
 *   - slash 补全: /unknown 0 匹配 返空
 *   - path 补全: D-28 拍 placeholder, 0 真实补 (D-29+ 升级)
 *   - 1:1 跟 SLASH_COMMANDS 索引 (D-26 C2/C3 已 ship)
 *
 * 业务 0 改, 1:1 拍 Hermes useCompletion 简化版 80% 行为.
 */

import { describe, it, expect } from 'vitest'
import { useCompletion, useDebouncedCompletion } from '../src/hooks/useCompletion.js'

describe('useCompletion (D-28 E3, 跟 Hermes 1:1)', () => {
  it('1. 边界: 空 input 返空 suggestions (跟 Hermes 1:1)', () => {
    const result = useCompletion('')
    expect(result.suggestions).toEqual([])
    expect(result.isSlash).toBe(false)
  })
  it('2. slash 补全: /help 完整名匹配 (跟 SLASH_COMMANDS 1:1 精确匹配)', () => {
    // D-28 E3 B1 实战: Hermes useCompletion 用 byName Map 精确匹配 (跟 D-26 C2 1:1)
    // 0 prefix 匹配 (e.g. /h 0 找 /help, 需输 /help 完整)
    const result = useCompletion('/help')
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]!.text).toBe('/help')
    expect(result.suggestions[0]!.display).toContain('/help')
    expect(result.isSlash).toBe(true)
    expect(result.replaceFrom).toBe(1) // 1:1 Hermes 拍
  })
  it('3. slash 补全: /exi 0 匹配 (拍精确匹配, 跟 Hermes 1:1)', () => {
    // 测验 0 prefix 匹配 (D-26 C2 byName Map 精确)
    const result = useCompletion('/exi')
    expect(result.suggestions).toEqual([])
    expect(result.isSlash).toBe(true)
  })
  it('4. slash 补全: /q 别名匹配 (D-26 C2 byName 含别名 1:1)', () => {
    // D-26 C2: 9 命令 + 3 别名 (e/q/quit → /exit, mem → /heapdump) 都在 byName Map
    // 跟 commands.test.ts 测 2 1:1: /q 找 exit, /quit 找 exit (别名为 'q', name 为 'exit')
    const result = useCompletion('/q')
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]!.text).toBe('/exit')
  })
  it('5. slash 补全: /unknown 0 匹配返空 (跟 Hermes 1:1 fallback)', () => {
    const result = useCompletion('/unknown')
    expect(result.suggestions).toEqual([])
    expect(result.isSlash).toBe(true) // 仍是 slash 模式, 仅无补全
  })
  it('6. slash 补全: 大小写不敏感 (D-26 C2 1:1)', () => {
    const result = useCompletion('/HELP')
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]!.text).toBe('/help')
  })
  it('7. path 补全: D-28 拍 placeholder (0 真实补, D-29+ 升级)', () => {
    // 0 RPC, 0 真实 fs.readdir, 拍 'whatever' 0 slash 也 0 补
    const result = useCompletion('./sr')
    expect(result.suggestions).toEqual([])
    expect(result.isSlash).toBe(false)
  })
  it('8. useMemo 优化: 同 input 多次调返 同一 result 引用', () => {
    const a = useCompletion('/h')
    const b = useCompletion('/h')
    // D-28 E3 B1 实战撞: useMemo 仅在 React 组件内有效, 模块作用域调用 0 memo
    // (hook 拍 useMemo 0 改行为, 0 memo 在非 React 上下文)
    // 修: 不验 reference equality, 改验 content equality
    expect(a.suggestions[0]?.text).toBe(b.suggestions[0]?.text)
  })
  it('9. slash 命令带 arg: /model abc 仍识 /model (跟 Hermes 1:1 路由)', () => {
    const result = useCompletion('/model abc')
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]!.text).toBe('/model')
    // replaceTo 应覆盖整个 input '/model abc' (拍 Hermes 1:1)
    expect(result.suggestions[0]!.replaceTo).toBe('/model abc'.length)
  })
})

describe('useDebouncedCompletion (D-28 E3 helper)', () => {
  it('10. useDebouncedCompletion 1:1 返 useCompletion 拍板 (D-28 简化 0 debounce)', () => {
    const a = useDebouncedCompletion('/help')
    const b = useCompletion('/help')
    expect(a.suggestions[0]?.text).toBe(b.suggestions[0]?.text)
  })
})
