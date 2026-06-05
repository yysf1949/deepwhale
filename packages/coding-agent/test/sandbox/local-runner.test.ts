/**
 * LocalSandboxRunner — execFile 包装层单测
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05). 跟 BashTool 现状行为一致:
 * - 走 execFile 跑真命令
 * - stdout/stderr cap 末尾 N bytes
 * - timeout 走 execFile 自身的 timeout 选项
 *
 * 测试策略: 走 Node child_process 真跑 (e.g. `node -e`), 不 mock execFile —
 * LocalSandboxRunner 本身就是个薄包装, mock 反而测不到真行为. 跑 `node` / `echo` (走
 * execFile 不是 builtin) 跨平台.
 */

import { describe, expect, it } from 'vitest';
import { LocalSandboxRunner } from '../../src/sandbox/local-runner.js';
import type { SandboxRunRequest } from '../../src/sandbox/types.js';

describe('LocalSandboxRunner', () => {
  const runner = new LocalSandboxRunner();
  const cwd = process.cwd();

  describe('基础 exec', () => {
    it('跑 `node -e` 打印 hello, 收 stdout', async () => {
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-e', 'process.stdout.write("hello\\n")'],
        cwd,
        timeoutMs: 5_000,
        stdoutCapBytes: 4 * 1024,
      };
      const r = await runner.run(req);
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.stdoutTail).toBe('hello\n');
      expect(r.signal).toBeUndefined();
    });

    it('非 0 exit code 走 ok=false, exitCode 保留', async () => {
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-e', 'process.exit(7)'],
        cwd,
        timeoutMs: 5_000,
        stdoutCapBytes: 4 * 1024,
      };
      const r = await runner.run(req);
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(7);
    });

    it('stderr 进 stderrTail, 不进 stdout', async () => {
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-e', 'process.stderr.write("oops\\n")'],
        cwd,
        timeoutMs: 5_000,
        stdoutCapBytes: 4 * 1024,
      };
      const r = await runner.run(req);
      expect(r.ok).toBe(true);
      expect(r.stdoutTail).toBe('');
      expect(r.stderrTail).toBe('oops\n');
    });
  });

  describe('stdout cap', () => {
    it('输出 > cap → 保留尾 cap bytes', async () => {
      const big = 'A'.repeat(8000);
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-e', `process.stdout.write("${big}")`],
        cwd,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      };
      const r = await runner.run(req);
      expect(r.ok).toBe(true);
      expect(r.stdoutTail.length).toBe(1024);
      // 末 1024 全是 'A'
      expect(r.stdoutTail).toBe('A'.repeat(1024));
    });
  });

  describe('timeout', () => {
    it('命令超时 → signal=SIGTERM, exitCode=null', async () => {
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 10_000)'], // 睡 10s
        cwd,
        timeoutMs: 200, // 200ms 后 execFile 内部 kill
        stdoutCapBytes: 4 * 1024,
      };
      const r = await runner.run(req);
      expect(r.ok).toBe(false);
      // execFile 内置 timeout 走 SIGTERM
      expect(r.signal).toBe('SIGTERM');
      // exitCode 不一定 null (execFile 行为因 Node 版本略有差异, 但 signal 必须有)
    });
  });

  describe('env', () => {
    it('env 注入到子进程, 覆盖 process.env 同名 key', async () => {
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-e', 'process.stdout.write(process.env.MY_TEST_VAR ?? "missing")'],
        cwd,
        timeoutMs: 5_000,
        stdoutCapBytes: 4 * 1024,
        env: { MY_TEST_VAR: 'deepwhale-sbx' },
      };
      const r = await runner.run(req);
      expect(r.ok).toBe(true);
      expect(r.stdoutTail).toBe('deepwhale-sbx');
    });
  });

  describe('cleanup', () => {
    it('cleanup() 是 noop, 不抛', async () => {
      await expect(runner.cleanup?.()).resolves.toBeUndefined();
    });
  });

  describe('kind', () => {
    it('kind = "local"', () => {
      expect(runner.kind).toBe('local');
    });
  });
});
