/**
 * @deepwhale/code-intel — Symbol extraction (D-32.1, 2026-06-08).
 *
 * Stub — real implementation lands in Task 2 commit 4.
 * Walking the tree-sitter AST to extract functions, classes, imports, etc.
 */

import type { Tree } from 'web-tree-sitter';
import type { LanguageId } from './languages.js';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'import'
  | 'export'
  | 'type';

export interface Symbol {
  name: string;
  kind: SymbolKind;
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  scope?: string;
  file: string;
}

/**
 * Stub implementation — returns empty list. Real extractor with tree-sitter
 * query-based symbol pull lands in commit 4.
 */
export function extractSymbols(
  _tree: Tree,
  _lang: LanguageId,
  _file: string,
): Symbol[] {
  return [];
}
