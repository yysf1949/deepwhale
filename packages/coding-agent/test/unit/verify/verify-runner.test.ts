/**
 * verify-runner 单测 — Sprint 1c-revive-2-D-11 (2026-06-04)
 *
 * 覆盖 (D-11 review 必做):
 *   - 4 步 default checks 形态 (build/lint/typecheck/test)
 *   - 单 step pass → overallStatus passed
 *   - 单 step fail → overallStatus failed, fail-fast 不继续后续
 *   - spawn-error (cwd 无效) → status='spawn-error', overallStatus failed
 *   - timeout → status='timed-out', overallStatus failed
 *   - stdout/stderr 截断 (cap 4KB)
 *   - 外部 AbortSignal 中断 → 后续 step 全部 mark 'spawn-error aborted'
 *   - continueOnError=true → 失败也继续, 整体 failed
 *   - 报告时长字段一致性 (durationMs = endedAt - startedAt)
 *   - 不暴露 key (run 真 child, 无 env 注入)
 *
 * 拍板: 跑真 child_process (node -e), 不 mock spawn — verify-runner 是 spawn 包装,
 * mock 了反而失去覆盖. 用 node -e 简单 echo 控制输出, 5ms 级单测速度.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runVerify,
  type VerifyCheck,
  type VerificationReport,
} from '../../../src/verify/verify-runner.js';

/** 用 node -e 跑一段 JS, 模拟 verify 步骤. 控制 exit code / stdout / stderr / delay. */
function nodeCheck(name: string, code: string, opts: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  delayMs?: number;
  timeoutMs?: number;
}): VerifyCheck {
  const exitCode = opts.exitCode ?? 0;
  const stdout = opts.stdout ?? '';
  const stderr = opts.stderr ?? '';
  const delayMs = opts.delayMs ?? 0;
  const parts = [
    `process.stdout.write(${JSON.stringify(stdout)});`,
    `process.stderr.write(${JSON.stringify(stderr)});`,
  ];
  if (delayMs > 0) {
    parts.push(`await new Promise((r) => setTimeout(r, ${delayMs}));`);
  }
  parts.push(`process.exit(${exitCode});`);
  const fullCode = parts.join('');
  // 写临时 JS 文件 (避免 -e 转义 + 长字符串不便)
  const tmpScript = join(tmpdir(), `dw-verify-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.js`);
  writeFileSync(tmpScript, fullCode);
  return {
    name,
    command: `node ${tmpScript}`,
    args: ['node', tmpScript],
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  };
}

describe('verify-runner (D-11 2026-06-04)', () => {
  let workDir: string;
  let cleanupFiles: string[] = [];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'dw-verify-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    for (const f of cleanupFiles) {
      try {
        rmSync(f, { force: true });
      } catch {
        /* best-effort */
      }
    }
    cleanupFiles = [];
  });

  describe('happy path: all 4 checks pass', () => {
    it('4 个简单 pass check → overallStatus passed', async () => {
      const report = await runVerify({
        cwd: workDir,
        checks: [
          nodeCheck('step1', '', { stdout: 'ok-1' }),
          nodeCheck('step2', '', { stdout: 'ok-2' }),
          nodeCheck('step3', '', { stdout: 'ok-3' }),
          nodeCheck('step4', '', { stdout: 'ok-4' }),
        ],
      });
      expect(report.overallStatus).toBe('passed');
      expect(report.checks).toHaveLength(4);
      for (const c of report.checks) {
        expect(c.status).toBe('passed');
        expect(c.exitCode).toBe(0);
      }
    });

    it('报告时长字段: durationMs ≈ endedAt - startedAt', async () => {
      const report = await runVerify({
        cwd: workDir,
        checks: [nodeCheck('s', '', { stdout: 'x' })],
      });
      expect(report.endedAt - report.startedAt).toBe(report.durationMs);
      expect(report.checks[0]!.endedAt - report.checks[0]!.startedAt).toBe(
        report.checks[0]!.durationMs,
      );
    });
  });

  describe('fail-fast (default)', () => {
    it('step 2 失败 → step 3/4 不跑, overallStatus failed', async () => {
      const report = await runVerify({
        cwd: workDir,
        checks: [
          nodeCheck('s1', '', { stdout: 'ok' }),
          nodeCheck('s2', '', { exitCode: 1, stderr: 'failed!' }),
          nodeCheck('s3', '', { stdout: 'should-not-run' }),
          nodeCheck('s4', '', { stdout: 'should-not-run' }),
        ],
      });
      expect(report.overallStatus).toBe('failed');
      expect(report.checks).toHaveLength(2); // fail-fast
      expect(report.checks[0]!.status).toBe('passed');
      expect(report.checks[1]!.status).toBe('failed');
      expect(report.checks[1]!.exitCode).toBe(1);
      expect(report.checks[1]!.stderrTail).toContain('failed!');
    });

    it('spawn-error (命令不存在) → status "spawn-error", overallStatus failed', async () => {
      const report = await runVerify({
        cwd: workDir,
        checks: [
          {
            name: 'ghost',
            command: 'nonexistent-binary-xyz-12345',
            args: ['nonexistent-binary-xyz-12345'],
          },
        ],
      });
      expect(report.overallStatus).toBe('failed');
      expect(report.checks[0]!.status).toBe('spawn-error');
      expect(report.checks[0]!.exitCode).toBeNull();
    });
  });

  describe('continueOnError: 真跑完全部, 整体仍 fail', () => {
    it('continueOnError=true → 4 check 全跑, overallStatus 仍 failed (因有非 pass)', async () => {
      const report = await runVerify({
        cwd: workDir,
        continueOnError: true,
        checks: [
          nodeCheck('s1', '', { exitCode: 1 }),
          nodeCheck('s2', '', { stdout: 'ok' }),
          nodeCheck('s3', '', { stdout: 'ok' }),
        ],
      });
      expect(report.overallStatus).toBe('failed');
      expect(report.checks).toHaveLength(3);
      expect(report.checks[0]!.status).toBe('failed');
      expect(report.checks[1]!.status).toBe('passed');
    });
  });

  describe('timeout', () => {
    it('check 超时 → status "timed-out", overallStatus failed', async () => {
      const report = await runVerify({
        cwd: workDir,
        checks: [
          nodeCheck('slow', '', { delayMs: 200, timeoutMs: 50 }),
        ],
      });
      expect(report.overallStatus).toBe('failed');
      expect(report.checks[0]!.status).toBe('timed-out');
      expect(report.checks[0]!.errorMessage).toMatch(/timeout/);
    });
  });

  describe('stdout/stderr 截断', () => {
    it('stdout > cap (默认 4KB) → 只保留尾 cap bytes', async () => {
      const big = 'A'.repeat(8000);
      const report = await runVerify({
        cwd: workDir,
        stdoutCapBytes: 1024, // 用 1KB 测快
        checks: [nodeCheck('big', '', { stdout: big })],
      });
      const c = report.checks[0]!;
      expect(c.status).toBe('passed');
      // Buffer.toString('utf8') 的字节数 = 字符串长度 (单字节字符)
      expect(c.stdoutTail.length).toBe(1024);
      // 应是末尾 1024 字符, 全是 'A'
      expect(c.stdoutTail).toBe('A'.repeat(1024));
    });

    it('stderr > cap → 同上, 只保留尾', async () => {
      const big = 'E'.repeat(8000);
      const report = await runVerify({
        cwd: workDir,
        stdoutCapBytes: 512,
        checks: [nodeCheck('big', '', { stderr: big })],
      });
      const c = report.checks[0]!;
      expect(c.stderrTail.length).toBe(512);
      expect(c.stderrTail).toBe('E'.repeat(512));
    });
  });

  describe('外部 AbortSignal', () => {
    it('signal 触发前跑完的 step 不受影响, 后续 step 标 spawn-error aborted', async () => {
      const ac = new AbortController();
      const reportPromise = runVerify({
        cwd: workDir,
        signal: ac.signal,
        checks: [
          nodeCheck('s1', '', { stdout: 'ok' }),
          nodeCheck('s2', '', { delayMs: 200 }), // 这个 200ms, 中途 abort
          nodeCheck('s3', '', { stdout: 'should-not-run' }),
        ],
      });
      // 跑 50ms 后 abort
      setTimeout(() => ac.abort(), 50);
      const report = await reportPromise;

      expect(report.overallStatus).toBe('failed');
      // s1 跑完 (50ms 内, delay 0)
      expect(report.checks[0]!.status).toBe('passed');
      // s2 还在跑, 被 signal 触发的内部逻辑也只影响**下**一 step
      // 实际: s2 自己跑完 (200ms 后), 跟 abort 关系是 race condition
      // 拍板: 我们只断言 s3 没跑 (status='spawn-error', errorMessage 含 'aborted')
      const s3 = report.checks.find((c) => c.name === 's3');
      expect(s3).toBeDefined();
      expect(s3!.status).toBe('spawn-error');
      expect(s3!.errorMessage).toMatch(/aborted/);
    });
  });

  describe('空 checks 列表', () => {
    it('checks=[] → 0 check, overallStatus passed (无失败 = 通过)', async () => {
      const report = await runVerify({ cwd: workDir, checks: [] });
      expect(report.overallStatus).toBe('passed');
      expect(report.checks).toHaveLength(0);
    });
  });

  describe('summary 跟 nextSuggestedAction 留空 (caller 写)', () => {
    it('runner 不写 summary / nextSuggestedAction (纯函数语义)', async () => {
      const report: VerificationReport = await runVerify({
        cwd: workDir,
        checks: [nodeCheck('s', '', { stdout: 'x' })],
      });
      expect(report.summary).toBe('');
      expect(report.nextSuggestedAction).toBe('');
    });
  });

  describe('无 key / env 暴露 (红线: verify 不读 .env, 不 log key)', () => {
    it('check 自报 env 内容: 应只看到 process.env 透传, 不被注入 DEEPSEEK_API_KEY', async () => {
      // 写一个 node 脚本, dump process.env['DEEPSEEK_API_KEY'] 值
      const tmpScript = join(workDir, 'env-dump.js');
      writeFileSync(
        tmpScript,
        `process.stdout.write('KEY=[' + (process.env.DEEPSEEK_API_KEY || '<unset>') + ']');`,
      );
      // 显式 unset 避免泄漏
      const orig = process.env['DEEPSEEK_API_KEY'];
      delete process.env['DEEPSEEK_API_KEY'];
      try {
        const report = await runVerify({
          cwd: workDir,
          checks: [
            { name: 'env-dump', command: `node ${tmpScript}`, args: ['node', tmpScript] },
          ],
        });
        expect(report.checks[0]!.status).toBe('passed');
        expect(report.checks[0]!.stdoutTail).toBe('KEY=[<unset>]');
        // runner 不应该注入任何 key (透传 env 走 process.env, 不会主动 set)
      } finally {
        if (orig !== undefined) process.env['DEEPSEEK_API_KEY'] = orig;
      }
    });
  });
});
