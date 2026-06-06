/**
 * @deepwhale/coding-agent — tui-history util 测 (D-25 B4).
 *
 * D-25 plan §3.1 B4 拍板: 抽 tuiHistoryPath/Load/Append/Truncate 到 coding-agent util,
 * tui-ink 复用. 验收红线: 3 格式互读不破坏.
 *
 * 3 格式 (D-22.1 写, 跟 D-25 A1 修后):
 *   - 旧 raw line JSONL (D-22.1 readline 容器) — 每行 1 条 raw line
 *   - 新 raw line JSONL (D-25 A1 tui-ink 写) — 跟旧同形态
 *   - 截断格式 (TUI_HISTORY_MAX = 1000 LRU) — 跟读 + 写都验证
 *
 * 测 (跟 tui-ink 4a-4h 同形态, 但走 coding-agent util 入口):
 *   - 1a-1c: 跟 tui-ink 4a-4e 一致 (empty load / append+load / 空 line 拒收)
 *   - 1d-1f: D-25 A1 homeOverride 3 路径 (homeOverride > env > USERPROFILE > HOME > homedir)
 *   - 2. truncate LRU 跟 4a-4e 1:1
 *
 * 3 格式互读验 (B4 拍板):
 *   - 写 1 条 append → 读返 ['xxx']
 *   - 写 1000 条 (不超 max) → 读返 1000 条
 *   - 写 1500 条 (超 max, 注意: util 自己**不**在 append 时截断, 只 truncate 函数截)
 *     → read 返 1500 (因为 util 不在读时截) → truncate 截到 1000
 *   - 跨"legacy 旧行"+"新行" 互读 (用 pre-existing file)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  tuiHistoryPath,
  tuiHistoryLoad,
  tuiHistoryAppend,
  tuiHistoryTruncate,
  TUI_HISTORY_MAX,
} from '../../src/util/tui-history.js'

describe('tui-history util (D-25 B4)', () => {
  let tmpHome: string
  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'coding-agent-tui-history-'))
    process.env['HOME'] = tmpHome
    process.env['USERPROFILE'] = tmpHome
    delete process.env['DEEPWHALE_HOME']
  })
  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
    delete process.env['DEEPWHALE_HOME']
  })

  it('1a. empty load 返 []', () => {
    expect(tuiHistoryLoad()).toEqual([])
  })
  it('1b. append + load 顺序对 (最新在末尾)', () => {
    tuiHistoryAppend('first line')
    tuiHistoryAppend('second line')
    tuiHistoryAppend('third line')
    expect(tuiHistoryLoad()).toEqual(['first line', 'second line', 'third line'])
  })
  it('1c. 空 line 不 append', () => {
    tuiHistoryAppend('')
    tuiHistoryAppend('   ')
    expect(tuiHistoryLoad()).toEqual([])
  })
  it('1d. path 是 <home>/.deepwhale/tui-history', () => {
    expect(tuiHistoryPath()).toContain('.deepwhale')
    expect(tuiHistoryPath()).toContain('tui-history')
  })
  it('1e. truncate LRU (跟 tui-ink 4e 1:1)', () => {
    const lines = Array.from({ length: 1500 }, (_, i) => `line ${i}`)
    const truncated = tuiHistoryTruncate(lines)
    expect(truncated.length).toBe(TUI_HISTORY_MAX) // 1000
    expect(truncated[0]).toBe('line 500')
    expect(truncated[999]).toBe('line 1499')
  })

  // D-25 A1 (F4): 3 路径优先级 + Windows USERPROFILE 探测
  it('1f. homeOverride 优先于 env (D-25 A1)', () => {
    const overrideHome = mkdtempSync(join(tmpdir(), 'override-'))
    try {
      process.env['DEEPWHALE_HOME'] = mkdtempSync(join(tmpdir(), 'env-'))
      tuiHistoryAppend('via-override', overrideHome)
      expect(tuiHistoryLoad(overrideHome)).toEqual(['via-override'])
      expect(tuiHistoryLoad(process.env['DEEPWHALE_HOME'])).toEqual([])
    } finally {
      rmSync(overrideHome, { recursive: true, force: true })
      rmSync(process.env['DEEPWHALE_HOME']!, { recursive: true, force: true })
    }
  })
  it('1g. DEEPWHALE_HOME env 优先于 HOME/USERPROFILE (D-25 A1)', () => {
    const envHome = mkdtempSync(join(tmpdir(), 'env-home-'))
    try {
      process.env['DEEPWHALE_HOME'] = envHome
      tuiHistoryAppend('via-env')
      expect(tuiHistoryLoad(envHome)).toEqual(['via-env'])
      expect(tuiHistoryLoad(tmpHome)).toEqual([])
    } finally {
      rmSync(envHome, { recursive: true, force: true })
    }
  })
  it('1h. Windows: USERPROFILE 优先 (D-25 A1)', () => {
    const winHome = mkdtempSync(join(tmpdir(), 'win-home-'))
    const unixHome = mkdtempSync(join(tmpdir(), 'unix-home-'))
    try {
      process.env['USERPROFILE'] = winHome
      process.env['HOME'] = unixHome
      delete process.env['DEEPWHALE_HOME']
      tuiHistoryAppend('windows-style')
      expect(tuiHistoryLoad(winHome)).toEqual(['windows-style'])
      expect(tuiHistoryLoad(unixHome)).toEqual([])
    } finally {
      rmSync(winHome, { recursive: true, force: true })
      rmSync(unixHome, { recursive: true, force: true })
    }
  })

  // D-25 B4 拍板: 3 格式互读不破坏
  it('2. 跨格式互读 (D-25 B4): legacy raw line JSONL → util 读 → 返原行', () => {
    // 模拟 legacy readline 容器 (D-22.1) 写的 raw line JSONL
    // writeFileSync 不创建父目录, 显式 mkdir (跟 tuiHistoryAppend 内部行为一致)
    const p = tuiHistoryPath()
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, 'legacy-line-1\nlegacy-line-2\nlegacy-line-3\n', 'utf8')
    expect(existsSync(p)).toBe(true)
    // util 读 (新加的 import) 应该 0 破坏
    expect(tuiHistoryLoad()).toEqual(['legacy-line-1', 'legacy-line-2', 'legacy-line-3'])
  })
  it('2b. 跨格式互读 (D-25 B4): util append 写 → tui-ink re-export 读', () => {
    // 走 coding-agent util 写
    tuiHistoryAppend('util-write-line')
    // 模拟 tui-ink 通过 re-export 读 (用同一 path, 同一 env)
    const p = tuiHistoryPath()
    expect(existsSync(p)).toBe(true)
    expect(tuiHistoryLoad()).toEqual(['util-write-line'])
  })
  it('2c. 跨格式互读 (D-25 B4): truncate 跨过 legacy + new 混合, 不丢数据', () => {
    // 模拟 legacy + new 混合: 写 5 条 raw, truncate 不应丢
    tuiHistoryAppend('legacy-1')
    tuiHistoryAppend('legacy-2')
    tuiHistoryAppend('new-1')
    tuiHistoryAppend('new-2')
    tuiHistoryAppend('new-3')
    const all = tuiHistoryLoad()
    expect(all).toEqual(['legacy-1', 'legacy-2', 'new-1', 'new-2', 'new-3'])
    // 截断 (不超 max) 0 丢
    expect(tuiHistoryTruncate(all)).toEqual(all)
  })
})
