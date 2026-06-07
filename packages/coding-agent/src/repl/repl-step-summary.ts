/**
 * REPL step summary writer — Sprint 1c-revive-3-D-29.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1a 以来 appendStepSummary 是 repl.ts 内 module-private 函数, 人类可读
 *   step 摘要. 只覆盖 'tool' kind (assistant / limit / error 的 summary 留 Sprint 1b,
 *   不污染 Sprint 1a 验收面).
 *
 * 拍板 (D-29.2):
 *   - 文件: `repl-step-summary.ts` (kebab-case, 跟 `repl-format-error.ts` /
 *     `repl-compaction-summary.ts` / `repl-confirm.ts` 同形态).
 *   - 公共 API 0 改: runAgentTurn 走 `import { appendStepSummary } from
 *     './repl/repl-step-summary.js'`, 行为 1:1.
 *   - 行为 1:1: 函数体逐字迁移, 'tool' kind check + 状态字符 (✓/✗) + duration_ms
 *     输出 1:1. 'assistant' / 'limit' / 'error' 走 no-op (跟 Sprint 1a 拍板).
 *   - module-private (不 re-export): 跟现行为一致.
 *
 * 拍板 (D-29.2 §out of scope):
 *   - 不扩展 assistant / limit / error kind summary — 跟 Sprint 1a 拍板一致
 *     (不污染 Sprint 1a 验收面). 留给 Sprint 1b.
 *   - 不动 runAgentTurn — 留给 D-29.3+.
 */

import type { ToolLoopStep } from '../agent/index.js';

/**
 * 打印单条 step 摘要到 stdout/stderr. 'tool' kind 走 2 行格式
 * (status icon + name + duration, + 错误时附 1 行 detail). 其它 kind no-op.
 */
export function appendStepSummary(
  step: ToolLoopStep,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): void {
  if (step.kind === 'tool') {
    const status = step.result.success ? '✓' : '✗';
    out.write(`  ${status} ${step.tool_call.name} (${step.duration_ms}ms)\n`);
    if (!step.result.success && step.result.error) {
      err.write(`    ${step.result.error}\n`);
    }
  }
  // 'assistant' / 'limit' / 'error' 的 summary 留 Sprint 1b（不污染 Sprint 1a 验收面）
}
