/**
 * @deepwhale/coding-agent — verify module entry
 *
 * 公开 runVerify + formatReport + 类型, 供 REPL `/verify` 跟 CLI `deepwhale --verify` 用.
 */

export {
  runVerify,
  detectContext,
  pickChecksForContext,
  resolveRunner,
  looksLikeSpawnError,
  type VerifyCheck,
  type VerifyCheckResult,
  type VerifyCheckStatus,
  type VerificationReport,
  type VerificationOverallStatus,
  type VerifyContext,
  type RunVerifyOptions,
} from './verify-runner.js';

export {
  formatReport,
  buildSummaryAndNext,
  type FormatReportOptions,
} from './format-report.js';
