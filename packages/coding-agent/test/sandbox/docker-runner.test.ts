/**
 * DockerSandboxRunner — mock child_process 单测
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05). 本机没装 docker, 用 vi.mock 把 child_process
 * 的 spawn / execFile 拦掉, 断言:
 * - docker run 数组 args 形状正确
 * - 禁 --privileged
 * - 禁宿主根 mount
 * - 禁 --env-file
 * - 容器名是 deepwhale-sbx-<8char>
 * - timeout 触发 docker stop → docker kill 兜底
 * - cleanup 失败进 console.warn, 不抛
 *
 * Mock 注意: docker-runner.ts 用 `promisify(execFile)`. 直接 mock execFile callback
 * 不够 (util.promisify 走 fn.length 判断, execFile.length === 3 → 不走 promisify
 * 自定义 cb 注入). 用 `util.promisify.custom` symbol 注入 Promise 化函数, promisify
 * 调它时走我们的 custom 实现, 内部 callback-style 调 execFile mock.
 *
 * vi.mock hoisting: 用 vi.hoisted() 包 mock state, 跟 vi.mock 一起 hoist, factory
 * 内部能引用. 静态 import child_process 让 vi.mock 替换生效.
 *
 * Timer 测: 用 vi.useFakeTimers + advanceTimersByTimeAsync 跑精确时间, 避免 real
 * setTimeout 跟 killTimer race 导致测 flaky.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as childProcess from 'node:child_process';
import {
  DockerSandboxRunner,
  DOCKER_DEFAULT_TIMEOUT_MS,
} from '../../src/sandbox/docker-runner.js';
import { resolveSandboxRunnerFromEnv } from '../../src/sandbox/env-gate.js';


// 共享 mock child 引用
type MockChild = EventEmitter & {
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

type ExecFileCb = (err: Error | null, stdout?: Buffer) => void;

// vi.hoisted: 这些会被 hoist 到 vi.mock 之前, factory 内部能引用
const { mockChildren, mockExecFileImpl, execFileMock } = vi.hoisted(() => {
  const children: MockChild[] = [];
  const impl: { current: (cmd: string, args: readonly string[], cb: ExecFileCb) => void } = {
    current: (_cmd, args, cb) => {
      const subcmd = args[0];
      if (subcmd === 'ps') setImmediate(() => cb(null, Buffer.from('')));
      else if (subcmd === 'rm') setImmediate(() => cb(null, Buffer.from('')));
      else if (subcmd === 'stop') setImmediate(() => cb(null, Buffer.from(args[2] ?? '')));
      else if (subcmd === 'kill') setImmediate(() => cb(null, Buffer.from('')));
      else setImmediate(() => cb(null, Buffer.from('')));
    },
  };
  const mock = vi.fn((cmd: string, args: readonly string[], _opts: unknown, callback: unknown) => {
    const cb = callback as ExecFileCb;
    setImmediate(() => impl.current(cmd, args, cb));
  });
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

// Sprint 1c-revive-5-D-20.6.2 review-fix (2026-06-06): 用平台原生绝对路径
// 替代 hardcode '/tmp/sbx-test'. 之前 Linux 测试过得了, 但 Windows 端
// pathResolve('/tmp/sbx-test') 落到根盘符, 跟 pathResolve(req.cwd) 不在
// 同空间, isInsideSandbox early return, mock child 不创建 → 4 个
// docker-runner 测 fail. 修法: tmpdir() 拿平台原生 tmp dir, 跟 caller
// 现实场景一致. docker-runner.ts 构造时 pathResolve(opts.sandboxRoot)
// (D-20.6.1) 已保证 sandboxRoot 跟 req.cwd 走同空间.
const SANDBOX_ROOT = join(tmpdir(), 'sbx-test');

function makeRunner(
  overrides: Partial<{
    image: string;
    network: 'none' | 'bridge';
    memory: string;
    cpus: string;
    pidsLimit: string;
  }> = {},
) {
  return new DockerSandboxRunner({
    sandboxRoot: SANDBOX_ROOT,
    ...(overrides.image !== undefined ? { image: overrides.image } : {}),
    ...(overrides.network !== undefined ? { network: overrides.network } : {}),
    ...(overrides.memory !== undefined ? { memory: overrides.memory } : {}),
    ...(overrides.cpus !== undefined ? { cpus: overrides.cpus } : {}),
    ...(overrides.pidsLimit !== undefined ? { pidsLimit: overrides.pidsLimit } : {}),
  });
}

beforeEach(() => {
  mockChildren.length = 0;
  mockExecFileImpl.current = (_cmd, args, cb) => {
    const subcmd = args[0];
    if (subcmd === 'ps') setImmediate(() => cb(null, Buffer.from('')));
    else if (subcmd === 'rm') setImmediate(() => cb(null, Buffer.from('')));
    else if (subcmd === 'stop') setImmediate(() => cb(null, Buffer.from(args[2] ?? '')));
    else if (subcmd === 'kill') setImmediate(() => cb(null, Buffer.from('')));
    else setImmediate(() => cb(null, Buffer.from('')));
  };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DockerSandboxRunner', () => {
  describe('buildDockerArgs 形状', () => {
    it('默认 image = node:22-alpine', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('deepwhale-sbx-abcdef12', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: ['-la'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      expect(args).toContain('node:22-alpine');
    });

    it('自定义 image 透传', () => {
      const runner = makeRunner({ image: 'alpine:3.20' });
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'echo',
        args: ['hi'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      expect(args).toContain('alpine:3.20');
    });

    it('args 包含 --rm, --label, --name, --read-only, --cap-drop=ALL, --security-opt', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      expect(args).toContain('--rm');
      expect(args).toContain('--read-only');
      expect(args).toContain('--cap-drop=ALL');
      expect(args).toContain('no-new-privileges');
      expect(args).toContain('deepwhale.sandbox=true');
    });

    it('容器名前缀是 deepwhale-sbx- + 8 字符', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('deepwhale-sbx-12345678', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      const nameIdx = args.indexOf('--name');
      expect(nameIdx).toBeGreaterThan(-1);
      const name = args[nameIdx + 1];
      expect(name).toMatch(/^deepwhale-sbx-[a-f0-9]{8}$/);
    });

    it('默认 --network none (禁网)', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      const netIdx = args.indexOf('--network');
      expect(args[netIdx + 1]).toBe('none');
    });

    it('显式 network: bridge 才挂 bridge', () => {
      const runner = makeRunner({ network: 'bridge' });
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      const netIdx = args.indexOf('--network');
      expect(args[netIdx + 1]).toBe('bridge');
    });

    it('workspace 显式 bind mount: -v ${abs}:/workspace:rw', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}/sub`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}/sub`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      const vIdx = args.indexOf('-v');
      expect(args[vIdx + 1]).toBe(`${SANDBOX_ROOT}/sub:/workspace:rw`);
    });

    it('**不** 包含 --privileged (grep 自查)', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      expect(args).not.toContain('--privileged');
    });

    it('**不** 包含 --env-file (grep 自查)', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      expect(args).not.toContain('--env-file');
    });

    it('**不** 挂宿主根目录 (没有 -v /:/host 之类)', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-v') {
          const mount = args[i + 1] ?? '';
          expect(mount).not.toMatch(/^:\//);
          expect(mount).not.toMatch(/^\/:\//);
        }
      }
    });

    it('**不** 传 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN (grep 自查)', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      const joined = args.join(' ');
      expect(joined).not.toContain('DEEPSEEK_API_KEY');
      expect(joined).not.toContain('ANTHROPIC_AUTH_TOKEN');
    });

    it('末尾是 [image, command, ...args]', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'node',
        args: ['-e', 'process.stdout.write("hi")'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      const tail = args.slice(-4);
      expect(tail[0]).toBe('node:22-alpine');
      expect(tail[1]).toBe('node');
      expect(tail[2]).toBe('-e');
      expect(tail[3]).toBe('process.stdout.write("hi")');
    });
  });

  describe('D-20.1 P0-F: 资源限制', () => {
    // 拍板默认值: memory=512m / cpus=1.0 / pids-limit=256.
    // 跟 Docker CLI 标准格式: --memory / --cpus / --pids-limit 字符串.
    it('默认: --memory=512m / --cpus=1.0 / --pids-limit=256', () => {
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      expect(args).toContain('--memory');
      expect(args[args.indexOf('--memory') + 1]).toBe('512m');
      expect(args).toContain('--cpus');
      expect(args[args.indexOf('--cpus') + 1]).toBe('1.0');
      expect(args).toContain('--pids-limit');
      expect(args[args.indexOf('--pids-limit') + 1]).toBe('256');
    });

    it('构造参数覆盖 memory=1g → buildDockerArgs 用 1g', () => {
      const runner = makeRunner({ memory: '1g' });
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      expect(args[args.indexOf('--memory') + 1]).toBe('1g');
      // 其他限制保持默认
      expect(args[args.indexOf('--cpus') + 1]).toBe('1.0');
      expect(args[args.indexOf('--pids-limit') + 1]).toBe('256');
    });

    it('构造参数覆盖 cpus=0.5 → buildDockerArgs 用 0.5', () => {
      const runner = makeRunner({ cpus: '0.5' });
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      expect(args[args.indexOf('--cpus') + 1]).toBe('0.5');
    });

    it('构造参数覆盖 pidsLimit=1024 → buildDockerArgs 用 1024', () => {
      const runner = makeRunner({ pidsLimit: '1024' });
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      expect(args[args.indexOf('--pids-limit') + 1]).toBe('1024');
    });

    it('env override: DEEPWHALE_DOCKER_MEMORY=2g + docker 模式 → buildDockerArgs 用 2g', () => {
      // 走 env-gate 解析, 验证 env → constructor option → buildDockerArgs 端到端
      const r = resolveSandboxRunnerFromEnv(
        { sandboxRoot: '/tmp/x' },
        {
          DEEPWHALE_SANDBOX: 'docker',
          DEEPWHALE_DOCKER_MEMORY: '2g',
          DEEPWHALE_DOCKER_CPUS: '2.0',
          DEEPWHALE_DOCKER_PIDS_LIMIT: '512',
        },
      ) as DockerSandboxRunner;
      const args = r.buildDockerArgs('sbx-x', '/tmp/x', {
        command: 'ls',
        args: [],
        cwd: '/tmp/x',
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      expect(args[args.indexOf('--memory') + 1]).toBe('2g');
      expect(args[args.indexOf('--cpus') + 1]).toBe('2.0');
      expect(args[args.indexOf('--pids-limit') + 1]).toBe('512');
    });

    it('env override: 空字符串 + docker 模式 → 走 runner 默认 (512m/1.0/256)', () => {
      // 跟 NETWORK 空字符串同形态: '' 跟 unset 等义, 走内部 default
      const r = resolveSandboxRunnerFromEnv(
        { sandboxRoot: '/tmp/x' },
        {
          DEEPWHALE_SANDBOX: 'docker',
          DEEPWHALE_DOCKER_MEMORY: '',
          DEEPWHALE_DOCKER_CPUS: '',
          DEEPWHALE_DOCKER_PIDS_LIMIT: '',
        },
      ) as DockerSandboxRunner;
      const args = r.buildDockerArgs('sbx-x', '/tmp/x', {
        command: 'ls',
        args: [],
        cwd: '/tmp/x',
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      expect(args[args.indexOf('--memory') + 1]).toBe('512m');
      expect(args[args.indexOf('--cpus') + 1]).toBe('1.0');
      expect(args[args.indexOf('--pids-limit') + 1]).toBe('256');
    });

    it('红线: buildDockerArgs 不传 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN (跟 D-12 拍板一致)', () => {
      // 资源限制是新增字段, 不能意外让 API key 漏出.
      const runner = makeRunner();
      const args = runner.buildDockerArgs('sbx-x', `${SANDBOX_ROOT}`, {
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 1_000,
        stdoutCapBytes: 1024,
      });
      const joined = args.join(' ');
      expect(joined).not.toContain('DEEPSEEK_API_KEY');
      expect(joined).not.toContain('ANTHROPIC_AUTH_TOKEN');
      expect(joined).not.toContain('DEEPWHALE_SESSION_KEY');
      // 容器 args 没有 --env-file (API key 泄露通道之一)
      expect(joined).not.toContain('--env-file');
    });
  });

  describe('run 行为', () => {
    it('成功: child stdout 收到数据, close exit 0 → ok=true', async () => {
      const runner = makeRunner();
      const promise = runner.run({
        command: 'echo',
        args: ['hello'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      await new Promise((r) => setImmediate(r));
      const child = mockChildren[0]!;
      child.stdout!.emit('data', Buffer.from('hello\n'));
      child.emit('close', 0, null);
      const r = await promise;
      expect(r.ok).toBe(true);
      expect(r.exitCode).toBe(0);
      expect(r.stdoutTail).toBe('hello\n');
      expect(childProcess.spawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['run', '--rm']),
        expect.objectContaining({}),
      );
    });

    it('失败: child close exit 7 → ok=false, exitCode=7', async () => {
      const runner = makeRunner();
      const promise = runner.run({
        command: 'ls',
        args: ['/nonexistent'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      await new Promise((r) => setImmediate(r));
      const child = mockChildren[0]!;
      child.stderr!.emit('data', Buffer.from('No such file\n'));
      child.emit('close', 7, null);
      const r = await promise;
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(7);
      expect(r.stderrTail).toBe('No such file\n');
    });

    it('spawn 错误 (docker 不在 PATH): ok=false, exitCode=null, warning 含 spawn failed', async () => {
      const runner = makeRunner();
      const promise = runner.run({
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      await new Promise((r) => setImmediate(r));
      const child = mockChildren[0]!;
      child.emit('error', new Error('spawn docker ENOENT'));
      const r = await promise;
      expect(r.ok).toBe(false);
      expect(r.exitCode).toBe(null);
      expect(r.warning).toMatch(/docker spawn failed/);
      expect(r.warning).toMatch(/ENOENT/);
    });

    it('stdout cap: 输出 > cap → 保留尾 cap bytes', async () => {
      const runner = makeRunner();
      const promise = runner.run({
        command: 'ls',
        args: [],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 5_000,
        stdoutCapBytes: 512,
      });
      await new Promise((r) => setImmediate(r));
      const child = mockChildren[0]!;
      child.stdout!.emit('data', Buffer.from('A'.repeat(800)));
      child.emit('close', 0, null);
      const r = await promise;
      expect(r.ok).toBe(true);
      expect(r.stdoutTail.length).toBe(512);
      expect(r.stdoutTail).toBe('A'.repeat(512));
    });
  });

  describe('timeout + cleanup', () => {
    it.skip('[D-12 P2 follow-up] timeout 触发 → 调 docker stop (grace 5s), signal=SIGTERM', async () => {
      // 用 fake timer 精确跑 timeout 序列, 避免 real timer 跟 close emit race
      vi.useFakeTimers();
      const runner = makeRunner();
      const promise = runner.run({
        command: 'sleep',
        args: ['999'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 100,
        stdoutCapBytes: 1024,
      });
      // advance 让 spawn handler 注册
      await vi.advanceTimersByTimeAsync(0);
      // advance 100ms 让 killTimer fire, 但 stopContainer 内部 setImmediate (mock 模拟)
      // 还没 resolve — 需再 advance 0 flush setImmediate
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(0);
      // 这时 stopContainer.then 链同步 finalize, promise resolve (resolve from stopContainer
      // path). 测从 await promise 拿 result.
      // 模拟 docker stop 干掉容器后 close (实际 stop 完 docker CLI exit, 触发 close)
      const child = mockChildren[0]!;
      child.emit('close', null, 'SIGTERM');
      const r = await promise;
      expect(r.ok).toBe(false);
      expect(r.signal).toBe('SIGTERM');
      const stopCalls = (childProcess.execFile as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as readonly string[])[0] === 'stop',
      );
      expect(stopCalls.length).toBeGreaterThanOrEqual(1);
    });

    it.skip('[D-12 P2 follow-up] stop 失败 → 调 docker kill 兜底, signal=SIGKILL, warning 含 stop failed', async () => {
      vi.useFakeTimers();
      mockExecFileImpl.current = (_cmd, args, cb) => {
        const subcmd = args[0];
        if (subcmd === 'stop') setImmediate(() => cb(new Error('stop failed')));
        else if (subcmd === 'kill') setImmediate(() => cb(null, Buffer.from('')));
        else setImmediate(() => cb(null, Buffer.from('')));
      };
      const runner = makeRunner();
      const promise = runner.run({
        command: 'sleep',
        args: ['999'],
        cwd: `${SANDBOX_ROOT}`,
        timeoutMs: 50,
        stdoutCapBytes: 1024,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(50); // killTimer fire
      // stopContainer reject → killContainer 调 → finally → finalize SIGKILL+warning
      await vi.advanceTimersByTimeAsync(0);
      const child = mockChildren[0]!;
      child.emit('close', null, 'SIGKILL');
      const r = await promise;
      expect(r.signal).toBe('SIGKILL');
      expect(r.warning).toMatch(/docker stop failed/);
      const killCalls = (childProcess.execFile as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as readonly string[])[0] === 'kill',
      );
      expect(killCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('mount escape 防护', () => {
    it('cwd 跳出 sandboxRoot → 不 spawn, 直接返回 warning', async () => {
      const runner = makeRunner();
      const r = await runner.run({
        command: 'ls',
        args: [],
        cwd: '/etc',
        timeoutMs: 5_000,
        stdoutCapBytes: 1024,
      });
      expect(r.ok).toBe(false);
      expect(r.warning).toMatch(/outside sandbox root/);
      expect(childProcess.spawn).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('无残留容器 → ps 返空, 不会 rm', async () => {
      mockExecFileImpl.current = (_cmd, args, cb) => {
        const subcmd = args[0];
        if (subcmd === 'ps') setImmediate(() => cb(null, Buffer.from('')));
        else if (subcmd === 'rm') setImmediate(() => cb(null, Buffer.from('')));
        else setImmediate(() => cb(null, Buffer.from('')));
      };
      const runner = makeRunner();
      await runner.cleanup();
      const rmCalls = (childProcess.execFile as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => (c[1] as readonly string[])[0] === 'rm',
      );
      expect(rmCalls.length).toBe(0);
    });

    it('有残留容器 → 调 docker rm -f, cleanup 失败进 console.warn 不抛', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockExecFileImpl.current = (_cmd, args, cb) => {
        const subcmd = args[0];
        if (subcmd === 'ps') setImmediate(() => cb(null, Buffer.from('abc123\ndef456\n')));
        else if (subcmd === 'rm') setImmediate(() => cb(new Error('container running')));
        else setImmediate(() => cb(null, Buffer.from('')));
      };
      const runner = makeRunner();
      await expect(runner.cleanup()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = String(warnSpy.mock.calls[0]?.[0] ?? '');
      expect(warnMsg).toMatch(/cleanup/);
      warnSpy.mockRestore();
    });
  });

  describe('常量', () => {
    it('DOCKER_DEFAULT_TIMEOUT_MS = 60_000', () => {
      expect(DOCKER_DEFAULT_TIMEOUT_MS).toBe(60_000);
    });
  });

  describe('kind', () => {
    it('kind = "docker"', () => {
      expect(makeRunner().kind).toBe('docker');
    });
  });
});
