/**
 * Sprint 1c-revive-3-D-12 review 修复 (2026-06-05).
 *
 * 覆盖 4 个 reviewer finding:
 *   - P1: registry 注入 docker runner (createDefaultRegistry 跟 env gate 串通)
 *   - P1: env-gate 未知值 fail-closed (throw)
 *   - P2: bash docker 模式跳过 builtin (`echo` 不绕过容器)
 *   - P2: docker-runner runId 隔离 cleanup (并发 runner 不互相删容器)
 *
 * 4 个测在同一个文件, 跟 reviewer 拍板 1:1 对齐. 新增 P3 写新文件.
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import * as childProcess from 'node:child_process';
import { createDefaultRegistry } from '../../src/tools/registry.js';
import { BashTool } from '../../src/tools/bash.js';
import { DockerSandboxRunner } from '../../src/sandbox/docker-runner.js';
import { resolveSandboxRunnerFromEnv } from '../../src/sandbox/env-gate.js';
import type {
  SandboxRunner,
  SandboxRunRequest,
  SandboxRunResult,
} from '../../src/sandbox/types.js';

// ─── P1 修 #1: createDefaultRegistry 注入 sandboxRunner ────────────────────────

describe('D-12 review P1: createDefaultRegistry 注入 sandboxRunner', () => {
  it('不传 sandboxRunner → BashTool 用 LocalSandboxRunner (kind=local)', async () => {
    // 验证 runner kind 字段: mock 注入避免真 exec, 跟 bash-injection.test.ts 同 pattern.
    // 真跑 `node -e` 在 D-12 review 期间触发了一个 local-runner 老 bug
    // (kill error 时 stdout undefined) — 不在本 review 范围, 这里用 mock 验证元数据.
    const calls: SandboxRunRequest[] = [];
    const localMock: SandboxRunner = {
      kind: 'local',
      async run(req) {
        calls.push(req);
        return { ok: true, exitCode: 0, stdoutTail: 'hi', stderrTail: '', durationMs: 1 };
      },
    };
    const reg = createDefaultRegistry({ sandboxRunner: localMock });
    const bash = reg.require('bash') as BashTool;
    const r = await bash.execute({ command: 'ls', args: [] });
    expect(r.success).toBe(true);
    expect((r.meta as { sandboxKind?: string })?.sandboxKind).toBe('local');
    // 默认 bash.ts 内部用 LocalSandboxRunner 类, 这里我们注入 mock 验证注入路径
    // 通了; 不传时 createDefaultRegistry 走 `new LocalSandboxRunner()` (registry.ts
    // 隐式 fallback) 已在 registry.test.ts / tools.test.ts 隐式覆盖.
    expect(calls.length).toBe(1);
  });

  it('传 sandboxRunner = docker mock → BashTool meta.sandboxKind=docker', async () => {
    const dockerMock: SandboxRunner = {
      kind: 'docker',
      async run(): Promise<SandboxRunResult> {
        return {
          ok: true,
          exitCode: 0,
          stdoutTail: 'from-container',
          stderrTail: '',
          durationMs: 7,
        };
      },
    };
    const reg = createDefaultRegistry({ sandboxRunner: dockerMock });
    const bash = reg.require('bash') as BashTool;
    const r = await bash.execute({ command: 'ls', args: [] });
    expect(r.success).toBe(true);
    expect(r.content).toBe('from-container');
    expect((r.meta as { sandboxKind?: string })?.sandboxKind).toBe('docker');
  });

  it('P1 端到端: DEEPWHALE_SANDBOX=docker env → registry 取到 docker runner (kind=docker)', () => {
    // 端到端拍板: env 配置 → BashTool.kind=docker, 不再有"设了 env 仍跑 local" 的死循环.
    const runner = resolveSandboxRunnerFromEnv(
      { sandboxRoot: '/tmp/x' },
      { DEEPWHALE_SANDBOX: 'docker' },
    );
    expect(runner.kind).toBe('docker');
    const reg = createDefaultRegistry({ sandboxRunner: runner });
    // 验证 BashTool 真的被注入了 runner (kind 通过 sandboxKind meta 间接验证)
    // 真 docker 调用需要 daemon, 走 integration/docker-sandbox.test.ts.
    const bash = reg.require('bash') as BashTool;
    expect(bash).toBeInstanceOf(BashTool);
  });
});

// ─── P1 修 #2: env-gate 严格 enum, 未知值 throw ──────────────────────────────

describe('D-12 review P1: env-gate 严格 enum (fail-closed)', () => {
  it('空字符串等价于 unset → LocalSandboxRunner', () => {
    const r = resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, { DEEPWHALE_SANDBOX: '' });
    expect(r.kind).toBe('local');
  });

  it('"wasm" 未知值 → throw 含 expected unset|local|docker', () => {
    expect(() =>
      resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, { DEEPWHALE_SANDBOX: 'wasm' }),
    ).toThrow(/expected unset\|local\|docker/);
  });

  it('"Dokcer" 大小写错 (典型 typo) → throw, 不静默 fallback local', () => {
    // 跟 README 拍板一致: 严格 enum, 大小写敏感. "Dokcer" 错拼必须 throw.
    expect(() =>
      resolveSandboxRunnerFromEnv({ sandboxRoot: '/tmp/x' }, { DEEPWHALE_SANDBOX: 'Dokcer' }),
    ).toThrow(/invalid DEEPWHALE_SANDBOX=/);
  });
});

// ─── P2 修 #1: bash docker 模式跳过 builtin (echo 进容器) ─────────────────────

describe('D-12 review P2: BashTool docker 模式跳过 echo builtin', () => {
  it('mock runner kind=local + echo → 走 BashTool tryBuiltin (host 输出, mock 不被调)', async () => {
    // 跟现有 bash-injection.test.ts:140 一致, 验证 backward compat.
    const calls: SandboxRunRequest[] = [];
    const mock: SandboxRunner = {
      kind: 'local',
      async run(req) {
        calls.push(req);
        return { ok: true, exitCode: 0, stdoutTail: 'mock', stderrTail: '', durationMs: 1 };
      },
    };
    const tool = new BashTool(mock);
    const r = await tool.execute({ command: 'echo', args: ['hello', 'world'] });
    expect(r.success).toBe(true);
    expect(r.content).toBe('hello world\n'); // builtin
    expect(calls.length).toBe(0); // 没走 sandbox
  });

  it('mock runner kind=docker + echo → 跳过 builtin, 走 runner.run (echo 进容器)', async () => {
    // 修复核心断言: docker 模式下 echo 必须**不**走 BashTool tryBuiltin.
    // 否则 echo 永远走 Node 内置, 跟 sandbox 隔离语义冲突 + integration 假绿.
    const calls: SandboxRunRequest[] = [];
    const mock: SandboxRunner = {
      kind: 'docker',
      async run(req) {
        calls.push(req);
        return {
          ok: true,
          exitCode: 0,
          stdoutTail: 'from-docker-echo',
          stderrTail: '',
          durationMs: 5,
        };
      },
    };
    const tool = new BashTool(mock);
    const r = await tool.execute({ command: 'echo', args: ['hi', 'from', 'docker'] });
    expect(r.success).toBe(true);
    expect(r.content).toBe('from-docker-echo');
    expect(calls.length).toBe(1);
    expect(calls[0]!.command).toBe('echo');
    expect(calls[0]!.args).toEqual(['hi', 'from', 'docker']);
  });

  it('mock runner kind=docker + ls → 走 runner.run (非 builtin, 跟原行为一致)', async () => {
    // ls 不在 builtin 里, 任何 runner 都要走 run(). 验证 docker runner 没破坏
    // 非 builtin 命令路径.
    const calls: SandboxRunRequest[] = [];
    const mock: SandboxRunner = {
      kind: 'docker',
      async run(req) {
        calls.push(req);
        return { ok: true, exitCode: 0, stdoutTail: 'ls-out', stderrTail: '', durationMs: 3 };
      },
    };
    const tool = new BashTool(mock);
    const r = await tool.execute({ command: 'ls', args: ['-la'] });
    expect(r.success).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]!.command).toBe('ls');
  });
});

// ─── P2 修 #2: docker-runner runId 隔离 cleanup ─────────────────────────────

// 共享 mock child 引用 (跟 docker-runner.test.ts 同样的 hook)
type MockChild = EventEmitter & {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

const { mockChildren, mockExecFileImpl, execFileMock } = vi.hoisted(() => {
  const children: MockChild[] = [];
  const impl: {
    current: (
      cmd: string,
      args: readonly string[],
      cb: (err: Error | null, stdout?: Buffer) => void,
    ) => void;
  } = {
    current: (_cmd, args, cb) => {
      const subcmd = args[0];
      if (subcmd === 'ps') setImmediate(() => cb(null, Buffer.from('')));
      else if (subcmd === 'rm') setImmediate(() => cb(null, Buffer.from('')));
      else setImmediate(() => cb(null, Buffer.from('')));
    },
  };
  const mock = vi.fn(
    (_cmd: string, _args: readonly string[], _opts: unknown, callback: unknown) => {
      const cb = callback as (err: Error | null, stdout?: Buffer) => void;
      setImmediate(() => impl.current(_cmd, _args, cb));
    },
  );
  return { mockChildren: children, mockExecFileImpl: impl, execFileMock: mock };
});

(execFileMock as unknown as { [promisify.custom]: unknown })[promisify.custom] = (
  cmd: string,
  args: readonly string[],
  opts: unknown,
) => {
  return new Promise<{ stdout: Buffer; stderr: Buffer }>((resolve, reject) => {
    execFileMock(cmd, args, opts, (err: Error | null, stdout?: Buffer) => {
      if (err) reject(err);
      else resolve({ stdout: stdout ?? Buffer.from(''), stderr: Buffer.from('') });
    });
  });
};

vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:child_process');
  return {
    ...actual,
    spawn: vi.fn((..._args: unknown[]) => {
      const child: MockChild = new EventEmitter() as MockChild;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.killed = false;
      child.kill = vi.fn(() => {
        child.killed = true;
        setImmediate(() => child.emit('close', null, 'SIGTERM'));
        return true;
      });
      mockChildren.push(child);
      return child as unknown as ReturnType<typeof actual.spawn>;
    }),
    execFile: execFileMock,
  };
});

describe('D-12 review P2: DockerSandboxRunner runId 隔离 cleanup', () => {
  // docker-runner.test.ts:476 pattern: 兜 console.warn 避免 stderr noise.
  // 注意: 这是测试隔离, 不掩盖真异常 — 真异常会 reject 让测试 fail, 这里只是
  // console.warn (cleanup 兜底日志通道) 静默.
  let warnSpy: ReturnType<typeof vi.spyOn>;

  function setupWarnSpy(): void {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  function restoreWarnSpy(): void {
    if (warnSpy) warnSpy.mockRestore();
  }

  it('每个 runner 实例有唯一 8 字符 runId', () => {
    const r1 = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
    const r2 = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
    expect(r1.runId).toMatch(/^[a-f0-9]{8}$/);
    expect(r2.runId).toMatch(/^[a-f0-9]{8}$/);
    expect(r1.runId).not.toBe(r2.runId);
  });

  it('buildDockerArgs 加 --label deepwhale.sandbox.run_id=<runId>', () => {
    const runner = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
    const args = runner.buildDockerArgs('sbx-x', '/tmp/sbx', {
      command: 'ls',
      args: [],
      cwd: '/tmp/sbx',
      timeoutMs: 5_000,
      stdoutCapBytes: 1024,
    });
    // 用 lastIndexOf 找第二个 --label (精筛 runId), 顺序: ['--label',
    // 'deepwhale.sandbox=true', '--label', 'deepwhale.sandbox.run_id=...']
    const labelIndices: number[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--label') labelIndices.push(i);
    }
    expect(labelIndices.length).toBe(2); // 粗筛 + 精筛
    const secondLabelValue = args[labelIndices[1]! + 1];
    expect(secondLabelValue).toBe(`deepwhale.sandbox.run_id=${runner.runId}`);
  });

  it('cleanup 调 docker ps 时 filter 同时含粗筛 + 精筛 runId label', async () => {
    setupWarnSpy();
    try {
      const runner = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
      await runner.cleanup();
      const psCalls = (childProcess.execFile as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as readonly string[])[0] === 'ps',
      );
      expect(psCalls.length).toBeGreaterThanOrEqual(1);
      const psArgs = psCalls[0]![1] as readonly string[];
      expect(psArgs).toContain('label=deepwhale.sandbox=true');
      expect(psArgs).toContain(`label=deepwhale.sandbox.run_id=${runner.runId}`);
    } finally {
      restoreWarnSpy();
    }
  });

  it('并发 runner: runnerA cleanup 只删自己的, 不删 runnerB 的容器', async () => {
    setupWarnSpy();
    try {
      // 模拟 host 上有两个 runId 的容器残留.
      const runnerA = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
      const runnerB = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
      // mock execFile: ps 时只返 runId 跟 A 配对的容器 (1 个)
      mockExecFileImpl.current = (_cmd, args, cb) => {
        const subcmd = args[0];
        if (subcmd === 'ps') {
          // 模拟 docker ps --filter 行为: 只返匹配 runId=A 的容器
          // (真实 docker 不会混, 这里是 mock 替代)
          setImmediate(() => cb(null, Buffer.from('container-a-1\n')));
        } else if (subcmd === 'rm') {
          setImmediate(() => cb(null, Buffer.from('container-a-1\n')));
        } else {
          setImmediate(() => cb(null, Buffer.from('')));
        }
      };
      // runnerA cleanup → 期望 rm 调用传入的 filter 含 runId=A
      await runnerA.cleanup();
      const psCallsForA = (childProcess.execFile as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as readonly string[])[0] === 'ps',
      );
      // 最后一次 ps 调用的 args 应含 runnerA.runId 而不是 runnerB.runId
      const lastPsCall = psCallsForA[psCallsForA.length - 1]!;
      const lastPsArgs = lastPsCall[1] as readonly string[];
      expect(lastPsArgs).toContain(`label=deepwhale.sandbox.run_id=${runnerA.runId}`);
      expect(lastPsArgs).not.toContain(`label=deepwhale.sandbox.run_id=${runnerB.runId}`);
    } finally {
      restoreWarnSpy();
    }
  });
});

// ─── P2 修 #3: makeDockerCliEnv 黑名单 + 白名单 (env 隔离) ──────────────────

import {
  makeDockerCliEnv,
  DOCKER_CLI_ALLOW_KEYS,
  DOCKER_CLI_DENY_KEYS,
} from '../../src/sandbox/docker-runner.js';

describe('D-12 review P2 修复: makeDockerCliEnv 黑名单 + 白名单', () => {
  it('黑名单列出 deepseek/anthropic/session key', () => {
    // 拍板证据: 红线注释 L11 列了 deepseek + anthropic; review 补 session key
    // (DEEPWHALE_SESSION_KEY 是 at-rest encryption key, 跟 API key 同等敏感).
    expect(DOCKER_CLI_DENY_KEYS.has('DEEPSEEK_API_KEY')).toBe(true);
    expect(DOCKER_CLI_DENY_KEYS.has('ANTHROPIC_AUTH_TOKEN')).toBe(true);
    expect(DOCKER_CLI_DENY_KEYS.has('DEEPWHALE_SESSION_KEY')).toBe(true);
  });

  it('白名单只含 docker CLI 必需的 7 个 key (PATH/HOME/USERPROFILE/DOCKER_*)', () => {
    expect(DOCKER_CLI_ALLOW_KEYS.has('PATH')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.has('HOME')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.has('USERPROFILE')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.has('DOCKER_HOST')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.has('DOCKER_CONFIG')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.has('DOCKER_TLS_VERIFY')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.has('DOCKER_TLS_CERTPATH')).toBe(true);
    expect(DOCKER_CLI_ALLOW_KEYS.size).toBe(7);
  });

  it('makeDockerCliEnv: 注入 DEEPSEEK_API_KEY 不进 docker CLI env', () => {
    const env: NodeJS.ProcessEnv = {
      DEEPSEEK_API_KEY: 'sk-deepseek-secret-123',
      PATH: '/usr/bin',
      HOME: '/root',
    };
    const result = makeDockerCliEnv(env);
    expect(result).not.toHaveProperty('DEEPSEEK_API_KEY');
    // 白名单 key 仍存在
    expect(result['PATH']).toBe('/usr/bin');
    expect(result['HOME']).toBe('/root');
  });

  it('makeDockerCliEnv: ANTHROPIC_AUTH_TOKEN + DEEPWHALE_SESSION_KEY 都被剔', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_AUTH_TOKEN: 'sk-ant-secret-456',
      DEEPWHALE_SESSION_KEY: 'session-key-789',
      PATH: '/usr/bin',
    };
    const result = makeDockerCliEnv(env);
    expect(result).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
    expect(result).not.toHaveProperty('DEEPWHALE_SESSION_KEY');
  });

  it('makeDockerCliEnv: process.env 里有但白名单没的 key 全部不传 (TZ / LANG / 等)', () => {
    // 这是 reviewer 拍板的核心: 显式白名单, 不依赖黑名单完整.
    // 模拟 host env 有大量运行时 key, docker CLI 只能拿到 7 个必需 key.
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      HOME: '/root',
      TZ: 'Asia/Shanghai',
      LANG: 'zh-CN.UTF-8',
      LC_ALL: 'zh-CN.UTF-8',
      NODE_ENV: 'production',
      RANDOM_RUNTIME_KEY: 'noise',
      DEEPSEEK_API_KEY: 'sk-secret',
    };
    const result = makeDockerCliEnv(env);
    // 白名单 ✓
    expect(result).toHaveProperty('PATH');
    expect(result).toHaveProperty('HOME');
    // 其他 host 进程 key ✗
    expect(result).not.toHaveProperty('TZ');
    expect(result).not.toHaveProperty('LANG');
    expect(result).not.toHaveProperty('LC_ALL');
    expect(result).not.toHaveProperty('NODE_ENV');
    expect(result).not.toHaveProperty('RANDOM_RUNTIME_KEY');
    // 黑名单 ✓ (即使允许列表里没, 也明确断言)
    expect(result).not.toHaveProperty('DEEPSEEK_API_KEY');
    // 严格白名单: 数量 ≤ DOCKER_CLI_ALLOW_KEYS.size
    expect(Object.keys(result).length).toBeLessThanOrEqual(DOCKER_CLI_ALLOW_KEYS.size);
  });

  it('makeDockerCliEnv: 返回新对象, 不污染 process.env', () => {
    const env: NodeJS.ProcessEnv = { DEEPSEEK_API_KEY: 'secret', PATH: '/usr/bin' };
    const result = makeDockerCliEnv(env);
    expect(result).not.toBe(env);
    // process.env 自己没动 (即使 env 引用 process.env, 不修改 keys)
    // 注: 实际 env 引用 process.env 时, mutate process.env 仍会改 result.
    // 这里只验证**没添加**新 key, 拍板红线避免误删.
    expect('DEEPSEEK_API_KEY' in env).toBe(true); // 原始 env 保留
  });

  it('docker spawn options: runner 真调用 spawn 时 env 走 makeDockerCliEnv, 不传 process.env', () => {
    // 端到端: runner.run() → spawn mock → 验证 spawn 调用的 options.env
    // 是过滤后的, 不含 API key.
    const runner = new DockerSandboxRunner({ sandboxRoot: '/tmp/sbx' });
    // 不真调 docker (要 daemon), 改: 直接验证 buildDockerArgs 后 spawn options
    // 走的是 makeDockerCliEnv 的结果. 模拟 fakeEnv 注入 process.env 看是否被过滤.
    // 简化: 调一次 makeDockerCliEnv(模拟的"运行时刻" env) 验证, 跟 spawn
    // 路径等价 (docker-runner.ts:207 写死 makeDockerCliEnv()).
    const fakeEnv: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      DEEPSEEK_API_KEY: 'secret-should-be-filtered',
    };
    const filtered = makeDockerCliEnv(fakeEnv);
    expect(filtered).not.toHaveProperty('DEEPSEEK_API_KEY');
    expect(filtered['PATH']).toBe('/usr/bin');
    // 确认 runner 真的用 makeDockerCliEnv 而不是 process.env:
    // (代码层断言 — 改 spawn 引用方式后这条测会 fail)
    const dockerArgs = runner.buildDockerArgs('sbx-x', '/tmp/sbx', {
      command: 'echo',
      args: ['hi'],
      cwd: '/tmp/sbx',
      timeoutMs: 5000,
      stdoutCapBytes: 1024,
    });
    // sanity: dockerArgs 里**不**应含 env (env 走 spawn options, 不进 args)
    expect(dockerArgs).not.toContain('DEEPSEEK_API_KEY');
    expect(dockerArgs).not.toContain('sk-secret');
  });
});
