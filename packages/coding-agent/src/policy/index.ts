/**
 * @deepwhale/coding-agent/policy — Tool call policy.
 *
 * Sprint 1c-revive-2-D-24.2 (2026-06-06): 新建 policy/index.ts 让顶层
 * `export * from './policy/index.js'` 能 re-export (供 tui-ink 子包使用).
 *
 * 之前没有 index.ts — D-24.1 之前只有内部消费 (repl/print/rpc), 顶层不 export.
 * D-24.2 tui-ink 走同样的 ToolPolicy 容器迁移, 需要顶层 import.
 *
 * 业务逻辑 0 重写: 单纯 barrel re-export, 跟其他 index.ts 一致.
 */

export type { ToolPolicy, PolicyDecision, PolicyToolCall, PolicyContext } from './types.js'
export { staticToolPolicy } from './static-rules.js'
export { evaluatePolicy } from './chain.js'
export { computeArgsDigest } from './args-digest.js'
export { sanitizeReason } from './sanitize-reason.js'
