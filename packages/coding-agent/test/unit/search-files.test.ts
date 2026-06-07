/**
 * D-30.2.4: search_files 工具 (ripgrep via execFileSync).
 *
 * 拍板 (D-30.2): 跟 find/grep (Node 实现) 并行, 走 ripgrep 子进程.
 * - 性能更优, 大仓库仍可用
 * - 跨平台走 rg.exe (Windows) / rg (Unix)
 * - 缺 rg → graceful 报错, 不 panic
 * - risk: low (只读)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SearchFilesTool } from '../../src/tools/search-files.js';

describe('SearchFilesTool (D-30.2.4)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dw-sf-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('searches a pattern in files', async () => {
    writeFileSync(join(dir, 'a.ts'), 'const foo = 1;\n');
    writeFileSync(join(dir, 'b.ts'), 'const foo = 2;\n');
    writeFileSync(join(dir, 'c.txt'), 'no match here\n');

    const tool = new SearchFilesTool();
    const r = await tool.execute({ pattern: 'foo', path: dir });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.content).toContain('a.ts');
      expect(r.content).toContain('b.ts');
      expect(r.content).not.toContain('c.txt');
    }
  });

  it('returns success with empty content for no matches (ripgrep exit 1)', async () => {
    writeFileSync(join(dir, 'a.ts'), 'hello world\n');

    const tool = new SearchFilesTool();
    const r = await tool.execute({ pattern: 'nonexistent_xyz_123', path: dir });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.content).toContain('(no matches)');
    }
  });

  it('respects glob filter', async () => {
    writeFileSync(join(dir, 'a.ts'), 'const foo = 1;\n');
    writeFileSync(join(dir, 'b.txt'), 'const foo = 2;\n');

    const tool = new SearchFilesTool();
    const r = await tool.execute({ pattern: 'foo', path: dir, glob: '*.ts' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.content).toContain('a.ts');
      expect(r.content).not.toContain('b.txt');
    }
  });

  it('includes line numbers (rg -n)', async () => {
    writeFileSync(join(dir, 'a.ts'), 'line1\nline2 MATCH\nline3\n');

    const tool = new SearchFilesTool();
    const r = await tool.execute({ pattern: 'MATCH', path: dir });
    expect(r.success).toBe(true);
    if (r.success) {
      // 期望 line2 MATCH 在第 2 行
      expect(r.content).toMatch(/a\.ts:2:line2 MATCH/);
    }
  });
});
