/**
 * @deepwhale/core — 跨包共享的原子原语 + i18n + 类型 + Session JSONL
 *
 * 这是 deepwhale 4 包 monorepo 的根。所有包都依赖 core。
 * i18n 路径在 Sprint 0 第 1 行定对：core.i18n（避免 Hermes gateway.i18n 错误）。
 */

export * from './i18n/index.js';
export * from './types/index.js';
export * from './session/jsonl.js';
