/**
 * @deepwhale/coding-agent — Verify report formatter
 *
 * Sprint 1c-revive-2-D-11 (2026-06-04): 把 `VerificationReport` 渲染成人类可读文本.
 * REPL `/verify` 跟 CLI `deepwhale --verify` 都用这个 formatter, 风格统一.
 *
 * 拍板 (D-11, 2026-06-04):
 *   - 简洁优先, 跟 REPL greeting / goodbye 风格一致
 *   - 每步 1 行 status, 失败时附带 tail
 *   - 不打印 key, 不打印 session 路径, 不打印 .env 路径
 *   - summary 跟 nextSuggestedAction 由 formatter 拍 (跟 D-11 拍板 "runner 纯函数,
 *     formatter 写自然语言" 一致)
 *
 * @module @deepwhale/coding-agent/format-report
 */

import type {
  VerifyCheckResult,
  VerifyCheckStatus,
  VerificationReport,
} from './verify-runner.js';

const STATUS_ICON: Readonly<Record<VerifyCheckStatus, string>> = {
  passed: '✓',
  failed: '✗',
  'timed-out': '⏱',
  'spawn-error': '⚠',
};

/**
 * 把 `VerificationReport` 渲染成多行文本.
 *
 * 风格:
 *   deepwhale verify — pass (1m 23s)
 *
 *   ✓ build    12.3s
 *   ✓ lint      4.1s
 *   ✗ test     67.0s  (exit 1)
 *     stderr tail:
 *     ...last 8 lines of stderr...
 *
 *   Summary: 1/4 checks failed (test exit 1).
 *   Next: re-run after fixing failing test, or see /tmp/deepwhale-verify.log.
 *
 * @param report `runVerify()` 返回的报告
 * @param options.verbose 默认 false. true 时**不**截断 stdout/stderr 印全 (单测 debug 用)
 */
export interface FormatReportOptions {
  verbose?: boolean;
  /** stderrTail / stdoutTail 印几行. 默认 8. */
  tailLines?: number;
  /** 报告写入文件路径建议 (显示在 nextSuggestedAction 里). 不传不写. */
  logFilePath?: string;
}

export function formatReport(
  report: VerificationReport,
  options: FormatReportOptions = {},
): string {
  const verbose = options.verbose ?? false;
  const tailLines = options.tailLines ?? 8;
  const lines: string[] = [];

  // Header
  const duration = formatDuration(report.durationMs);
  const headerStatus = report.overallStatus === 'passed' ? 'pass' : 'FAIL';
  lines.push(`deepwhale verify — ${headerStatus} (${duration})`);
  lines.push('');

  // 每步
  for (const check of report.checks) {
    const icon = STATUS_ICON[check.status];
    const dur = formatDuration(check.durationMs);
    const statusText = check.status === 'passed' ? '' : `  (${check.status}`;
    const exitPart = check.exitCode !== null ? ` exit ${check.exitCode}` : '';
    const closeParen = check.status === 'passed' ? '' : exitPart + ')';
    lines.push(`  ${icon} ${check.name.padEnd(10)} ${dur}${statusText}${closeParen}`);

    // 失败时附 tail
    if (check.status !== 'passed') {
      if (check.errorMessage) {
        lines.push(`    error: ${check.errorMessage}`);
      }
      const stderrTail = tailLinesOf(check.stderrTail, tailLines);
      if (stderrTail) {
        lines.push(`    stderr tail:`);
        for (const line of stderrTail.split('\n')) {
          lines.push(`    ${line}`);
        }
      }
      if (verbose) {
        const stdoutTail = tailLinesOf(check.stdoutTail, tailLines);
        if (stdoutTail) {
          lines.push(`    stdout tail (verbose):`);
          for (const line of stdoutTail.split('\n')) {
            lines.push(`    ${line}`);
          }
        }
      }
    }
  }

  lines.push('');
  lines.push(`Summary: ${report.summary}`);
  if (report.nextSuggestedAction) {
    lines.push(`Next: ${report.nextSuggestedAction}`);
  }
  return lines.join('\n');
}

/**
 * 简化 summary 跟 nextSuggestedAction — 之前 runner 留空, formatter 拍.
 * 拍板 (D-11, 2026-06-04): summary 给"X/Y pass", nextSuggestedAction 给 fix 提示.
 */
export function buildSummaryAndNext(
  report: VerificationReport,
  options: { logFilePath?: string } = {},
): { summary: string; nextSuggestedAction: string } {
  const total = report.checks.length;
  const passed = report.checks.filter((c) => c.status === 'passed').length;
  const summary = `${passed}/${total} checks ${report.overallStatus === 'passed' ? 'passed' : 'failed'}`;

  let next: string;
  if (report.overallStatus === 'passed') {
    next = options.logFilePath
      ? `all green; full log: ${options.logFilePath}`
      : 'all green; ready to commit';
  } else {
    const failed = report.checks.filter((c) => c.status !== 'passed');
    const firstFailed = failed[0];
    if (firstFailed?.status === 'timed-out') {
      next = `investigate timeout in ${firstFailed.name} (${firstFailed.durationMs}ms)`;
    } else if (firstFailed?.status === 'spawn-error') {
      next = `fix spawn error in ${firstFailed.name}: ${firstFailed.errorMessage ?? 'unknown'}`;
    } else {
      next = `fix failing check: ${firstFailed?.name ?? '?'} (see stderr tail above)`;
    }
  }
  return { summary, nextSuggestedAction: next };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s - m * 60);
  return `${m}m ${rem}s`;
}

function tailLinesOf(s: string, n: number): string {
  if (s.length === 0) return '';
  const lines = s.split('\n');
  if (lines.length <= n) return s.trimEnd();
  // 取最后 n 行, 然后 join 回 "\n" (不是 "," 也不是 "")
  return lines.slice(-n).join('\n');
}

/** @internal — 单步 status helper, 跟 status 字段对齐. 单测用. */
export function _checkStatusIcon(status: VerifyCheckStatus): string {
  return STATUS_ICON[status];
}

/** @internal — 单测用: 提取 check 简短描述. */
export function _describeCheck(c: VerifyCheckResult): string {
  return `${c.name} ${c.status} (${c.durationMs}ms, exit ${c.exitCode ?? 'null'})`;
}
