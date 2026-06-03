/**
 * EditEngine 抽象（arch §2.3.2）
 *
 * 设计原则：hashline 是 Editing Primitive，不是核心卖点。
 * edit_file tool 只能依赖 EditEngine 接口，**不能直接 import hashline 包**。
 */

/** 文件内容抽象 — 抽象 IO，未来可接 git tree / virtual fs */
export interface FileContent {
  readonly path: string;
  readonly text: string;
  /** 行级 hash（v1.0 = 3-hex 短 hash，未来可换 8-char 强 hash） */
  readonly lineHashes?: ReadonlyArray<string>;
}

export type EditAnchor =
  /** hashline: 锚定到具体行 + hash 校验（默认） */
  | { kind: 'line-hash'; line: number; hash: string }
  /** unified-diff: 锚定到 [start, end) 行范围 */
  | { kind: 'line-range'; start: number; end: number }
  /** AST patch: 锚定到 node id（v2.0 候选，未实现） */
  | { kind: 'ast-node'; nodeId: string }
  /** search-and-replace: 锚定到唯一文本（v1.0 备选） */
  | { kind: 'text-match'; text: string; occurrence: number };

/**
 * 模型的"修改意图" — 引擎负责把它转成可应用的 patch 文本。
 */
export interface EditIntent {
  readonly file: string;
  readonly anchor: EditAnchor;
  readonly oldText: string;
  readonly newText: string;
}

export type ApplyError =
  | { kind: 'anchor-mismatch'; expected: string; actual: string; line: number }
  | { kind: 'text-not-found'; hint: string }
  | { kind: 'ambiguous-match'; occurrences: number }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'parse-failed'; position: number; message: string }
  | { kind: 'io-error'; path: string; message: string };

export type ApplyResult =
  | { ok: true; newText: string; engine: string }
  | { ok: false; error: ApplyError };

/**
 * EditEngine interface — 任何 patch 格式必须实现这两个方法。
 *
 * v1.0 实现：HashlineEngine（default）、UnifiedDiffEngine（stub）。
 * v2.0+ 候选：AstPatchEngine、SearchReplaceEngine。
 */
export interface EditEngine {
  readonly name: string;

  /**
   * 把 EditIntent 序列化成 patch 文本（用于 LLM 输出 / 调试 / 日志）。
   */
  format(intent: EditIntent): string;

  /**
   * 把 patch 文本应用到目标文件。
   * - 成功：返回 ok:true + 新内容
   * - 失败：返回 ok:false + ApplyError（含 recovery 建议）
   */
  apply(target: FileContent, patch: string): ApplyResult;
}
