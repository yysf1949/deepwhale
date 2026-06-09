/**
 * D-33.1.1 — Normalized tool result contract (v1.0 capability surface).
 *
 * 拍板: raw `ToolResult` 类型 (src/types.ts) **不** 改, 6 core tools 的 `execute()`
 * return type **不** 变. 这个文件是**纯** wrapper, 在 tool-loop 边界 (consumer)
 * 调 `normalizeToolResult(rawResult)` 拿 NormalizedToolResult, 给 v1.0+ 消费者
 * (recovery hint / next actions / artifacts) 走 1 个统一形状.
 *
 * raw → simple 转换的责任在 caller (用 raw.success / raw.content / raw.error
 * 构造 SimpleToolResult). 后续 sprint 可以加 rawResult → simple helper, 现在保持
 * 显式契约 (避免 raw 类型变更级联).
 */

export type ToolResultStatus = 'ok' | 'error';

export interface ToolRecovery {
  root_cause_hint: string;
  safe_retry: boolean;
  stop_condition: string;
}

export interface NormalizedToolResult {
  status: ToolResultStatus;
  summary: string;
  artifacts: ReadonlyArray<unknown>;
  next_actions: ReadonlyArray<string>;
  recovery: ToolRecovery | null;
}

export interface SimpleToolResult {
  ok: boolean;
  summary: string;
  error?: string;
}

export function normalizeToolResult(input: SimpleToolResult): NormalizedToolResult {
  if (input.ok) {
    return {
      status: 'ok',
      summary: input.summary,
      artifacts: [],
      next_actions: [],
      recovery: null,
    };
  }
  return {
    status: 'error',
    summary: input.summary,
    artifacts: [],
    next_actions: [],
    recovery: {
      root_cause_hint: input.error ?? 'unknown',
      safe_retry: false,
      stop_condition: 'input must change before retry',
    },
  };
}
