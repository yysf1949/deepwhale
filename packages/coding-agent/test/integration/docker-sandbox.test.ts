/**
 * Docker sandbox integration test — 真跑 docker
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05). 默认 SKIPPED — DOCKER_INTEGRATION=1 启用
 * 且本机有 docker daemon 才跑. 不依赖本机 docker 的测, 看 docker-runner.test.ts.
 *
 * Gate 逻辑 (跟 Anthropic shim 模式一致):
 * 1. DOCKER_INTEGRATION=1 env 没设 → 整文件 1 个 it.skip, 后续不跑
 * 2. docker info 失败 (daemon 死 / docker 不在) → dockerReady=false → 3 个真测
 *    早返 (vitest "no expect" 不算 pass, 但 **it.runIf 同步条件** 决定是否收集,
 *    这里 DOCKER_INTEGRATION=1 已设但 docker 不可用 — 期望 fail 报"docker 未装"
 *    而不是静默 pass)
 *
 * 关键 (用户要求): 没 docker 时 **必须 SKIPPED**, 不假绿, 不 fail baseline.
 * 实现:
 * - DOCKER_INTEGRATION=1 未设 → 1 测 it.skip, 整文件 1 skipped (默认行为, 正确)
 * - DOCKER_INTEGRATION=1 设了, docker 不可用 → 显式 throw 'SKIP: docker not available'
 *   让 reviewer 一眼看到 (不是假绿 passed, 是显式 skip-style fail)
 *
 * 实践: CI 上 reviewer 想看 "docker 装了吗" → 看这测的输出. 本机没 docker
 * 也能正常跳过 (默认 DOCKER_INTEGRATION 未设).
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { DockerSandboxRunner } from '../../src/sandbox/docker-runner.js';
import { resolveSandboxRunnerFromEnv } from '../../src/sandbox/env-gate.js';

const execFileP = promisify(execFileCb);

async function dockerAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execFileP('docker', ['info'], { timeout: 5_000 });
    return stdout.toString().length > 0;
  } catch {
    return false;
  }
}

describe('docker-sandbox integration (DOCKER_INTEGRATION=1)', () => {
  if (process.env['DOCKER_INTEGRATION'] !== '1') {
    it.skip('SKIPPED: DOCKER_INTEGRATION env not set (set to 1 to run)', () => {
      // noop
    });
    return;
  }

  // DOCKER_INTEGRATION=1 已设. 用 describe-level check: dockerAvailable 是 async,
  // 顶层 describe 不能 await. 改用 it.runIf 配合 process.env 同步条件, 但 docker
  // 真不可用时, 单测内 throw 'SKIP' 让 reviewer 知道.
  // 注: 'SKIP' prefix 错误会被 vitest 当 fail — 但**只**在 DOCKER_INTEGRATION=1
  // 且 docker 不可用时才发生. 默认 (env 未设) 上面 it.skip 已走.

  it('真跑 node:22-alpine echo hello', async () => {
    if (!(await dockerAvailable())) {
      throw new Error('SKIP: docker not available on this host. CI: install docker or unset DOCKER_INTEGRATION.');
    }
    const runner = new DockerSandboxRunner({
      sandboxRoot: process.cwd(),
      image: 'node:22-alpine',
      network: 'none',
    });
    const r = await runner.run({
      command: 'node',
      args: ['-e', 'process.stdout.write("hello\\n")'],
      cwd: process.cwd(),
      timeoutMs: 30_000,
      stdoutCapBytes: 4 * 1024,
    });
    expect(r.ok).toBe(true);
    expect(r.stdoutTail).toBe('hello\n');
  }, 60_000);

  it('timeout 触发 → signal=SIGTERM/SIGKILL', async () => {
    if (!(await dockerAvailable())) {
      throw new Error('SKIP: docker not available on this host');
    }
    const runner = new DockerSandboxRunner({
      sandboxRoot: process.cwd(),
      image: 'node:22-alpine',
      network: 'none',
      defaultTimeoutMs: 1_000,
    });
    const r = await runner.run({
      command: 'node',
      args: ['-e', 'setTimeout(() => process.stdout.write("nope"), 30_000)'],
      cwd: process.cwd(),
      timeoutMs: 1_000,
      stdoutCapBytes: 4 * 1024,
    });
    expect(r.ok).toBe(false);
    expect(r.signal === 'SIGTERM' || r.signal === 'SIGKILL').toBe(true);
  }, 60_000);

  it('env gate 选 docker mode 真跑', async () => {
    if (!(await dockerAvailable())) {
      throw new Error('SKIP: docker not available on this host');
    }
    const runner = resolveSandboxRunnerFromEnv(
      { sandboxRoot: process.cwd() },
      { DEEPWHALE_SANDBOX: 'docker', DEEPWHALE_DOCKER_IMAGE: 'node:22-alpine' },
    );
    expect(runner.kind).toBe('docker');
    const r = await runner.run({
      command: 'node',
      args: ['-e', 'process.stdout.write("env-gate\\n")'],
      cwd: process.cwd(),
      timeoutMs: 30_000,
      stdoutCapBytes: 4 * 1024,
    });
    expect(r.ok).toBe(true);
    expect(r.stdoutTail).toBe('env-gate\n');
  }, 60_000);
});
