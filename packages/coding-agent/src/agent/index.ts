/**
 * @deepwhale/coding-agent/agent — Tool Loop & 调度
 *
 * Sprint 1a 落地：
 * - runToolLoop: 最小 agent loop（LLM ↔ tool_calls ↔ LLM）
 * - ToolLoopLimitError: maxSteps 触顶时抛
 * - session-adapter: tool loop step ↔ JSONL SessionEvent 转换
 *
 * Sprint 1b 再加：plan mode、schema 校验、budget cap、onStep 实时回调。
 * Sprint 2+ 再加：并行 tool_call、recovery 3-way、断点续传。
 */

export {
  runToolLoop,
  isToolLoopError,
  TOOL_LOOP_DEFAULT_MAX_STEPS,
  type ToolLoopOptions,
  type ToolLoopResult,
  type ToolLoopStep,
  ToolLoopLimitError,
} from './tool-loop.js';
export {
  toolLoopStepToSessionEvent,
  sessionEventsToMessages,
  appendUserEvent,
  appendCompactionEvent,
  appendCompactionPausedEvent,
  appendVerificationEvent,
  persistToolLoopSteps,
  loadSession,
} from './session-adapter.js';
export {
  runToolLoopWithCompaction,
  estimateContextTokens,
  type AgentCompactionConfig,
} from './agent-compaction.js';
// D-128: Export runToolLoopWithReview for v3.0/v4.0 integration
export {
  runToolLoopWithReview,
  type RunCommandWithReviewOptions,
  type RunCommandWithReviewResult,
} from './tool-loop-policy.js';
// Re-export core compaction types for caller convenience
export { CompactionState, type CompactionConfig } from '@deepwhale/core';
