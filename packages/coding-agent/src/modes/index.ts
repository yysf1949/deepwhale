/**
 * @deepwhale/coding-agent/modes — CLI 运行模式
 *
 * Sprint 1a 落地：
 *   - interactive: REPL（repl.ts 已有，bin 直接复用 startRepl）
 *   - print:      一次性 chat + tool loop（脚本/CI 友好）
 *   - rpc:        NDJSON over stdio（编辑器/LSP 集成用）
 *
 * Sprint 1b 再加：rpc method 注册表（initialize / chat / cancel / shutdown）。
 */

export { runPrintMode } from './print.js';
export { runRpcMode } from './rpc.js';
