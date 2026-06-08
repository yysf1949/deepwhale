/**
 * find_definition 工具 — 1 action (D-32.1.4, 2026-06-08).
 *
 * 拍板: 单文件 symbol 搜索 (跨文件 = D-32.2). 走 @deepwhale/code-intel
 *   extractSymbols, 按 name match (exact, case-sensitive). 多 match 返
 *   first (按 source order). 返 { file, line, col, kind, scope } | null.
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读文件).
 */

import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { parseFile, extractSymbols, type LanguageId } from '@deepwhale/code-intel';

export class FindDefinitionTool implements Tool {
  readonly name = 'find_definition' as ToolName;
  readonly description = 'Find the first definition of a symbol by name in a single source file. Low risk (read-only).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: 'symbol name to find' },
      path: { type: 'string', description: 'absolute or relative file path (single file)' },
    },
    required: ['symbol', 'path'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const symbol = input['symbol'];
    const filePath = input['path'];
    if (typeof symbol !== 'string' || symbol.length === 0) {
      return { success: false, content: '', error: 'invalid-input: symbol required' };
    }
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path required' };
    }
    const absPath = resolve(filePath);
    try {
      const parsed = await parseFile(absPath);
      const syms = extractSymbols(parsed.tree, parsed.language as LanguageId, absPath);
      const hit = syms.find((s) => s.name === symbol);
      if (!hit) {
        return {
          success: true,
          content: '(not found)',
          meta: { path: absPath, symbol, found: false, scanned: syms.length },
        };
      }
      const content = `${hit.kind}\t${hit.scope ? hit.scope + '.' : ''}${hit.name}\t${hit.line}:${hit.col}`;
      return {
        success: true,
        content,
        meta: {
          path: absPath,
          symbol,
          found: true,
          file: hit.file,
          line: hit.line,
          col: hit.col,
          kind: hit.kind,
          scope: hit.scope ?? null,
        },
      };
    } catch (e) {
      return { success: false, content: '', error: `find_definition error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const findDefinition = new FindDefinitionTool();
