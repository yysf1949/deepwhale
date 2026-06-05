/**
 * SandboxRunner types — 形状/默认值/枚举 单测
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SANDBOX_DEFAULTS,
  type SandboxRunRequest,
  type SandboxRunResult,
  type SandboxRunner,
} from '../../src/sandbox/types.js';

describe('sandbox/types', () => {
  describe('DEFAULT_SANDBOX_DEFAULTS', () => {
    it('defaultTimeoutMs = 60_000 (跟 BashTool 现状一致)', () => {
      expect(DEFAULT_SANDBOX_DEFAULTS.defaultTimeoutMs).toBe(60_000);
    });

    it('defaultStdoutCapBytes = 4KB (跟 verify-runner 一致)', () => {
      expect(DEFAULT_SANDBOX_DEFAULTS.defaultStdoutCapBytes).toBe(4 * 1024);
    });

    it('sandboxRoot 是空字符串占位 — BashTool ctor 必须显式覆盖', () => {
      // 拍板 (D-12): sandboxRoot 必填. DEFAULT_SANDBOX_DEFAULTS 是 partial fill,
      // 真实值由 BashTool ctor 拿 process.cwd() 覆盖. 防止 caller 误用默认值.
      expect(DEFAULT_SANDBOX_DEFAULTS.sandboxRoot).toBe('');
    });
  });

  describe('SandboxRunner interface 形状', () => {
    it('实现必须带 readonly kind: "local" | "docker"', () => {
      const local: SandboxRunner = { kind: 'local', run: async () => ({} as SandboxRunResult) };
      const docker: SandboxRunner = { kind: 'docker', run: async () => ({} as SandboxRunResult) };
      expect(local.kind).toBe('local');
      expect(docker.kind).toBe('docker');
    });

    it('cleanup 是可选方法 — LocalSandboxRunner 不需要', () => {
      // 类型层: 不带 cleanup 字段仍满足 interface
      const minimal: SandboxRunner = { kind: 'local', run: async () => ({} as SandboxRunResult) };
      expect(minimal.cleanup).toBeUndefined();
    });
  });

  describe('SandboxRunRequest 形状', () => {
    it('最小可用 shape: command + args + cwd + timeout + stdoutCapBytes', () => {
      const req: SandboxRunRequest = {
        command: 'ls',
        args: ['-la'],
        cwd: '/tmp',
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      };
      expect(req.command).toBe('ls');
      expect(req.args).toEqual(['-la']);
      expect(req.env).toBeUndefined(); // optional
    });

    it('env 是可选 — LocalSandboxRunner 不传时走 process.env', () => {
      const req: SandboxRunRequest = {
        command: 'node',
        args: ['-v'],
        cwd: '/tmp',
        timeoutMs: 1_000,
        stdoutCapBytes: 256,
        env: { FOO: 'bar' }, // 可选, 显式给
      };
      expect(req.env).toEqual({ FOO: 'bar' });
    });
  });

  describe('SandboxRunResult 形状', () => {
    it('成功路径: ok=true, exitCode=0, signal undefined', () => {
      const r: SandboxRunResult = {
        ok: true,
        exitCode: 0,
        stdoutTail: 'hello\n',
        stderrTail: '',
        durationMs: 42,
      };
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.signal).toBeUndefined();
      expect(r.warning).toBeUndefined();
    });

    it('timeout 路径: ok=false, signal=SIGTERM, exitCode=null', () => {
      const r: SandboxRunResult = {
        ok: false,
        exitCode: null,
        stdoutTail: '',
        stderrTail: '',
        durationMs: 60_000,
        signal: 'SIGTERM',
      };
      expect(r.ok).toBe(false);
      expect(r.signal).toBe('SIGTERM');
    });

    it('cleanup 失败: warning 字段填 stderr 摘要', () => {
      const r: SandboxRunResult = {
        ok: true,
        exitCode: 0,
        stdoutTail: '',
        stderrTail: '',
        durationMs: 10,
        warning: 'docker rm -f failed: container not found',
      };
      expect(r.warning).toMatch(/docker rm -f failed/);
    });
  });
});
