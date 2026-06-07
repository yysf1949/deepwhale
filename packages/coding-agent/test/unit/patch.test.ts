/**
 * D-30.2.3: patch 工具 (find/replace unique string in file).
 *
 * 拍板 (D-30.2): 跟 edit_file (hashline) 并行, 走纯 string find/replace.
 * - oldString 必须 unique 出现, 0 / >1 报错
 * - 一次只能 patch 1 处 (跟 plan 文档 step 3 一致)
 * - risk: medium (覆盖原文件不可恢复) — 跟 write_file 1:1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PatchTool } from '../../src/tools/patch.js';

describe('PatchTool (D-30.2.3)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-patch-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('replaces a unique string in a file', async () => {
    const path = join(dir, 'a.txt');
    writeFileSync(path, 'hello\nworld\n', 'utf8');
    const tool = new PatchTool();
    const r = await tool.execute({ path, oldString: 'world', newString: 'there' });
    expect(r.success).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('hello\nthere\n');
  });

  it('returns error when oldString not found', async () => {
    const path = join(dir, 'a.txt');
    writeFileSync(path, 'hello\nworld\n', 'utf8');
    const tool = new PatchTool();
    const r = await tool.execute({ path, oldString: 'missing', newString: 'X' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/not found/);
    }
  });

  it('returns error when oldString matches multiple times', async () => {
    const path = join(dir, 'a.txt');
    writeFileSync(path, 'foo\nfoo\n', 'utf8');
    const tool = new PatchTool();
    const r = await tool.execute({ path, oldString: 'foo', newString: 'bar' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/matches.*times/);
    }
  });

  it('returns error for missing file', async () => {
    const tool = new PatchTool();
    const r = await tool.execute({ path: join(dir, 'missing.txt'), oldString: 'X', newString: 'Y' });
    expect(r.success).toBe(false);
  });
});
