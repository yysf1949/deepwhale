/**
 * get_symbols 工具 — 1 action (D-32.1.2, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel extractSymbols. kind filter 走 SymbolKind
 *   union (function / class / method / variable / import / export / type).
 *   返 { name, kind, line, col, scope, file } 数组.
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读文件).
 */

import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { parseFile, extractSymbols, type LanguageId, type Symbol, type SymbolKind } from '@deepwhale/code-intel';

const VALID_KINDS: ReadonlySet<SymbolKind> = new Set<SymbolKind>([
  'function', 'class', 'method', 'variable', 'import', 'export', 'type',
]);

export class GetSymbolsTool implements Tool {
  readonly name = 'get_symbols' as ToolName;
  readonly description = 'Extract symbols (function / class / method / import / export / type / variable) from a source file via web-tree-sitter. Low risk (read-only).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'absolute or relative file path' },
      kind: { type: 'string', description: 'optional SymbolKind filter (function / class / method / variable / import / export / type)' },
    },
    required: ['path'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const filePath = input['path'];
    const kind = input['kind'];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path required' };
    }
    if (kind !== undefined && (typeof kind !== 'string' || !VALID_KINDS.has(kind as SymbolKind))) {
      return { success: false, content: '', error: `invalid-input: kind must be one of ${Array.from(VALID_KINDS).join('|')}` };
    }
    const absPath = resolve(filePath);
    try {
      const parsed = await parseFile(absPath);
      let syms: Symbol[] = extractSymbols(parsed.tree, parsed.language as LanguageId, absPath);
      if (kind) syms = syms.filter((s) => s.kind === kind);
      const content = syms
        .map((s) => `${s.kind}\t${s.scope ? s.scope + '.' : ''}${s.name}\t${s.line}:${s.col}`)
        .join('\n');
      return {
        success: true,
        content: content || '(no symbols)',
        meta: { path: absPath, language: parsed.language, kind: kind ?? null, count: syms.length },
      };
    } catch (e) {
      return { success: false, content: '', error: `get_symbols error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const getSymbols = new GetSymbolsTool();
