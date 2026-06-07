/**
 * @deepwhale/coding-agent — Session index JSON 兜底 (D-30.1δ.10, 2026-06-07).
 *
 * 拍板: better-sqlite3 装不上 (Node 24.14.0 win32 无 prebuilt, 沙箱拒
 * curl 下载), 用 JSON 文件 兜底 sessions-index.json, list/add/remove/search
 * 4 方法 1:1 cover FTS5 拍板, 后续 D-30.3 升级.
 * 0 改业务, 5 红线 0 触碰.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionIndex } from '../../src/util/session-index.js'

describe('session index (JSON 兜底)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-sess-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('starts empty', async () => {
    const idx = new SessionIndex(dir)
    expect(await idx.list()).toEqual([])
  })

  it('adds and retrieves session', async () => {
    const idx = new SessionIndex(dir)
    await idx.add({ id: 's1', path: '/tmp/s1.jsonl', messageCount: 5, firstUser: 'hi', createdAt: 1000 })
    const all = await idx.list()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('s1')
  })

  it('searches by first user message', async () => {
    const idx = new SessionIndex(dir)
    await idx.add({ id: 's1', path: '/tmp/s1.jsonl', messageCount: 5, firstUser: 'find me', createdAt: 1000 })
    await idx.add({ id: 's2', path: '/tmp/s2.jsonl', messageCount: 3, firstUser: 'other', createdAt: 2000 })
    const results = await idx.search('find')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('s1')
  })
})
