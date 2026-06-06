/**
 * @deepwhale/coding-agent — Coding Agent CLI + 工具运行时
 *
 * Sprint 0.2 落地：
 * - 6 工具骨架：bash / read_file / write_file / edit_file / find / grep
 * - Tool Registry 抽象
 * - Tool ↔ EditEngine 桥接（edit_file 走 EditEngine 接口，不直接 import hashline）
 *
 * Sprint 0.3 落地：CLI 入口 + REPL + LLM 客户端
 * - runOneTurn: 单轮 chat 单元（无 readline 依赖，单测 100% 覆盖）
 * - startRepl:  readline 循环 + 内建命令 + 错误友好提示
 *
 * Sprint 1a 落地：最小 Agent Loop
 * - runToolLoop: LLM ↔ tool_calls ↔ LLM 闭环
 * - ToolLoopLimitError: maxSteps 触顶时抛
 */

export * from './tools/index.js';
export * from './tools/registry.js';
export * from './types.js';
export * from './agent/index.js';
export * from './modes/index.js';
export * from './verify/index.js'; // Sprint 1c-revive-2-D-11-4 (2026-06-04): verify module
export * from './policy/index.js'; // Sprint 1c-revive-2-D-24.2 (2026-06-06): tui-ink needs ToolPolicy/staticToolPolicy
export { startRepl, runOneTurn, formatUsageStatus, createReplConfirm } from './repl.js';
export type { ReplConfirmController, ReplConfirmOptions, ReplConfirm } from './repl/repl-confirm.js';
export type { ReplOptions } from './repl.js';
