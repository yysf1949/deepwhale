/**
 * @deepwhale/edit-engine — 可插拔的编辑原语抽象
 *
 * Sprint 0.1 落地：
 * - EditEngine interface（arch §2.3.2）
 * - HashlineEngine（v1.0 default，3-hex TAG 锚定）
 * - UnifiedDiffEngine stub（throw "not implemented"，v1.0 占位）
 *
 * 关键设计：hashline 是 Editing Primitive，不是核心卖点。
 * 未来可换 unified diff / AST patch —— edit_file tool 只依赖 EditEngine 接口。
 */

export type {
  EditEngine,
  EditIntent,
  ApplyResult,
  ApplyError,
  FileContent,
  EditAnchor,
} from './types.js';

export { HashlineEngine } from './engines/hashline/index.js';
export { UnifiedDiffEngine } from './engines/unified-diff/index.js';
export { createDefaultEngine, createEngine } from './registry.js';
