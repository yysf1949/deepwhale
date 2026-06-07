/**
 * REPL LLM error formatter — Sprint 1c-revive-3-D-29.2 (2026-06-07).
 *
 * 历史:
 *   Sprint 1a 以来 formatError 是 repl.ts 内 module-private 函数, 把 LLMClient / tool
 *   loop 抛的 Error 转成 i18n 文案. Sprint 1c-revive-2-D-19.6.1 拍板 error 分支
 *   顺序: signal.aborted > isToolLoopError > isLLMError > unknown.
 *
 * 拍板 (D-29.2):
 *   - 文件: `repl-format-error.ts` (kebab-case, 跟 `repl-confirm.ts` /
 *     `repl-signal-coordinator.ts` / `repl-session.ts` 同形态).
 *   - 公共 API 0 改: repl.ts 内 `runOneTurn` 跟 `runAgentTurn` 都通过
 *     `import { formatError } from './repl/repl-format-error.js'` 调, 行为 1:1.
 *   - 行为 1:1: 函数体逐字迁移, instanceof 检查顺序 + i18n key 调用 1:1.
 *   - module-private (不 re-export): 跟现行为一致, 外部 caller 调 `runOneTurn`
 *     即可, 拿不到 formatError. 未来真要 re-export, 走 D-29.1.2 形态
 *     (formatUsageStatus re-export 拍板).
 *
 * 拍板 (D-29.2 §out of scope):
 *   - 不抽 i18n key 常量 — 让 t() 调用保持 inline 形态, 跟 D-25 拍板一致.
 *   - 不动 runOneTurn / runAgentTurn — 留给 D-29.3+.
 */

import { t } from '@deepwhale/core';
import {
  APIKeyMissingError,
  isLLMError,
  LLMAuthError,
  LLMClient,
  LLMNetworkError,
  LLMRateLimitError,
  LLMStreamError,
  LLMUnknownError,
} from '@deepwhale/llm';
import { ToolLoopLimitError } from '../agent/index.js';

/**
 * 把 LLMClient / tool loop 抛的 Error 转成 i18n 文案. 逐字保 Sprint 1a 行为.
 */
export function formatError(e: unknown): string {
  if (e instanceof APIKeyMissingError) return t('error.api_key_missing');
  if (e instanceof LLMAuthError) {
    // Sprint 1b.5 Step 2.5 修: tsc strict 看 LLMAuthError.status 在 .status 上
    return t('cli.error.auth', String((e as { status: number }).status));
  }
  if (e instanceof LLMRateLimitError) return t('cli.error.rate_limit');
  if (e instanceof LLMNetworkError) {
    const err = e as { cause?: unknown; message: string };
    const msg = err.cause instanceof Error ? err.cause.message : err.message;
    return t('cli.error.network', msg);
  }
  if (e instanceof LLMStreamError) {
    return t('cli.error.stream', (e as Error).message);
  }
  if (e instanceof LLMUnknownError) {
    const err = e as { status?: number; message: string };
    const detail = err.status !== undefined ? `HTTP ${err.status}` : err.message;
    return t('cli.error.unknown', detail);
  }
  if (e instanceof ToolLoopLimitError) {
    return t('cli.tool_loop_limit', (e as { steps: number }).steps);
  }
  if (isLLMError(e)) return t('cli.error.unknown', e.message);
  if (e instanceof Error) return t('cli.error.unknown', e.message);
  return t('cli.error.unknown', String(e));
}
