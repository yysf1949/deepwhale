/**
 * find_references 工具 — 1 action (D-32.2.2, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel buildSymbolGraph + findReferences. 跨文件
 *   search symbol usage (declaration + import). 2 mode: 'references' 返 完整
 *   list, 'count' 只 返 数字.
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读 walk).
 */

import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { buildSymbolGraph, findReferences, type Reference } from '@deepwhale/code-intel';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export class FindReferencesTool implements Tool {
  readonly name = 'find_references' as ToolName;
  readonly description = 'Heuristic reference search across a repo. Uses AST declarations/imports plus textual identifier matches; no type analysis or IDE-grade rename safety. 2 modes: references / count. Low risk (read-only walk).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = ['file-read'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'find_references action', enum: ['references', 'count'] },
      name: { type: 'string', description: 'symbol name to search for' },
      path: { type: 'string', description: 'repo root path (default: current working directory)' },
      file: { type: 'string', description: 'optional file filter (relative to repo root)' },
    },
    required: ['action', 'name'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const name = input['name'];
    const fileFilter = input['file'];
    if (typeof name !== 'string' || name.length === 0) {
      return { success: false, content: '', error: 'invalid-input: name required' };
    }
    const repoPath = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    try {
      const graph = await buildSymbolGraph(repoPath);
      let refs: ReadonlyArray<Reference> = findReferences(graph, name);
      if (typeof fileFilter === 'string' && fileFilter.length > 0) {
        refs = refs.filter((r) => r.file === fileFilter);
      }
      if (action === 'count') {
        return {
          success: true,
          content: String(refs.length),
          meta: { name, count: refs.length, path: repoPath, heuristic: true },
        };
      }
      const content = refs
        .map((r) => `${r.kind.padEnd(11)}\t${r.file}:${r.line}:${r.col}${r.scope ? `\t(scope=${r.scope})` : ''}`)
        .join('\n');
      return {
        success: true,
        content: content || '(no references)',
        meta: { name, count: refs.length, path: repoPath, fileFilter: fileFilter ?? null, heuristic: true },
      };
    } catch (e) {
      return { success: false, content: '', error: `find_references error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const findReferencesTool = new FindReferencesTool();
