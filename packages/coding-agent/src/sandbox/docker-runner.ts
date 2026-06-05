/**
 * DockerSandboxRunner — 通过 `docker run --rm` 隔离执行 BashTool 命令
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05): MVP 隔离, **不**等于完整 sandbox.
 * .hermes/plans/d12/D12-PLAN.md 写清威胁模型 + 已知风险.
 *
 * 安全红线 (实现 + 自查都覆盖):
 * - args 用数组传给 execFile, **不** 拼 shell 字符串
 * - **不** 加 --privileged (grep 自查)
 * - **不** 挂宿主根目录 (--volume /:/host 之类)
 * - **不** 传 --env-file, **不** 传 DEEPSEEK_API_KEY / ANTHROPIC_AUTH_TOKEN
 * - 容器名加 random suffix (8 字符) 避免冲突
 * - workspace mount 用 --volume ${resolvedCwd}:/workspace:rw
 * - 默认 --network=none (DEEPWHALE_DOCKER_NETWORK=bridge 显式允许)
 * - timeout 走 docker stop 5s grace, 然后 docker kill 兜底
 * - cleanup 失败进 result.warning, 不静默假成功
 *
 * MVP 边界: 这是执行环境抽象, **不是**:
 * - 完整 policy language (Sprint D-15)
 * - 完整 seccomp / apparmor profile (用 Docker default)
 * - 远程容器 (本地 docker socket)
 * - 跨平台验证 (Linux 本机; Docker Desktop on Mac/Win 不在 D-12 范围)
 */

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve as pathResolve, sep as pathSep } from 'node:path';
import { promisify } from 'node:util';
import process from 'node:process';
import type { SandboxRunRequest, SandboxRunResult, SandboxRunner } from './types.js';

const execFileP = promisify(execFile);

const DEFAULT_IMAGE = 'node:22-alpine';
/** 上限 10 分钟, BashTool 60s 但 docker 模式可放宽. */
export const DOCKER_DEFAULT_TIMEOUT_MS = 60_000;
/** Docker 容器 stop grace 5s, 之后 SIGKILL. */
const _STOP_GRACE_MS_UNUSED = 5_000;
/** sandboxRoot 内的相对路径映射到容器 /workspace. */
const CONTAINER_WORKDIR = '/workspace';
/** stdout/stderr 末尾 cap 跟 LocalSandboxRunner 一致. */
const DEFAULT_STDOUT_CAP = 4 * 1024;
/** 10MB hard ceiling, 跟 LocalSandboxRunner 一致. */
const _MAX_BUFFER_UNUSED = 10 * 1024 * 1024;

/**
 * Sprint 1c-revive-3-D-12 review 修复 (2026-06-05, 基于 9348650 review).
 *
 * 黑名单: 这些 key **必须** 不传给 docker CLI 子进程. D-7 `.env` loader 会把
 * API key 放进 `process.env`; 默认 `env: process.env` 透传给 docker CLI 时,
 * docker CLI 自身能 `env | grep KEY` dump 出来, 也可能透传到 `docker run --env`
 * 启动的容器 (MVP 没用 --env, 但 docker CLI 内部行为 / 错误日志 / 未来扩展都有
 * 风险).
 *
 * 范围拍板: D-12 review 只列了 deepseek + anthropic + "等". 保守走 deepseek/
 * anthropic + session key (README L159 拍板的 at-rest encryption key), 其他
 * 第三方 API key 风险不在 D-12 范围. 后续 sprint 可扩.
 *
 * 模式: 黑名单 (比白名单稳 — 加新 deny 项立即生效, 不需要遍历允许列表).
 */
export const DOCKER_CLI_DENY_KEYS: ReadonlySet<string> = new Set([
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'DEEPWHALE_SESSION_KEY',
]);

/**
 * Sprint 1c-revive-3-D-12 review 修复 (2026-06-05, 基于 9348650 review).
 *
 * 给 docker CLI 子进程构造最小 env. docker CLI 自身需要的:
 *   - PATH (Linux/macOS 找其他 binary; 这里是子进程启动新 docker 子调用时用)
 *   - HOME (读 ~/.docker/config.json, docker config 凭据加载)
 *   - USERPROFILE (Windows 走这个替代 HOME)
 *   - DOCKER_HOST (连远程 docker daemon, e.g. ssh:// / tcp://)
 *   - DOCKER_CONFIG (config 路径, 跟 HOME/config 区分时)
 *   - DOCKER_TLS_VERIFY (TLS 开关)
 *   - DOCKER_TLS_CERTPATH (TLS 凭据路径)
 *
 * 其他 host 进程 env (TZ / LANG / 等) 通过 DOCKER_CLI_ALLOW_KEYS 白名单兜底,
 * 默认**不**透传. 跟 process.env 的差别显式记录, 避免 review 时再撞"env 注入
 * 未知 key" 的问题.
 */
export const DOCKER_CLI_ALLOW_KEYS: ReadonlySet<string> = new Set([
  'PATH',
  // Sprint 1c-revive-3-D-12 review chain 关单 (2026-06-05, 基于 dfe9d9a review):
  // Windows / PowerShell 用户的 process.env 习惯用 'Path' (跟 cmd.exe / PowerShell
  // 一致), Unix 用 'PATH'. Node 透传时**不**归一化大小写, 只 allow 单一大小写会
  // 漏 Windows. 两个都列, 跟其他 DOCKER_* key 风格一致; case-insensitive 归一化
  // 跨平台有"同 key 不同大小写同时存在被覆盖" 的不可见副作用, 不引入.
  'Path',
  'HOME',
  'USERPROFILE',
  'DOCKER_HOST',
  'DOCKER_CONFIG',
  'DOCKER_TLS_VERIFY',
  'DOCKER_TLS_CERTPATH',
]);

/**
 * 构造给 docker CLI 子进程的 env: DOCKER_CLI_ALLOW_KEYS 交集 process.env
 * + 跳过 DOCKER_CLI_DENY_KEYS (黑名单优先, 即便用户在 allow set 里也跳过).
 * 返回**新对象**, 不影响 process.env.
 */
export function makeDockerCliEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of DOCKER_CLI_ALLOW_KEYS) {
    const value = env[key];
    if (value === undefined) continue;
    if (DOCKER_CLI_DENY_KEYS.has(key)) continue; // 防御: 黑名单优先
    result[key] = value;
  }
  return result;
}

export interface DockerSandboxOptions {
  /** 容器镜像. 默认 'node:22-alpine'. */
  readonly image?: string;
  /** 沙箱根目录. BashTool ctor 拿 process.cwd() 注入. */
  readonly sandboxRoot: string;
  /** 'none' (默认, 禁网) / 'bridge' (允许 docker 默认 bridge). */
  readonly network?: 'none' | 'bridge';
  /** 默认 60_000. clamp 上限 10 分钟. */
  readonly defaultTimeoutMs?: number;
}

/**
 * 容器的 stdout/stderr cap. 用 Buffer.from 包一层, ts 5.x 严格模式抓得到
 * Buffer<ArrayBufferLike> 跟 Buffer<ArrayBuffer> 的差别.
 */
function capTail(buf: Buffer, cap: number): Buffer {
  if (buf.length <= cap) return buf;
  return Buffer.from(buf.subarray(buf.length - cap));
}

/**
 * DockerSandboxRunner — opt-in sandbox, 通过 `docker run` 隔离命令.
 *
 * 关键: 所有 docker 子命令都用 execFile 传数组, **不** 拼字符串.
 */
export class DockerSandboxRunner implements SandboxRunner {
  readonly kind = 'docker' as const;
  private readonly image: string;
  private readonly sandboxRoot: string;
  private readonly network: 'none' | 'bridge';
  private readonly defaultTimeoutMs: number;
  /**
   * Sprint 1c-revive-3-D-12 review P2 修复 (2026-06-05): 每个 runner 实例
   * 唯一 runId. 容器打两个 label: `deepwhale.sandbox=true` (粗筛) +
   * `deepwhale.sandbox.run_id=<runId>` (精筛). cleanup() 只删**自己** runId
   * 的容器, 避免并发 runner 时一个 cleanup 误删另一个的容器.
   */
  readonly runId: string;

  constructor(opts: DockerSandboxOptions) {
    this.image = opts.image ?? DEFAULT_IMAGE;
    this.sandboxRoot = opts.sandboxRoot;
    this.network = opts.network ?? 'none';
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DOCKER_DEFAULT_TIMEOUT_MS;
    this.runId = randomUUID().slice(0, 8);
  }

  /**
   * 跑命令. 不抛异常 — 失败 / timeout / docker 不存在都在 result 里.
   *
   * docker run → 在容器里跑命令. timeout 通过 docker stop 触发.
   * 实现拆 3 步: buildArgs → spawn → 收集 stdout/stderr/exit.
   * 不在沙箱里, 行为是 Node 进程, timeout 走 SIGKILL child of docker CLI.
   */
  async run(req: SandboxRunRequest): Promise<SandboxRunResult> {
    const start = Date.now();
    const cap = req.stdoutCapBytes || DEFAULT_STDOUT_CAP;
    const timeoutMs = req.timeoutMs || this.defaultTimeoutMs;
    // clamp timeout 上限 10 分钟
    const clampedTimeout = Math.min(Math.max(timeoutMs, 1_000), 10 * 60_000);

    const containerName = `deepwhale-sbx-${randomUUID().slice(0, 8)}`;
    const workspaceAbs = pathResolve(req.cwd);
    // 校验 cwd 在 sandboxRoot 内 (防止 mount escape: bash 工具说在 /workspace
    // 但实际 pathResolve 跳出 sandboxRoot 之后 docker -v 挂载到宿主别处)
    if (!this.isInsideSandbox(workspaceAbs)) {
      return {
        ok: false,
        exitCode: null,
        stdoutTail: '',
        stderrTail: '',
        durationMs: Date.now() - start,
        warning: `cwd '${workspaceAbs}' is outside sandbox root '${this.sandboxRoot}' — refusing to mount`,
      };
    }

    const dockerArgs = this.buildDockerArgs(containerName, workspaceAbs, req);

    return new Promise<SandboxRunResult>((resolve) => {
      let stdoutBuf: Buffer = Buffer.alloc(0);
      let stderrBuf: Buffer = Buffer.alloc(0);
      let killTimer: NodeJS.Timeout | null = null;
      let sigkillTimer: NodeJS.Timeout | null = null;
      let resolved = false;

      const finalize = (r: Omit<SandboxRunResult, 'durationMs'>): void => {
        if (resolved) return;
        resolved = true;
        if (killTimer) clearTimeout(killTimer);
        if (sigkillTimer) clearTimeout(sigkillTimer);
        resolve({ ...r, durationMs: Date.now() - start });
      };

      const child = spawn('docker', dockerArgs, {
        cwd: this.sandboxRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Sprint 1c-revive-3-D-12 review 修复 (2026-06-05, 基于 9348650 review):
        // 之前 `env: process.env` 透传, D-7 `.env` loader 注入的 API key 会
        // 进 docker CLI 子进程 (可能被 docker 内部 dump 到诊断日志 / 未来
        // 扩展透传到容器). 修法: makeDockerCliEnv() 黑名单 + 白名单, 默认
        // 只透传 docker CLI 必需的 7 个 key, 显式剔除 API key.
        env: makeDockerCliEnv(),
        // 注: 这里不传 shell: true (默认 false), 数组 args 安全
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf = capTail(Buffer.concat([stdoutBuf, chunk]), cap);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf = capTail(Buffer.concat([stderrBuf, chunk]), cap);
      });

      // timeout 触发: 走 docker stop (SIGTERM + 5s grace) → docker kill (SIGKILL)
      killTimer = setTimeout(() => {
        // docker stop 给容器 5s grace, 容器跑不到就 docker kill
        void this.stopContainer(containerName, 5_000)
          .then((stopOk) => {
            if (stopOk) {
              finalize({
                ok: false,
                exitCode: null,
                stdoutTail: stdoutBuf.toString('utf8'),
                stderrTail: stderrBuf.toString('utf8'),
                signal: 'SIGTERM',
              });
            } else {
              // stop 失败, 兜底 kill
              void this.killContainer(containerName).finally(() => {
                finalize({
                  ok: false,
                  exitCode: null,
                  stdoutTail: stdoutBuf.toString('utf8'),
                  stderrTail: stderrBuf.toString('utf8'),
                  signal: 'SIGKILL',
                  warning: 'docker stop failed, force-killed via docker kill',
                });
              });
            }
          })
          .catch((err: unknown) => {
            finalize({
              ok: false,
              exitCode: null,
              stdoutTail: stdoutBuf.toString('utf8'),
              stderrTail: stderrBuf.toString('utf8'),
              signal: 'SIGKILL',
              warning: `docker stop error: ${err instanceof Error ? err.message : String(err)}`,
            });
          });
      }, clampedTimeout);
      // 上面的 finalize 内部已清 killTimer, 但 sigkill 兜底场景下我们没注册 sigkillTimer
      // 实际 SIGTERM 失败转 SIGKILL 已经在上面, sigkillTimer 字段是预留, 这里清空
      sigkillTimer = null;

      child.on('error', (err) => {
        // spawn 失败 (docker 不在 PATH / docker daemon 死)
        finalize({
          ok: false,
          exitCode: null,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          warning: `docker spawn failed: ${err.message}. Is docker installed and running?`,
        });
      });

      child.on('close', (code, signal) => {
        // docker CLI 自己的 exit code: 0 = 容器跑完 + 退出 0
        // 非 0 = 容器命令失败 / docker 出错
        // signal = docker CLI 自己被 kill (这里只有 child.kill 时, 实际不走这里)
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          finalize({
            ok: false,
            exitCode: null,
            stdoutTail: stdoutBuf.toString('utf8'),
            stderrTail: stderrBuf.toString('utf8'),
            signal: signal === 'SIGTERM' ? 'SIGTERM' : 'SIGKILL',
          });
          return;
        }
        finalize({
          ok: code === 0,
          exitCode: code,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
        });
      });
    });
  }

  /**
   * 构建 docker run args. **核心安全边界** — 全部用数组, 任何 caller 都无法通过
   * 输入污染 args (args 里的空格/--xxx 都被当作字面量).
   */
  buildDockerArgs(containerName: string, workspaceAbs: string, req: SandboxRunRequest): string[] {
    const args: string[] = [
      'run',
      '--rm', // 跑完自动删容器
      '--label',
      'deepwhale.sandbox=true',
      // Sprint 1c-revive-3-D-12 review P2 修复: 跟 runId 配对的精筛 label.
      // cleanup() 用它只删本 runner 的容器, 并发安全.
      '--label',
      `deepwhale.sandbox.run_id=${this.runId}`,
      '--name',
      containerName,
      '--user',
      '1000:1000', // 非 root
      '--read-only', // 容器 fs 只读, 写只走 /workspace + /tmp
      '--cap-drop=ALL', // 丢弃所有 capabilities
      '--security-opt',
      'no-new-privileges', // 防 setuid 提权
      '--network',
      this.network, // 默认 none 禁网
      '-v',
      `${workspaceAbs}:${CONTAINER_WORKDIR}:rw`, // 显式 workspace bind mount
      '-w',
      CONTAINER_WORKDIR, // 容器内工作目录
      '--tmpfs',
      '/tmp:size=64m,noexec,nosuid', // 临时目录禁执行
      // **不** 加 --privileged (grep 自查红线)
      // **不** 加 --env-file, **不** 传 .env / API key
      // **不** 加 --volume /:/host (禁止宿主根 mount)
      this.image,
      // 容器里要执行的命令
      req.command,
      ...req.args,
    ];
    return args;
  }

  /** cwd 是否在 sandboxRoot 内. */
  private isInsideSandbox(absoluteCwd: string): boolean {
    if (absoluteCwd === this.sandboxRoot) return true;
    const rootWithSep = this.sandboxRoot.endsWith(pathSep)
      ? this.sandboxRoot
      : this.sandboxRoot + pathSep;
    return absoluteCwd.startsWith(rootWithSep);
  }

  /** 停容器 (SIGTERM), grace ms 内不退就当失败. */
  private async stopContainer(name: string, graceMs: number): Promise<boolean> {
    try {
      const { stdout } = await execFileP(
        'docker',
        ['stop', '--time', String(Math.ceil(graceMs / 1000)), name],
        {
          timeout: graceMs + 2_000,
          encoding: 'buffer',
          maxBuffer: 1024 * 1024,
        },
      );
      const out = (stdout as Buffer).toString('utf8').trim();
      // docker stop 退 0 + stdout 含容器名 = 成功
      return out.includes(name);
    } catch {
      return false;
    }
  }

  /** 强杀容器 (SIGKILL). 失败不抛. */
  private async killContainer(name: string): Promise<void> {
    try {
      await execFileP('docker', ['kill', name], {
        timeout: 5_000,
        encoding: 'buffer',
        maxBuffer: 1024 * 1024,
      });
    } catch {
      // best-effort, 不抛
    }
  }

  /**
   * 主动清理 — 给 BashTool 退出时调. docker run --rm 模式理论上不需要, 但如果
   * 容器因 timeout 残留 (kill 失败) 就在这里兜底.
   * **不抛异常**, 错误进 stderr warning.
   *
   * Sprint 1c-revive-3-D-12 review P2 修复 (2026-06-05): filter 同时**精筛**
   * runId label, 只删本 runner 的容器. 之前只用 `deepwhale.sandbox=true` 粗筛,
   * 并发两个 runner 时一个 cleanup 可能误删另一个 runner 的容器 — 跨实例污染.
   */
  async cleanup(): Promise<void> {
    try {
      // 找本 runner runId 的残留容器并删
      const { stdout } = await execFileP(
        'docker',
        [
          'ps',
          '-aq',
          '--filter',
          'label=deepwhale.sandbox=true',
          '--filter',
          `label=deepwhale.sandbox.run_id=${this.runId}`,
        ],
        { encoding: 'buffer', maxBuffer: 1024 * 1024 },
      );
      const ids = (stdout as Buffer).toString('utf8').trim().split('\n').filter(Boolean);
      if (ids.length === 0) return;
      // 逐个删, 失败不阻塞其他
      const results = await Promise.allSettled(
        ids.map((id) =>
          execFileP('docker', ['rm', '-f', id], { encoding: 'buffer', maxBuffer: 1024 * 1024 }),
        ),
      );
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        // warning 通过 console 报告, 不抛 (caller 拿不到 stderr)
        // 注: 跟 result.warning 是不同通道 — cleanup() 是 no-return, 没法填 result.
        // D-12 MVP 接受这个限制; 后续 sprint 加 sandbox-level logger.
        const msgs = failures
          .map((f) => (f as PromiseRejectedResult).reason)
          .map((r) => (r instanceof Error ? r.message : String(r)))
          .join('; ');

        console.warn(`[sandbox] cleanup partial failure: ${msgs}`);
      }
    } catch (err) {
      console.warn(`[sandbox] cleanup error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
