/**
 * resolveSandboxRunnerFromEnv — env gate helper 单测
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05).
 */

import { describe, expect, it } from 'vitest';
import { resolveSandboxRunnerFromEnv } from '../../src/sandbox/env-gate.js';
import { LocalSandboxRunner } from '../../src/sandbox/local-runner.js';
import { DockerSandboxRunner } from '../../src/sandbox/docker-runner.js';

describe('resolveSandboxRunnerFromEnv', () => {
  it('空 env → LocalSandboxRunner (默认)', () => {
    const r = resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, {});
    expect(r).toBeInstanceOf(LocalSandboxRunner);
    expect(r.kind).toBe('local');
  });

  it('DEEPWHALE_SANDBOX=local → LocalSandboxRunner', () => {
    const r = resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, { DEEPWHALE_SANDBOX: 'local' });
    expect(r.kind).toBe('local');
  });

  it('DEEPWHALE_SANDBOX=docker → DockerSandboxRunner', () => {
    const r = resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, { DEEPWHALE_SANDBOX: 'docker' });
    expect(r).toBeInstanceOf(DockerSandboxRunner);
    expect(r.kind).toBe('docker');
  });

  it('DEEPWHALE_SANDBOX=其他值 → fallback LocalSandboxRunner (不抛)', () => {
    const r = resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, { DEEPWHALE_SANDBOX: 'wasm' });
    expect(r.kind).toBe('local');
  });

  it('DEEPWHALE_DOCKER_IMAGE=alpine:3.20 + docker 模式 → runner 用 alpine:3.20', () => {
    const r = resolveSandboxRunnerFromEnv(
      { sandboxRoot: '/tmp/x' },
      { DEEPWHALE_SANDBOX: 'docker', DEEPWHALE_DOCKER_IMAGE: 'alpine:3.20' },
    ) as DockerSandboxRunner;
    // 内部 image 字段验证
    const args = r.buildDockerArgs('sbx-test', '/tmp/x', {
      command: 'ls',
      args: [],
      cwd: '/tmp/x',
      timeoutMs: 1_000,
      stdoutCapBytes: 1024,
    });
    expect(args).toContain('alpine:3.20');
  });

  it('DEEPWHALE_DOCKER_NETWORK=bridge + docker 模式 → bridge', () => {
    const r = resolveSandboxRunnerFromEnv(
      { sandboxRoot: '/tmp/x' },
      { DEEPWHALE_SANDBOX: 'docker', DEEPWHALE_DOCKER_NETWORK: 'bridge' },
    ) as DockerSandboxRunner;
    const args = r.buildDockerArgs('sbx-test', '/tmp/x', {
      command: 'ls',
      args: [],
      cwd: '/tmp/x',
      timeoutMs: 1_000,
      stdoutCapBytes: 1024,
    });
    expect(args[args.indexOf('--network') + 1]).toBe('bridge');
  });
});
