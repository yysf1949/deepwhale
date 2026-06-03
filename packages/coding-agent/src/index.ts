/**
 * @deepwhale/coding-agent — Coding Agent CLI + 工具运行时
 *
 * Sprint 0.2 落地：
 * - 6 工具骨架：bash / read_file / write_file / edit_file / find / grep
 * - Tool Registry 抽象
 * - Tool ↔ EditEngine 桥接（edit_file 走 EditEngine 接口，不直接 import hashline）
 *
 * Sprint 0.3 落地：CLI 入口 + REPL + LLM 客户端
 */

export * from './tools/index.js';
export * from './tools/registry.js';
export * from './types.js';
