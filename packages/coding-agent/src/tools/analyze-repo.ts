/**
 * analyze_repo 工具 — 1 action (D-32.1.3, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel + node:fs walk. 统计 totalFiles,
 *   langStats (per-language file count), symbolCount (cumulative),
 *   topSymbols (前 10 by source order). 默认 cwd.
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读 walk).
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { parseFile, extractSymbols, getLanguageForExtension, type LanguageId, type Symbol } from '@deepwhale/code-intel';
import type { ToolCapability } from '../governance/tool-capabilities.js';

const DEFAULT_IGNORES: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo', 'coverage', '.deepwhale',
]);

const MAX_WALK_DEPTH = 8;
const MAX_TOP_SYMBOLS = 10;

export class AnalyzeRepoTool implements Tool {
  readonly name = 'analyze_repo' as ToolName;
  readonly description = 'Walk a repo and report file count, language distribution, total symbol count, and top symbols. Low risk (read-only walk).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = ['file-read'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'repo root path (default: current working directory)' },
      maxDepth: { type: 'number', description: 'max walk depth (default: 8)' },
    },
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const repoPath = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    const maxDepth = typeof input['maxDepth'] === 'number' ? input['maxDepth'] : MAX_WALK_DEPTH;
    try {
      const s = await stat(repoPath);
      if (!s.isDirectory()) {
        return { success: false, content: '', error: `not-a-directory: ${repoPath}` };
      }
      const files: string[] = [];
      await walk(repoPath, repoPath, 0, maxDepth, files);
      const langStats: Record<string, number> = {};
      let symbolCount = 0;
      const allSymbols: Symbol[] = [];
      for (const abs of files) {
        const lang = getLanguageForExtension(abs);
        if (lang) {
          langStats[lang] = (langStats[lang] ?? 0) + 1;
          try {
            const parsed = await parseFile(abs);
            const syms = extractSymbols(parsed.tree, lang as LanguageId, abs);
            symbolCount += syms.length;
            for (const sym of syms) allSymbols.push(sym);
          } catch {
            // skip files that fail to parse (binary, syntax errors, etc.)
          }
        }
      }
      const topSymbols = allSymbols.slice(0, MAX_TOP_SYMBOLS);
      const lines = [
        `Total files: ${files.length}`,
        `Languages: ${JSON.stringify(langStats, null, 0)}`,
        `Symbol count: ${symbolCount}`,
        `Top ${Math.min(MAX_TOP_SYMBOLS, topSymbols.length)} symbols:`,
        ...topSymbols.map(
          (s) => `  ${s.kind}\t${s.scope ? s.scope + '.' : ''}${s.name}\t${relative(repoPath, s.file).split(sep).join('/')}:${s.line}`
        ),
      ];
      return {
        success: true,
        content: lines.join('\n'),
        meta: { path: repoPath, totalFiles: files.length, langStats, symbolCount, topSymbols },
      };
    } catch (e) {
      return { success: false, content: '', error: `analyze_repo error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

async function walk(root: string, dir: string, depth: number, maxDepth: number, out: string[]): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (DEFAULT_IGNORES.has(e.name)) continue;
    if (e.name.startsWith('.') && e.name !== '.deepwhale') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(root, full, depth + 1, maxDepth, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

export const analyzeRepo = new AnalyzeRepoTool();
