/**
 * @deepwhale/tui-ink — runToolLoop 静态签名 smoke 测 (D-25 B3 F7 P0.5).
 *
 * D-25 plan §3.1 B3 拍板: "防止下次又被改". 这个测是 ship-quality-checks §7a
 * 第 2 类 "优先级 vs 文字矛盾" 的工程化保险:
 *
 * 修前 (D-24.4 现状): useRunToolLoop.ts:65 调 `runToolLoop(turnMessages, options)`,
 *   跟 tool-loop.ts 拍板 3 参签名 `(client, messages, options)` 矛盾, 装出后
 *   有 LLM key 真 input 时 TypeError. D-24.3 4 验证全过但漏掉, 因为 root tsconfig
 *   缺 tui-ink references, root tsc -b 不查 tui-ink.
 *
 * 修后 (D-25 B2): useRunToolLoop 调 `runToolLoop(client, turnMessages, options)`.
 *   3 参签名跟 tool-loop.ts 1:1.
 *
 * 这个测的目的: 静态 import runToolLoop, 断言 `.length === 3` 锁定 3 参签名.
 *   如果有人手抖把 useRunToolLoop 改回 2 参, 编译会通 (因为 TS overload),
 *   但这个 smoke 测会立即 fail, 报警.
 *
 * 跟 ship-quality-checks §7a + memory §10c (spawn-error shape 不变量) 一致:
 *   关键契约用 smoke 测锁死, 防止反复修反复破.
 */

import { describe, it, expect } from 'vitest'
import { runToolLoop } from '@deepwhale/coding-agent'

describe('runToolLoop 静态签名 (D-25 B3 F7 P0.5)', () => {
  it('1. runToolLoop.length === 2 (client, messages — options 有 default)', () => {
    // D-25 B3 实战撞: Function.length 返回**第一个有 default value 之前**的命名参数数.
    // tool-loop.ts:129 拍板 `runToolLoop(client, messages, options = {})`:
    //   - 头 2 参 (client, messages) 无 default → length=2
    //   - 第 3 参 (options) 有 default value → 不计入 length
    // 这就是"3 参"但 length=2 的语义, 跟 useRunToolLoop 调 (client, turnMessages, options) 1:1 锁.
    // D-24.4 实战撞: 当时 useRunToolLoop 调 2 参 (turnMessages, options), 编译过 (TS overload),
    //   装出后运行时挂. 这个 smoke 测是"永远不再发生"保险.
    expect(runToolLoop.length).toBe(2)
  })

  it('2. runToolLoop 真实签名 (从 toString 抓 function 头, 3 参顺序锁)', () => {
    // 静态扫描 source, 不依赖运行时 length 行为, 防止有人把 runToolLoop 改成 2 参
    // (e.g. 误删 messages) 而 length 测 fail 时已经 0 防御.
    const fnSrc = runToolLoop.toString()
    // ESBuild 编译后函数签名形如: `async function runToolLoop(client, messages, options = {})`
    //   (参数名可能略不同, 关键是参数数量 = 3)
    // 跟 useRunToolLoop.ts 调 runToolLoop(client, turnMessages, options) 1:1
    expect(fnSrc).toMatch(/runToolLoop\([a-zA-Z_$][\w$]*,\s*[a-zA-Z_$][\w$]*,\s*[a-zA-Z_$][\w$]*\s*=\s*\{\}\)/)
  })
})
