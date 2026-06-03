/**
 * 跨包共享的原子类型 — Sprint 0 占位。
 * Sprint 1+ 把 Task / Message / Context / Observation / Memory 移到这里（来自 AGENT_RUNTIME.md）。
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type FilePath = Brand<string, 'FilePath'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ToolName = Brand<string, 'ToolName'>;
