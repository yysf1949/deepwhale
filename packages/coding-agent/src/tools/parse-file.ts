/**
 * parse_file 工具 — 3 action (D-32.1.1, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel (web-tree-sitter WASM, 0 native build).
 *   summary 返 language + line count + symbol count
 *   ast     返 rootNode 简表 (前 50 节点 type)
 *   symbols 返 extractSymbols 列表
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读文件).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { parseFile, extractSymbols, displayName, type LanguageId } from '@deepwhale/code-intel';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export class ParseFileTool implements Tool {
  readonly name = 'parse_file' as ToolName;
  readonly description = 'Parse a source file via web-tree-sitter (WASM, 6 languages). 3 modes: summary / ast / symbols. Low risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = ['file-read'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'parse_file action', enum: ['summary', 'ast', 'symbols'] },
      path: { type: 'string', description: 'absolute or relative file path' },
    },
    required: ['action', 'path'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const filePath = input['path'];
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path required' };
    }
    const absPath = resolve(filePath);
    try {
      switch (action) {
        case 'summary': {
          const parsed = await parseFile(absPath);
          const syms = extractSymbols(parsed.tree, parsed.language as LanguageId, absPath);
          const lines = parsed.source.split('\n').length;
          const content = [
            `Language: ${displayName(parsed.language)}`,
            `Lines: ${lines}`,
            `Symbols: ${syms.length}`,
            `Top-level kinds: ${topKinds(syms)}`,
          ].join('\n');
          return {
            success: true,
            content,
            meta: { path: absPath, language: parsed.language, symbolCount: syms.length, lines },
          };
        }
        case 'ast': {
          const parsed = await parseFile(absPath);
          const lines: string[] = [];
          walk(parsed.tree.rootNode, 0, lines, 50);
          return {
            success: true,
            content: lines.join('\n'),
            meta: { path: absPath, language: parsed.language, truncated: lines.length >= 50 },
          };
        }
        case 'symbols': {
          const parsed = await parseFile(absPath);
          const syms = extractSymbols(parsed.tree, parsed.language as LanguageId, absPath);
          const content = syms
            .map((s) => `${s.kind}\t${s.scope ? s.scope + '.' : ''}${s.name}\t${s.line}:${s.col}`)
            .join('\n');
          return {
            success: true,
            content: content || '(no symbols)',
            meta: { path: absPath, language: parsed.language, count: syms.length },
          };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `parse_file error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

function topKinds(syms: ReadonlyArray<{ kind: string }>): string {
  const counts = new Map<string, number>();
  for (const s of syms) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

// Minimal AST walker that produces a tree shape for the first N nodes
// (depth-limited; we don't need the full AST for tool output).
function walk(node: unknown, depth: number, out: string[], limit: number): void {
  if (out.length >= limit) return;
  const n = node as { type: string; childCount?: number; child(i: number): unknown; namedChildCount?: number; namedChild(i: number): unknown };
  const pad = '  '.repeat(Math.min(depth, 8));
  out.push(`${pad}${n.type}`);
  const total = n.childCount ?? 0;
  for (let i = 0; i < total; i++) {
    if (out.length >= limit) return;
    walk(n.child(i), depth + 1, out, limit);
  }
}

// Silence unused readFile import — kept for future use (e.g. when caller
// pre-fetches source for caching).
void readFile;

export const parseFileTool = new ParseFileTool();
