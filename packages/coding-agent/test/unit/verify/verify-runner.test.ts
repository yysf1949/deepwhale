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
  resolveRunner,
  renderInstalledChecks,
  looksLikeSpawnError,
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
    // D-11-4 review P2 修复: signal 触发时 kill 当前 child (SIGTERM → 1s grace →
    // SIGKILL), 返回 status='aborted'. 旧测试只断言 "s3 没跑 + 标 spawn-error",
    // 那是"signal 只影响下一 step" 的旧拍板. 修复后 s2 自己被 kill, s2 status = 'aborted',
    // fail-fast break, s3 不会 push 进 results.
    it('signal 触发时 kill 当前 child, status=aborted, fail-fast break 后 s3 不进 results', async () => {
      // Sprint D-20.7.8 (2026-06-06): 从 50ms 增至 1000ms, 给 Win32 spawn 足够 margin.
      // 旧测 50ms 太紧: Win32 上 s1 (delay:0) 还在 CreateProcessW, abort listener fire
      // 时 s1 没跑完, 报 aborted 不是 passed. 新测: 1000ms (20x 比旧), s1 在任何平台上
      // <100ms 跑完, abort 永远打 s2 (delay 1000ms 跑一半). 不完美但实用 — 跟替换 inline
      // 拉长比 50ms 竞态根因是值太紧, 不是 sleep 本身.
      const ac = new AbortController();
      const reportPromise = runVerify({
        cwd: workDir,
        signal: ac.signal,
        checks: [
          nodeCheck('s1', '', { stdout: 'ok' }),
          nodeCheck('s2', '', { delayMs: 1000 }), // 1000ms delay, 1000ms 时 abort → 应被 kill
          nodeCheck('s3', '', { stdout: 'should-not-run' }),
        ],
      });
      // 跑 1000ms 后 abort (vs 之前 50ms)
      setTimeout(() => ac.abort(), 1000);
      const report = await reportPromise;

      expect(report.overallStatus).toBe('failed');
      // s1 跑完 (1000ms 内, delay 0)
      expect(report.checks[0]!.status).toBe('passed');
      // s2 还在跑被 signal 干掉: status='aborted', errorMessage 含 'aborted'
      const s2 = report.checks.find((c) => c.name === 's2');
      expect(s2).toBeDefined();
      expect(s2!.status).toBe('aborted');
      expect(s2!.errorMessage).toMatch(/aborted/);
      // s3 fail-fast break 后**不**进 results
      const s3 = report.checks.find((c) => c.name === 's3');
      expect(s3).toBeUndefined();
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

  describe('Windows runner resolution (D-11-4 review P1 修复, 2026-06-04)', () => {
    // 拍板: Linux/macOS 下 corepack 直走 CreateProcessW 解析得到, 不需 .cmd shim.
    // Windows 上 Node 默认 spawn 走 CreateProcessW 不接 .cmd, 必须显式 .cmd 后缀.
    // resolveRunner 单元验证平台分支, 不动 process.platform 避免污染其它单测.
    it('Linux: corepack 透传不变', () => {
      expect(resolveRunner('corepack', 'linux')).toBe('corepack');
      expect(resolveRunner('corepack', 'darwin')).toBe('corepack');
    });
    it('Windows: corepack 转 corepack.cmd', () => {
      expect(resolveRunner('corepack', 'win32')).toBe('corepack.cmd');
    });
    it('Windows: 其它可执行 (node/bash) 不转换, 跟单测 mock 各种 runner 兼容', () => {
      expect(resolveRunner('node', 'win32')).toBe('node');
      expect(resolveRunner('bash', 'win32')).toBe('bash');
      expect(resolveRunner('my-tool.exe', 'win32')).toBe('my-tool.exe');
    });
    it('Linux: 任何 runner 透传, 不强制加 .cmd', () => {
      expect(resolveRunner('my-tool.exe', 'linux')).toBe('my-tool.exe');
      expect(resolveRunner('corepack.cmd', 'linux')).toBe('corepack.cmd');
    });
  });

  // D-25 A3 (F3, 2026-06-06): installed 4 check shell-safe args 形态 regression
  // 修前: bin-check 走 `test -f` POSIX 标志 (cmd.exe / PowerShell 不可用, 装出必挂)
  // 修后: 全部 4 check args[0]==='node' (跨平台一致)
  describe('installed 4 check shell-safe args (D-25 A3 F3)', () => {
    const checks = renderInstalledChecks('/fake/pkg/root');
    it('应返回 4 个 check (syntax / import / bin / exports)', () => {
      expect(checks).toHaveLength(4);
      expect(checks.map(c => c.name).sort()).toEqual(['bin-check', 'exports-check', 'import-check', 'syntax-check']);
    });
    it('全部 4 check args[0] === "node" (跨平台一致)', () => {
      for (const c of checks) {
        expect(c.args[0]).toBe('node');
      }
    });
    it('args[1] 不是 POSIX 标志 (--check / -e 才是合规)', () => {
      // 修前 bin-check: args[1] === 'test' (POSIX builtin), Win32 不可用
      // 修后: 全部走 'node' + ('--check' | '-e'), 跨平台
      for (const c of checks) {
        const second = c.args[1];
        // 合规: --check (syntax) / -e (import/bin/exports) / 其它 node 标志
        // 不合规: 'test' / 'ls' / 任何 POSIX builtin
        expect(['--check', '-e']).toContain(second);
      }
    });
    it('bin-check 不再用 `test -f`, 改 `node -e` inline JS', () => {
      const bin = checks.find(c => c.name === 'bin-check')!;
      expect(bin.args).toEqual(['node', '-e', expect.stringContaining("require('fs').existsSync")]);
      // 不应有 'test' 标志
      expect(bin.args).not.toContain('test');
    });
    it('import-check 跟 exports-check 走 cwd = node_modules 父目录', () => {
      const imp = checks.find(c => c.name === 'import-check')!;
      const exp = checks.find(c => c.name === 'exports-check')!;
      // 包根 = /fake/pkg/root, 父目录 = /fake/pkg (Node 解析包名从这起找 node_modules)
      expect(imp.cwd).toBe('/fake/pkg');
      expect(exp.cwd).toBe('/fake/pkg');
    });
    it('syntax-check 跟 bin-check 用绝对路径, 不需要特殊 cwd', () => {
      const syn = checks.find(c => c.name === 'syntax-check')!;
      const bin = checks.find(c => c.name === 'bin-check')!;
      expect(syn.cwd).toBeUndefined();
      expect(bin.cwd).toBeUndefined();
    });
  });

  // D-25 A2 (F5, 2026-06-06): looksLikeSpawnError 收窄 regression 测
  // 修前: 短匹配 `/No such file/i` 误伤 Vitest ENOENT 业务错误, 误报 spawn-error
  // 修后: 仅 5 关键词 (cmd.exe / bash / PowerShell), Vitest ENOENT 业务错误
  //       走真实 status='failed' 路径 (D-25 plan F5, 2026-06-06 22:50 用户拍板"更激进删")
  describe('looksLikeSpawnError 收窄 (D-25 A2 F5)', () => {
    // 期望命中 (真 spawn-error 文本)
    it('cmd.exe: "is not recognized" 命中', () => {
      expect(looksLikeSpawnError('', `'foo' is not recognized as an internal or external command`, 1)).toBe(true);
    });
    it('cmd.exe: "cannot find the path" 命中', () => {
      expect(looksLikeSpawnError('', `The system cannot find the path specified.`, 1)).toBe(true);
    });
    it('POSIX bash: "command not found" 命中', () => {
      expect(looksLikeSpawnError('', `bash: foo: command not found`, 127)).toBe(true);
    });
    it('PowerShell: "is not a recognized command" 命中', () => {
      expect(looksLikeSpawnError('', `foo : The term 'foo' is not recognized as the name of a cmdlet, function, script file, or operable program.`, 1)).toBe(true);
    });
    // 期望不命中 (业务 ENOENT 误伤源, D-25 A2 修后)
    it('Vitest ENOENT 业务错误: "no such file or directory" 完整短语 — 现在 false (D-25 A2 更激进删)', () => {
      // 修前 (6 patterns): 命中 (误报 spawn-error) → status='spawn-error' 错
      // 修后 (5 patterns): 不命中 → status 走 'failed' 真实业务失败
      // 用户 22:50 拍板: 同时删短匹配 + 完整短语, 不留 POSIX 文本 (跟
      //   memory §10c 7 关键词 shape 不变量兼容, 实测业务里更干净)
      const stderr = `Error: ENOENT: no such file or directory, open '/tmp/missing.txt'`;
      expect(looksLikeSpawnError('', stderr, 1)).toBe(false);
    });
    it('exit code 0: 任何文本都不命中', () => {
      expect(looksLikeSpawnError('No such file or directory', 'is not recognized', 0)).toBe(false);
    });
  });
});
