/**
 * LocalSandboxRunner — 默认本地 exec, 把 BashTool 现有 execFile 调用包到 SandboxRunner 接口
 *
 * Sprint 1c-revive-3-D-12 (2026-06-05): 这是 BashTool 行为事实的拆解版. BashTool 1.0
 * 的"本地执行" 走 execFile(command, args, { cwd, maxBuffer, timeout }) —— 本 runner
 * 不改语义, 重新组织返回形状到 SandboxRunResult. 默认 stdout cap 4KB 替换原 10MB
 * maxBuffer (10MB 对 LLM 太大, cap 末尾 4KB 跟 verify-runner 一致).
 *
 * 安全边界: 不在这里加 cwd 校验 / dangerous pattern / allowlist — caller (BashTool)
 * 入口已经做完, 这里只跑过白名单的命令.
 *
 * 实现注意: 用 execFile callback 的 stdout/stderr 参数做 cap. Node 16+ 默认 encoding
 * 是 'utf8' (返回 string), 早期 Node 是 Buffer. 兼容方式: 强 encoding: 'buffer' 拿
 * Buffer. 这样 cap 跟 utf8 decode 顺序明确.
 */

import { execFile } from 'node:child_process';
import type {
  SandboxRunRequest,
  SandboxRunResult,
  SandboxRunner,
} from './types.js';

/**
 * 末尾 cap bytes — Buffer.concat 重建独立 Buffer (跟 verify-runner 同样的 ts 5.x 严格模式坑).
 */
function capTail(buf: Buffer, cap: number): Buffer {
  if (buf.length <= cap) return buf;
  return Buffer.from(buf.subarray(buf.length - cap));
}

export class LocalSandboxRunner implements SandboxRunner {
  readonly kind = 'local' as const;

  /**
   * 跑命令. 不抛异常 — 失败 / timeout 都在 result 里.
   *
   * 走 execFile 自身的 timeout 选项 (Node.js 内置): 到点 execFile 会 kill child +
   * 触发 callback 的 err. err.killed / err.signal 拿来填 SandboxRunResult.signal.
   */
  async run(req: SandboxRunRequest): Promise<SandboxRunResult> {
    const start = Date.now();
    const cap = req.stdoutCapBytes;

    return new Promise<SandboxRunResult>((resolve) => {
      execFile(
        req.command,
        [...req.args],
        {
          cwd: req.cwd,
          env: req.env ? { ...process.env, ...req.env } : process.env,
          maxBuffer: 10 * 1024 * 1024, // 10MB hard ceiling
          timeout: req.timeoutMs,
          killSignal: 'SIGTERM',
          encoding: 'buffer', // 拿 Buffer 不用 deal with string/Buffer 歧义
        },
        (err, stdout, stderr) => {
          const durationMs = Date.now() - start;
          if (err) {
            const e = err as Error & {
              code?: string | number;
              signal?: string;
              killed?: boolean;
            };
            const isSignalKill = e.signal === 'SIGTERM' || e.signal === 'SIGKILL' || e.killed;
            const exitCode =
              typeof e.code === 'number'
                ? e.code
                : typeof e.code === 'string' && /^\d+$/.test(e.code)
                ? Number(e.code)
                : null;
            resolve({
              ok: false,
              exitCode,
              stdoutTail: capTail(stdout as Buffer, cap).toString('utf8'),
              stderrTail: capTail(stderr as Buffer, cap).toString('utf8'),
              durationMs,
              ...(isSignalKill ? { signal: 'SIGTERM' as const } : {}),
            });
            return;
          }
          resolve({
            ok: true,
            exitCode: 0,
            stdoutTail: capTail(stdout as Buffer, cap).toString('utf8'),
            stderrTail: capTail(stderr as Buffer, cap).toString('utf8'),
            durationMs,
          });
        },
      );
    });
  }

  /** Local mode 无外部资源, cleanup 是 noop. */
  async cleanup(): Promise<void> {
    // noop — local exec 跑完进程就退出, 没有需要清理的
  }
}
