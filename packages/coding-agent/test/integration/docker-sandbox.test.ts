/**
 * Docker sandbox integration test — 真跑 docker
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05). 默认 SKIPPED — DOCKER_INTEGRATION=1 启用
 * 且本机有 docker daemon 才跑. 不依赖本机 docker 的测, 看 docker-runner.test.ts.
 *
 * Gate 逻辑 (跟 Anthropic shim 模式一致):
 * 1. DOCKER_INTEGRATION=1 env 没设 → SKIPPED
 * 2. `command -v docker` 找不到 → SKIPPED (不假绿, 不 fail baseline)
 * 3. `docker info` 失败 (daemon 死) → SKIPPED
 * 4. 都过 → 跑 3 个真场景: echo / timeout / forbidden
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
    // 跳过后续所有测
    return;
  }

  it('docker info (gate 验证)', async () => {
    const ok = await dockerAvailable();
    if (!ok) {
      // 不假绿, 直接 fail 让 reviewer 知道 docker 不可用
      throw new Error('docker not available or daemon not running. Install docker or skip this test.');
    }
    expect(ok).toBe(true);
  });

  it('真跑 node:22-alpine echo hello', async () => {
    if (!(await dockerAvailable())) {
      throw new Error('docker not available');
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
    // 1. Docker 镜像需先 pull, CI 上可能慢 — 这是为啥用 30s timeout
  }, 60_000);

  it('timeout 触发 → signal=SIGKILL', async () => {
    if (!(await dockerAvailable())) {
      throw new Error('docker not available');
    }
    const runner = new DockerSandboxRunner({
      sandboxRoot: process.cwd(),
      image: 'node:22-alpine',
      network: 'none',
      defaultTimeoutMs: 1_000, // 1s timeout 让 sleep 30s 必超时
    });
    const r = await runner.run({
      command: 'node',
      args: ['-e', 'setTimeout(() => process.stdout.write("nope"), 30_000)'],
      cwd: process.cwd(),
      timeoutMs: 1_000,
      stdoutCapBytes: 4 * 1024,
    });
    expect(r.ok).toBe(false);
    // docker stop → docker kill, 最坏 SIGKILL
    expect(r.signal === 'SIGTERM' || r.signal === 'SIGKILL').toBe(true);
  }, 60_000);

  it('env gate 选 docker mode 真跑', async () => {
    if (!(await dockerAvailable())) {
      throw new Error('docker not available');
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
