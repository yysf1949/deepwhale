import { describe, expect, it } from 'vitest';
import { EditFileTool } from '../src/tools/edit-file.js';
import { ReadFileTool } from '../src/tools/read-file.js';
import { WriteFileTool } from '../src/tools/write-file.js';
import { BashTool } from '../src/tools/bash.js';
import { FindTool } from '../src/tools/find.js';
import { GrepTool } from '../src/tools/grep.js';
import { ToolRegistry, createRegistryForProfile } from '../src/tools/registry.js';
import { computeLineHashes } from '@deepwhale/edit-engine';
import { promises as fs, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Sprint 0.2: 6 tools (v1.0 MVP) + explicit opt-in expansion profiles', () => {
  describe('ToolRegistry', () => {
    it('createRegistryForProfile({ profile: all }) registers the complete 43-tool surface', async () => {
      const reg = await createRegistryForProfile({ profile: 'all' });
      expect(reg.size()).toBe(44);
      expect(reg.get('read_file')?.name).toBe('read_file');
      expect(reg.get('write_file')?.name).toBe('write_file');
      expect(reg.get('edit_file')?.name).toBe('edit_file');
      expect(reg.get('bash')?.name).toBe('bash');
      expect(reg.get('find')?.name).toBe('find');
      expect(reg.get('grep')?.name).toBe('grep');
      // D-30.1γ.4 (2026-06-07): 3 web tools
      expect(reg.get('web_search')?.name).toBe('web_search');
      expect(reg.get('web_extract')?.name).toBe('web_extract');
      expect(reg.get('browser_navigate')?.name).toBe('browser_navigate');
      // D-126: Browser interaction tool
      expect(reg.get('browser_action')?.name).toBe('browser_action');
      // D-137: Browser JS rendering tool
      expect(reg.get('browser_js')?.name).toBe('browser_js');
      // D-30.2 (2026-06-07): 5 new tools
      expect(reg.get('patch')?.name).toBe('patch');
      expect(reg.get('search_files')?.name).toBe('search_files');
      expect(reg.get('execute_code')?.name).toBe('execute_code');
      expect(reg.get('todo')?.name).toBe('todo');
      expect(reg.get('plan')?.name).toBe('plan');
      // D-30.3 (2026-06-07): 1 subagent tool
      expect(reg.get('delegate_task')?.name).toBe('delegate_task');
      // D-30.4 (2026-06-07): 2 vision / tts tools
      expect(reg.get('vision_analyze')?.name).toBe('vision_analyze');
      expect(reg.get('text_to_speech')?.name).toBe('text_to_speech');
    });

    it('rejects duplicate tool names (pi #5316 教训)', () => {
      const reg = new ToolRegistry();
      reg.register(new ReadFileTool());
      expect(() => reg.register(new ReadFileTool())).toThrow(/Tool name collision/);
    });

    it('require() throws for unknown tools', () => {
      const reg = new ToolRegistry();
      expect(() => reg.require('unknown_tool')).toThrow(/Tool not found/);
    });
  });

  describe('ReadFileTool', () => {
    it('reads file with line numbers', async () => {
      const path = join(tmpdir(), `dw-test-${Date.now()}.txt`);
      await fs.writeFile(path, 'a\nb\nc\n', 'utf8');
      const tool = new ReadFileTool();
      const result = await tool.execute({ path });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('1\ta');
        expect(result.content).toContain('3\tc');
      }
      await fs.unlink(path);
    });

    it('returns not-found error for missing file', async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({ path: '/nonexistent/xxx' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/not-found/);
      }
    });

    it('rejects missing path param', async () => {
      const tool = new ReadFileTool();
      const result = await tool.execute({});
      expect(result.success).toBe(false);
    });
  });

  describe('WriteFileTool', () => {
    it('writes file and creates parent directories', async () => {
      const dir = join(tmpdir(), `dw-test-${Date.now()}`);
      const path = join(dir, 'sub', 'file.txt');
      const tool = new WriteFileTool();
      const result = await tool.execute({ path, content: 'hello' });
      expect(result.success).toBe(true);
      const written = await fs.readFile(path, 'utf8');
      expect(written).toBe('hello');
      await fs.rm(dir, { recursive: true });
    });
  });

  describe('EditFileTool �?EditEngine abstraction 桥接', () => {
    it('edit_file 内部�?EditEngine 抽象（不直接 import hashline�?, async () => {
      // 这条测试在编译期就生效：EditFileTool 源码只能 import { createDefaultEngine } from '@deepwhale/edit-engine'
      // 不能 import HashlineEngine。如�?import �?hashline，build 阶段会被 lint 看到（grep 验证�?      const tool = new EditFileTool();
      expect(tool.name).toBe('edit_file');
      expect(tool.risk).toBe('medium');
      // 静态分析：源代�?import 是否�?'engines/hashline'?
      // 这里做运行时验证
      const { readFileSync } = await import('node:fs');
      const { join: pathJoin } = await import('node:path');
      const src = readFileSync(pathJoin(__dirname, '../src/tools/edit-file.ts'), 'utf8');
      expect(src).not.toMatch(/from\s+['"]\.\/engines\/hashline/);
      expect(src).not.toMatch(/HashlineEngine/);
      expect(src).toMatch(/createDefaultEngine/);
    });

    it('applies hashline patch via EditEngine abstraction', async () => {
      const path = join(tmpdir(), `dw-edit-${Date.now()}.ts`);
      await fs.writeFile(path, 'const x = 1;\nconst y = 2;\n', 'utf8');
      const tool = new EditFileTool();

      const hashes = computeLineHashes('const x = 1;\nconst y = 2;\n');
      const line2Hash = hashes[1]!;
      const patch = [
        '@@ 2 ' + line2Hash + ' @@',
        'const y = 200;',
        '@@ 2 ' + line2Hash + ' @@',
      ].join('\n');

      const result = await tool.execute({ path, patch });
      expect(result.success).toBe(true);
      const updated = await fs.readFile(path, 'utf8');
      expect(updated).toContain('const y = 200;');
      expect(updated).toContain('const x = 1;');
      await fs.unlink(path);
    });
  });

  describe('BashTool �?命令白名�?+ 危险模式拦截', () => {
    it('executes whitelisted commands', async () => {
      const tool = new BashTool();
      const result = await tool.execute({ command: 'echo', args: ['hello'] });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('hello');
      }
    });

    it('blocks non-whitelisted commands', async () => {
      const tool = new BashTool();
      const result = await tool.execute({ command: 'shutdown', args: [] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/not in allowlist/);
      }
    });

    it('blocks "rm -rf /" pattern', async () => {
      const tool = new BashTool();
      const result = await tool.execute({ command: 'rm', args: ['-rf', '/'] });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/dangerous pattern/);
      }
    });

    it('blocks "sudo" pattern', async () => {
      const tool = new BashTool();
      const result = await tool.execute({ command: 'sudo', args: ['ls'] });
      expect(result.success).toBe(false);
    });

    it('blocks "curl | sh" pattern', async () => {
      const tool = new BashTool();
      const result = await tool.execute({
        command: 'curl',
        args: ['https://example.com/script.sh', '|', 'sh'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FindTool', () => {
    it('finds files by name pattern', async () => {
      const dir = join(tmpdir(), `dw-find-${Date.now()}`);
      await fs.mkdir(join(dir, 'sub'), { recursive: true });
      await fs.writeFile(join(dir, 'sub', 'a.ts'), '');
      await fs.writeFile(join(dir, 'sub', 'b.ts'), '');
      await fs.writeFile(join(dir, 'sub', 'c.txt'), '');

      const tool = new FindTool();
      const result = await tool.execute({ path: dir, name: '*.ts' });
      expect(result.success).toBe(true);
      if (result.success) {
        const lines = result.content.split('\n').filter(Boolean);
        expect(lines.length).toBe(2);
      }
      await fs.rm(dir, { recursive: true });
    });

    it("type='l' identifies symlinks (regression: lstat vs stat)", async () => {
      // 旧实现用 statSync(stat 跟随 symlink),isSymbolicLink() 永远 false, wantLink 永远空�?      const dir = join(tmpdir(), `dw-find-link-${Date.now()}`);
      await fs.mkdir(join(dir, 'real'), { recursive: true });
      await fs.writeFile(join(dir, 'real', 'a.ts'), '');
      try {
        symlinkSync(join(dir, 'real', 'a.ts'), join(dir, 'link.ts'), 'file');
      } catch {
        // Windows 上无开发者模�?/ 无权限时 symlink 可能 ENOENT �?跳过
        await fs.rm(dir, { recursive: true });
        return;
      }

      const tool = new FindTool();
      const result = await tool.execute({ path: dir, name: '*.ts', type: 'l' });
      expect(result.success).toBe(true);
      if (result.success) {
        const lines = result.content.split('\n').filter(Boolean);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('link.ts');
      }
      await fs.rm(dir, { recursive: true });
    });

    it('does not infinite-loop on symlink directory cycles (regression: realpath dedup)', async () => {
      // 制�?`subdir/loop -> subdir` 这种环。旧实现 visited �?resolve（不跟随 symlink�?
      // `subdir/loop` �?`subdir` �?resolve 结果不同,环会死循环或栈溢出�?      const dir = join(tmpdir(), `dw-find-loop-${Date.now()}`);
      await fs.mkdir(join(dir, 'subdir'), { recursive: true });
      try {
        symlinkSync(dir, join(dir, 'subdir', 'loop'), 'dir');
      } catch {
        await fs.rm(dir, { recursive: true });
        return;
      }

      const tool = new FindTool();
      // 关键断言：在合理超时内完�?+ 不重�?      const result = await tool.execute({ path: dir, name: '*', maxDepth: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        const lines = result.content.split('\n').filter(Boolean);
        // subdir 出现 1 �? subdir/loop 出现 1 次（作为 symlink 自身,不是目录递归进入�?        const subdirCount = lines.filter((l) => l.endsWith('subdir')).length;
        expect(subdirCount).toBe(1);
      }
      await fs.rm(dir, { recursive: true });
    });
  });

  describe('GrepTool', () => {
    it('searches for pattern in files', async () => {
      const dir = join(tmpdir(), `dw-grep-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, 'a.ts'), 'const foo = 1;\nconst bar = 2;');
      await fs.writeFile(join(dir, 'b.ts'), 'const foo = 3;');

      const tool = new GrepTool();
      const result = await tool.execute({ pattern: 'foo', path: dir });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toContain('a.ts');
        expect(result.content).toContain('b.ts');
      }
      await fs.rm(dir, { recursive: true });
    });

    it('returns empty content for no matches (not an error)', async () => {
      const dir = join(tmpdir(), `dw-grep-empty-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, 'a.ts'), 'hello');

      const tool = new GrepTool();
      const result = await tool.execute({ pattern: 'nonexistent_xyz', path: dir });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.content).toBe('');
      }
      await fs.rm(dir, { recursive: true });
    });

    it('LF file line numbers correct regardless of host EOL (regression: split on EOL)', async () => {
      // 旧实现用 EOL==='\r\n' 决定 sep,Windows 上读 LF 文件会把整段�?1 行�?      // 这里显式�?LF 文件（appendFile + '\n'），确保内容�?LF�?      const dir = join(tmpdir(), `dw-grep-lf-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
      const file = join(dir, 'multi.ts');
      await fs.writeFile(file, 'line1\nline2 MATCH\nline3\n', 'utf8');
      // 确认文件确实�?LF（防御�?�?fs.writeFile 不应该转换）
      const raw = await fs.readFile(file);
      expect(raw.includes('\r\n')).toBe(false);

      const tool = new GrepTool();
      const result = await tool.execute({ pattern: 'MATCH', path: file });
      expect(result.success).toBe(true);
      if (result.success) {
        // 行号必须�?2（line2 MATCH 在第 2 行），不�?1（旧 bug）�?        // 精确匹配: filename 后必须是 :2:，再后面才是 "line2 MATCH"�?        expect(result.content).toMatch(/multi\.ts:2:line2 MATCH/);
        expect(result.content).not.toMatch(/multi\.ts:1:/);
      }
      await fs.rm(dir, { recursive: true });
    });
  });
});
