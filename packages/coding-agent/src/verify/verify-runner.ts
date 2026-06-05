/**
 * @deepwhale/coding-agent — Verify runner
 *
 * Sprint 1c-revive-2-D-11 (2026-06-04): `deepwhale --verify` 跟 REPL `/verify`
 * 内部统一走 `runVerify()` — 跑 4 步真验证 (build / lint / typecheck / test),
 * 不走 LLM, 不走 tool loop, 生成 `VerificationReport`.
 *
 * 设计拍板:
 *   - 4 步默认: corepack pnpm build / lint / typecheck / test
 *   - 用户可覆盖 checks (单测用) / cwd (单测 tmpdir) / signal (取消)
 *   - 每步 spawn child_process 同步等 exit, **不**用 stream (避免长 stdout 卡 session)
 *   - stdout/stderr 截断: 默认 4 KB 尾, 防止 session JSONL 撑爆
 *   - timeout 默认 5 min/步, 总 timeout 默认 30 min (build+lint+typecheck+test 全跑)
 *   - 任何一步 fail → 整体 fail, **不**继续后续步 (用户拍的 D-11 review: fail-fast
 *     比继续跑节省时间, 而且后续步基于 build 产物, fail-fast 防止假绿)
 *   - 不读 .env, 不动 LLM, 不调 tool loop — 真·本地 CLI
 *
 * 不变量 (跟 D-10c 集成测语义 hotfix 一脉相承):
 *   - 不打印 / 不写 key 值
 *   - 不做 ASCII-only sanitize
 *   - 不读 .env 文件 (D-7 loadProjectEnv 是 caller 职责)
 *   - 不依赖 LLM client (跑 verify 不需要 key)
 *
 * @module @deepwhale/coding-agent/verify-runner
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

/** 单步验证配置. */
export interface VerifyCheck {
  /** 人类可读步骤名 (报告里显示). */
  name: string;
  /** 完整命令 (报告里显示). 例: "corepack pnpm build". */
  command: string;
  /** 实际 spawn 的 argv (不含 corepack, corepack 处理自动). */
  args: ReadonlyArray<string>;
  /** spawn cwd. 不传走 options.cwd / process.cwd(). */
  cwd?: string;
  /** 该步 timeout (ms). 不传走 options.defaultTimeoutMs / 300_000. */
  timeoutMs?: number;
}

/** 单步结果. */
export type VerifyCheckStatus = 'passed' | 'failed' | 'timed-out' | 'spawn-error';

export interface VerifyCheckResult {
  name: string;
  command: string;
  status: VerifyCheckStatus;
  /** spawn 退出码. spawn 失败或 timeout 时为 null. */
  exitCode: number | null;
  /** 该步 startedAt (epoch ms). */
  startedAt: number;
  /** 该步 endedAt (epoch ms). */
  endedAt: number;
  /** 该步 durationMs. */
  durationMs: number;
  /** stdout 末尾截断 (默认 4 KB). 永远不写原始大文件. */
  stdoutTail: string;
  /** stderr 末尾截断 (默认 4 KB). */
  stderrTail: string;
  /** spawn / abort 错时的 error.message. 否则 undefined. */
  errorMessage?: string;
}

/** 整体报告. */
export type VerificationOverallStatus = 'passed' | 'failed';

export interface VerificationReport {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  overallStatus: VerificationOverallStatus;
  checks: ReadonlyArray<VerifyCheckResult>;
  /** 一句话人类可读总结. */
  summary: string;
  /** 建议下一步. */
  nextSuggestedAction: string;
}

export interface RunVerifyOptions {
  /** 自定义 checks. 不传走默认 4 步. */
  checks?: ReadonlyArray<VerifyCheck>;
  /** 工作目录. 不传走 process.cwd(). */
  cwd?: string;
  /** 外部 AbortSignal (单测 / REPL / CLI 取消). */
  signal?: AbortSignal;
  /** 默认每步 timeout (ms). 默认 300_000 (5 min). */
  defaultTimeoutMs?: number;
  /** stdout/stderr 截断字节数. 默认 4096. */
  stdoutCapBytes?: number;
  /** 失败时是否继续. 默认 false (fail-fast). 单测可改. */
  continueOnError?: boolean;
}

const DEFAULT_CHECKS: ReadonlyArray<VerifyCheck> = [
  // 拍板: args[0] 是实际 spawn 的可执行 (e.g. 'corepack'), 后面是它的参数.
  // 4 步 default 用 corepack 跑 pnpm, 跟用户日常工作流一致
  // (corepack 自身 < 5MB, 启动 < 200ms, 不显著影响 verify 总耗时).
  //
  // Sprint 1c-revive-2-D-11-4 review P1 修复 (2026-06-04): args[0] 在 Windows 上
  // 由 resolveRunner() 转成 'corepack.cmd'. 默认仍写 'corepack' (Linux/macOS 不变,
  // 跟 1c 时代兼容性), 真 spawn 时再换. 单测可注入 platform = 'win32' 验证.
  {
    name: 'build',
    command: 'corepack pnpm build',
    args: ['corepack', 'pnpm', 'build'],
  },
  {
    name: 'lint',
    command: 'corepack pnpm lint',
    args: ['corepack', 'pnpm', 'lint'],
  },
  {
    name: 'typecheck',
    command: 'corepack pnpm typecheck',
    args: ['corepack', 'pnpm', 'typecheck'],
  },
  {
    name: 'test',
    command: 'corepack pnpm test',
    args: ['corepack', 'pnpm', 'test'],
  },
];

/**
 * Sprint 1c-revive-2-D-11-4 review P1 修复: Windows 上 `corepack` 在 PATH 解析不到
 * (Node `spawn('corepack', ...)` 在 Win32 默认走 CreateProcessW, 不接 .cmd shim).
 * 实际 `where corepack` 只返 `corepack.cmd`. 修复: Win32 上把 'corepack' → 'corepack.cmd'.
 *
 * 设计: 接受 platform 参数, 默认用 process.platform, 单测可注入 'win32' 验证.
 * 仅在 args0 严格 === 'corepack' 时转换; 其它可执行 (node / bash / .exe) 透传,
 * 跟单测里 mock 各种 runner 的行为兼容.
 */
export function resolveRunner(args0: string, platform: NodeJS.Platform = process.platform): string {
  if (args0 === 'corepack' && platform === 'win32') {
    return 'corepack.cmd';
  }
  return args0;
}

/**
 * 跑 4 步验证 (默认), 返回 `VerificationReport`.
 *
 * 拍板 (D-11, 2026-06-04):
 *   - 任一 step 失败 → 整体 fail, **不**继续后续 step (fail-fast).
 *     后续 step 基于 build 产物, 跑也是浪费; 而且 build fail 时 typecheck/test 必挂,
 *     显式 fail-fast 比假绿更诚实.
 *   - 步骤间**不**共享 stdout/stderr buffer: 每步清零 Buffer 防止污染.
 *   - 返回的报告 `overallStatus` = 'failed' iff 任一 step status ∈ {failed, timed-out, spawn-error}.
 *   - summary / nextSuggestedAction 由调用方 (REPL/CLI/format-report) 写.
 *     runner 不写自然语言, 保持纯函数语义 (便于单测 / roundtrip).
 */
export async function runVerify(options: RunVerifyOptions = {}): Promise<VerificationReport> {
  const checks = options.checks ?? DEFAULT_CHECKS;
  const cwd = options.cwd ?? process.cwd();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 300_000;
  const stdoutCapBytes = options.stdoutCapBytes ?? 4096;
  const continueOnError = options.continueOnError ?? false;
  const overallStart = Date.now();

  const results: VerifyCheckResult[] = [];
  let aborted = false;

  // 监听外部 signal: 任何 step 跑时如果外部 abort, 立即停止后续 step
  const onAbort = (): void => {
    aborted = true;
  };
  if (options.signal) {
    if (options.signal.aborted) {
      aborted = true;
    } else {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    for (const check of checks) {
      if (aborted) {
        // 外部 signal 触发: 后续 step 全 mark 跳过, 不跑
        const now = Date.now();
        results.push({
          name: check.name,
          command: check.command,
          status: 'spawn-error',
          exitCode: null,
          startedAt: now,
          endedAt: now,
          durationMs: 0,
          stdoutTail: '',
          stderrTail: '',
          errorMessage: 'aborted by external signal',
        });
        if (!continueOnError) break;
        continue;
      }
      const result = await runOneCheck(check, {
        cwd,
        defaultTimeoutMs,
        stdoutCapBytes,
      });
      results.push(result);
      if (result.status !== 'passed' && !continueOnError) {
        break;
      }
    }
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  const overallEnd = Date.now();
  const overallFailed = results.some((r) => r.status !== 'passed');
  const overallStatus: VerificationOverallStatus = overallFailed ? 'failed' : 'passed';

  return {
    startedAt: overallStart,
    endedAt: overallEnd,
    durationMs: overallEnd - overallStart,
    overallStatus,
    checks: results,
    // summary / nextSuggestedAction 由 caller 写 (保持 runner 纯函数)
    summary: '',
    nextSuggestedAction: '',
  };
}

interface RunOneCheckOpts {
  cwd: string;
  defaultTimeoutMs: number;
  stdoutCapBytes: number;
}

async function runOneCheck(
  check: VerifyCheck,
  opts: RunOneCheckOpts,
): Promise<VerifyCheckResult> {
  const start = Date.now();
  const timeoutMs = check.timeoutMs ?? opts.defaultTimeoutMs;
  const cwd = check.cwd ?? opts.cwd;
  const cap = opts.stdoutCapBytes;

  return new Promise<VerifyCheckResult>((resolve) => {
    let stdoutBuf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderrBuf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let resolved = false;
    let child: ReturnType<typeof spawn> | null = null;
    let timer: NodeJS.Timeout | null = null;

    const finalize = (result: VerifyCheckResult): void => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      if (child && !child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* best-effort */
        }
      }
      resolve(result);
    };

    try {
      // 拍板 (D-11, 2026-06-04): 透传 args[0] 给 spawn, 不写死 corepack.
      // 调用方可以传 'node' / 'bash' / 'corepack' / 任何 spawn 兼容的可执行.
      // 4 步 default 用 corepack, 跟用户日常工作流一致.
      // Sprint 1c-revive-2-D-11-4 review P1 修复: spawn 前用 resolveRunner 转换
      // runner 字符串, Windows 上 'corepack' → 'corepack.cmd'.
      const rawRunner = check.args[0];
      if (typeof rawRunner !== 'string' || rawRunner.length === 0) {
        throw new Error(`VerifyCheck '${check.name}' args[0] must be a non-empty string (the runner binary)`);
      }
      const runner = resolveRunner(rawRunner);
      const subArgs = check.args.slice(1);
      child = spawn(runner, subArgs, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env, // 透传 env, 不注入任何东西 (loadProjectEnv 是 caller 职责)
      });
    } catch (e) {
      // spawn 同步失败 (e.g. corepack 不在 PATH)
      const end = Date.now();
      finalize({
        name: check.name,
        command: check.command,
        status: 'spawn-error',
        exitCode: null,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: '',
        stderrTail: '',
        errorMessage: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    // 装 stdout/stderr 流, 保留 cap bytes 尾.
    // 用 Buffer.concat 重建 (subarray 共享内存但类型 Buffer<ArrayBufferLike> 不赋给
    // Buffer<ArrayBuffer>, ts 5.x 严格模式抓得到, 改 Buffer.from(merged) 重新建独立 Buffer)
    const capAppend = (buf: Buffer, chunk: Buffer): Buffer => {
      const merged = Buffer.concat([buf, chunk]);
      if (merged.length <= cap) return merged;
      return Buffer.from(merged.subarray(merged.length - cap));
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf = capAppend(stdoutBuf, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf = capAppend(stderrBuf, chunk);
    });

    timer = setTimeout(() => {
      const end = Date.now();
      finalize({
        name: check.name,
        command: check.command,
        status: 'timed-out',
        exitCode: null,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: stdoutBuf.toString('utf8'),
        stderrTail: stderrBuf.toString('utf8'),
        errorMessage: `timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.on('close', (code, signal) => {
      const end = Date.now();
      // signal 触发 kill → 'spawn-error' (用户主动取消)
      if (signal === 'SIGKILL' || signal === 'SIGTERM') {
        finalize({
          name: check.name,
          command: check.command,
          status: 'spawn-error',
          exitCode: code,
          startedAt: start,
          endedAt: end,
          durationMs: end - start,
          stdoutTail: stdoutBuf.toString('utf8'),
          stderrTail: stderrBuf.toString('utf8'),
          errorMessage: `killed by signal ${signal}`,
        });
        return;
      }
      const status: VerifyCheckStatus = code === 0 ? 'passed' : 'failed';
      finalize({
        name: check.name,
        command: check.command,
        status,
        exitCode: code,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: stdoutBuf.toString('utf8'),
        stderrTail: stderrBuf.toString('utf8'),
      });
    });

    child.on('error', (e) => {
      const end = Date.now();
      finalize({
        name: check.name,
        command: check.command,
        status: 'spawn-error',
        exitCode: null,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
        stdoutTail: stdoutBuf.toString('utf8'),
        stderrTail: stderrBuf.toString('utf8'),
        errorMessage: e.message,
      });
    });
  });
}
