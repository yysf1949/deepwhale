/**
 * format-report 单测 — Sprint 1c-revive-2-D-11 (2026-06-04)
 *
 * 覆盖 (D-11 必做):
 *   - 4 步全 pass → "pass" header
 *   - 任一 fail → "FAIL" header, 失败 step 附 stderr tail
 *   - timeout 跟 spawn-error 状态对 (icon 跟 status text)
 *   - summary 跟 nextSuggestedAction 由 buildSummaryAndNext 拍
 *   - verbose=false 不打 stdout tail, verbose=true 打
 *   - tailLines 控制 tail 行数
 *   - 不暴露 key (caller 责任, formatter 透明)
 */
import { describe, expect, it } from 'vitest';
import {
  buildSummaryAndNext,
  formatReport,
} from '../../../src/verify/format-report.js';
import type { VerificationReport } from '../../../src/verify/verify-runner.js';

function makeReport(overrides?: Partial<VerificationReport>): VerificationReport {
  return {
    startedAt: 1_000_000,
    endedAt: 1_001_000,
    durationMs: 1000,
    overallStatus: 'passed',
    summary: '',
    nextSuggestedAction: '',
    checks: [
      {
        name: 'build',
        command: 'corepack pnpm build',
        status: 'passed',
        exitCode: 0,
        startedAt: 1_000_000,
        endedAt: 1_000_200,
        durationMs: 200,
        stdoutTail: 'built',
        stderrTail: '',
      },
    ],
    ...overrides,
  };
}

describe('format-report (D-11 2026-06-04)', () => {
  describe('header', () => {
    it('overallStatus=passed → header "pass"', () => {
      const out = formatReport(makeReport());
      expect(out).toMatch(/^deepwhale verify — pass/);
    });

    it('overallStatus=failed → header "FAIL"', () => {
      const out = formatReport(makeReport({ overallStatus: 'failed' }));
      expect(out).toMatch(/^deepwhale verify — FAIL/);
    });

    it('duration < 1s → "Xms"', () => {
      const out = formatReport(makeReport({ durationMs: 234 }));
      expect(out).toMatch(/234ms/);
    });

    it('duration 30s → "30.0s"', () => {
      const out = formatReport(makeReport({ durationMs: 30_000 }));
      expect(out).toMatch(/30\.0s/);
    });

    it('duration 75s → "1m 15s"', () => {
      const out = formatReport(makeReport({ durationMs: 75_000 }));
      expect(out).toMatch(/1m 15s/);
    });
  });

  describe('每步 status', () => {
    it('passed → "✓" icon, 无 status text', () => {
      const out = formatReport(makeReport());
      expect(out).toMatch(/✓ build/);
      expect(out).not.toMatch(/build.*\(passed/);
    });

    it('failed → "✗" icon, 附 "failed exit 1"', () => {
      const out = formatReport(
        makeReport({
          overallStatus: 'failed',
          checks: [
            {
              name: 'test',
              command: 'corepack pnpm test',
              status: 'failed',
              exitCode: 1,
              startedAt: 1_000_000,
              endedAt: 1_001_000,
              durationMs: 1000,
              stdoutTail: '',
              stderrTail: 'Error: test 42 failed',
            },
          ],
        }),
      );
      expect(out).toMatch(/✗ test/);
      expect(out).toMatch(/failed.*exit 1/);
      expect(out).toMatch(/Error: test 42 failed/);
      expect(out).toMatch(/stderr tail/);
    });

    it('timed-out → "⏱" icon, errorMessage 出现', () => {
      const out = formatReport(
        makeReport({
          overallStatus: 'failed',
          checks: [
            {
              name: 'slow',
              command: 'corepack pnpm test',
              status: 'timed-out',
              exitCode: null,
              startedAt: 1_000_000,
              endedAt: 1_300_000,
              durationMs: 300_000,
              stdoutTail: '',
              stderrTail: '',
              errorMessage: 'timeout after 300000ms',
            },
          ],
        }),
      );
      expect(out).toMatch(/⏱ slow/);
      expect(out).toMatch(/timed-out/);
      expect(out).toMatch(/timeout after 300000ms/);
    });

    it('spawn-error → "⚠" icon, errorMessage 出现', () => {
      const out = formatReport(
        makeReport({
          overallStatus: 'failed',
          checks: [
            {
              name: 'ghost',
              command: 'nonexistent',
              status: 'spawn-error',
              exitCode: null,
              startedAt: 1_000_000,
              endedAt: 1_000_010,
              durationMs: 10,
              stdoutTail: '',
              stderrTail: '',
              errorMessage: 'spawn ENOENT',
            },
          ],
        }),
      );
      expect(out).toMatch(/⚠ ghost/);
      expect(out).toMatch(/spawn-error/);
      expect(out).toMatch(/spawn ENOENT/);
    });
  });

  describe('verbose / tailLines', () => {
    it('verbose=false → 不打 stdout tail', () => {
      const out = formatReport(
        makeReport({
          overallStatus: 'failed',
          checks: [
            {
              name: 'x',
              command: 'c',
              status: 'failed',
              exitCode: 1,
              startedAt: 0,
              endedAt: 1,
              durationMs: 1,
              stdoutTail: 'STDOUT-12345',
              stderrTail: 'STDERR-12345',
            },
          ],
        }),
      );
      expect(out).not.toMatch(/STDOUT-12345/);
      expect(out).toMatch(/STDERR-12345/);
    });

    it('verbose=true → 也打 stdout tail', () => {
      const out = formatReport(
        makeReport({
          overallStatus: 'failed',
          checks: [
            {
              name: 'x',
              command: 'c',
              status: 'failed',
              exitCode: 1,
              startedAt: 0,
              endedAt: 1,
              durationMs: 1,
              stdoutTail: 'STDOUT-12345',
              stderrTail: 'STDERR-12345',
            },
          ],
        }),
        { verbose: true },
      );
      expect(out).toMatch(/STDOUT-12345/);
      expect(out).toMatch(/STDERR-12345/);
      expect(out).toMatch(/stdout tail \(verbose\)/);
    });

    it('tailLines=2 → 只打最后 2 行 stderr', () => {
      const out = formatReport(
        makeReport({
          overallStatus: 'failed',
          checks: [
            {
              name: 'x',
              command: 'c',
              status: 'failed',
              exitCode: 1,
              startedAt: 0,
              endedAt: 1,
              durationMs: 1,
              stdoutTail: '',
              stderrTail: 'line1\nline2\nline3\nline4',
            },
          ],
        }),
        { tailLines: 2 },
      );
      expect(out).toMatch(/line3/);
      expect(out).toMatch(/line4/);
      expect(out).not.toMatch(/line1/);
      expect(out).not.toMatch(/line2/);
    });
  });

  describe('buildSummaryAndNext', () => {
    it('全 pass → summary "N/N checks passed", next "all green"', () => {
      const report = makeReport({
        overallStatus: 'passed',
        summary: '',
        nextSuggestedAction: '',
        checks: [
          ...Array.from({ length: 4 }, (_, i) => ({
            name: `s${i + 1}`,
            command: 'c',
            status: 'passed' as const,
            exitCode: 0,
            startedAt: 0,
            endedAt: 1,
            durationMs: 1,
            stdoutTail: '',
            stderrTail: '',
          })),
        ],
      });
      const { summary, nextSuggestedAction } = buildSummaryAndNext(report);
      expect(summary).toBe('4/4 checks passed');
      expect(nextSuggestedAction).toMatch(/all green/);
    });

    it('有 fail → summary "X/N checks failed", next 指向首个失败', () => {
      const report = makeReport({
        overallStatus: 'failed',
        summary: '',
        nextSuggestedAction: '',
        checks: [
          {
            name: 'build',
            command: 'c',
            status: 'passed',
            exitCode: 0,
            startedAt: 0,
            endedAt: 1,
            durationMs: 1,
            stdoutTail: '',
            stderrTail: '',
          },
          {
            name: 'lint',
            command: 'c',
            status: 'failed',
            exitCode: 1,
            startedAt: 0,
            endedAt: 1,
            durationMs: 1,
            stdoutTail: '',
            stderrTail: '',
          },
        ],
      });
      const { summary, nextSuggestedAction } = buildSummaryAndNext(report);
      expect(summary).toBe('1/2 checks failed');
      expect(nextSuggestedAction).toMatch(/lint/);
    });

    it('timeout 失败 → next 提示 investigate timeout', () => {
      const report = makeReport({
        overallStatus: 'failed',
        summary: '',
        nextSuggestedAction: '',
        checks: [
          {
            name: 'test',
            command: 'c',
            status: 'timed-out',
            exitCode: null,
            startedAt: 0,
            endedAt: 1,
            durationMs: 1,
            stdoutTail: '',
            stderrTail: '',
            errorMessage: 'timeout after 300000ms',
          },
        ],
      });
      const { nextSuggestedAction } = buildSummaryAndNext(report);
      expect(nextSuggestedAction).toMatch(/investigate timeout/);
      expect(nextSuggestedAction).toMatch(/test/);
    });

    it('pass + logFilePath → next 包含 log 路径', () => {
      const report = makeReport({
        overallStatus: 'passed',
        summary: '',
        nextSuggestedAction: '',
      });
      const { nextSuggestedAction } = buildSummaryAndNext(report, {
        logFilePath: '/tmp/deepwhale-verify.log',
      });
      expect(nextSuggestedAction).toMatch(/log.*\/tmp\/deepwhale-verify\.log/);
    });
  });
});
