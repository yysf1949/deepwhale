/**
 * 跨包共享的 tool 类型（被工具实现和 registry 共同使用）
 */

import type { ToolName } from '@deepwhale/core';
export type { ToolName };

/**
 * 工具输入 schema — 用 zod-like 的简化结构（避免 Sprint 0 拉 zod 依赖）
 * Sprint 1 再决定是否引入 zod
 */
export type ToolInputSchema = {
  readonly type: 'object';
  readonly properties: Record<string, ToolParamSchema>;
  readonly required?: ReadonlyArray<string>;
};

export type ToolParamSchema =
  | { type: 'string'; description: string; enum?: ReadonlyArray<string> }
  | { type: 'number'; description: string; minimum?: number; maximum?: number }
  | { type: 'boolean'; description: string }
  | { type: 'array'; description: string; items: ToolParamSchema };

/**
 * 工具执行结果 — Observation 4 字段（arch §2.3 / ECC 借鉴）
 * - content: 工具输出
 * - success: 是否成功
 * - error: 失败时的错误信息
 * - meta: 性能/调试元数据
 */
export type ToolResult =
  | { success: true; content: string; meta?: Record<string, unknown> }
  | { success: false; content: string; error: string; meta?: Record<string, unknown> };

/**
 * 工具接口 — 所有 6 工具必须实现
 *
 * 设计原则：
 * - name/risk/description 让 LLM 看到
 * - schema 让 LLM 知道参数结构
 * - execute() 是真实实现（同步或异步）
 * - 沙箱在 Sprint 2 加（v1.0 = Docker only，v1.0 不强制沙箱）
 */
export interface Tool {
  readonly name: ToolName;
  readonly description: string;
  readonly risk: 'low' | 'medium' | 'high';
  readonly schema: ToolInputSchema;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

/** Tool 错误码（arch §ApplyError 对应，扩展到所有 tool） */
export type ToolError =
  | { kind: 'invalid-input'; param: string; reason: string }
  | { kind: 'not-found'; path: string }
  | { kind: 'permission-denied'; path: string; reason: string }
  | { kind: 'execution-failed'; command: string; stderr: string }
  | { kind: 'io-error'; path: string; message: string }
  | { kind: 'unsupported'; reason: string };
