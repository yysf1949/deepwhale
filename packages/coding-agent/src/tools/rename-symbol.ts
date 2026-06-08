/**
 * rename_symbol 工具 — 1 action (D-32.2.4, 2026-06-08).
 *
 * 拍板: 跨文件 rename. 走 @deepwhale/code-intel buildSymbolGraph + findReferences
 *   找 所有 reference, 然 后 对每 file 用 word-boundary regex `\boldName\b` 替换
 *   为 newName. 默认 dry-run, 只 返 预览 (modified file content). 实际 rename
 *   需 apply=true (medium risk, 走 policy confirm).
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (跨文件 write).
 */

import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export class RenameSymbolTool implements Tool {
  readonly name = 'rename_symbol' as ToolName;
  readonly description = 'Rename a symbol across all files in a repo. Default dry-run (preview modified content). Pass apply=true to write. Medium risk (cross-file write).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      oldName: { type: 'string', description: 'current symbol name' },
      newName: { type: 'string', description: 'new symbol name' },
      path: { type: 'string', description: 'repo root path (default: current working directory)' },
      apply: { type: 'boolean', description: 'if true, write changes to disk (default: false, dry-run preview)' },
    },
    required: ['oldName', 'newName'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const oldName = input['oldName'];
    const newName = input['newName'];
    const apply = input['apply'] === true;
    if (typeof oldName !== 'string' || oldName.length === 0) {
      return { success: false, content: '', error: 'invalid-input: oldName required' };
    }
    if (typeof newName !== 'string' || newName.length === 0) {
      return { success: false, content: '', error: 'invalid-input: newName required' };
    }
    if (oldName === newName) {
      return { success: true, content: '(oldName == newName, no-op)', meta: { changes: 0 } };
    }
    const repoPath = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    try {
      const s = await stat(repoPath);
      if (!s.isDirectory()) {
        return { success: false, content: '', error: `not-a-directory: ${repoPath}` };
      }
      // Walk all files in the repo, find ones containing `\boldName\b` anywhere
      // (declarations, imports, calls, strings). 走全 file walk, 不用
      // buildSymbolGraph.findReferences 因为 它 只 找 declarations (extractImports
      // 是 stub, 漏 import statement).
      const allFiles: string[] = [];
      await walkRepo(repoPath, repoPath, 0, 6, allFiles);
      const wordBoundary = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
      const fileChanges: Array<{ file: string; replacements: number; preview: string }> = [];
      for (const file of allFiles) {
        const original = await readFile(file, 'utf8');
        const matches = original.match(wordBoundary);
        if (!matches || matches.length === 0) continue;
        const rewritten = original.replace(wordBoundary, newName);
        if (rewritten !== original) {
          const relPath = relative(repoPath, file).split(sep).join('/');
          fileChanges.push({ file: relPath, replacements: matches.length, preview: diffPreview(original, rewritten) });
          if (apply) {
            await writeFile(file, rewritten, 'utf8');
          }
        }
      }
      const totalReplacements = fileChanges.reduce((s, f) => s + f.replacements, 0);
      const content = [
        `${apply ? 'RENAMED' : 'DRY-RUN'}: '${oldName}' → '${newName}'`,
        `Files affected: ${fileChanges.length}`,
        `Total replacements: ${totalReplacements}`,
        '',
        ...fileChanges.map((f) => `--- ${f.file} (${f.replacements} replacements) ---\n${f.preview}`),
      ].join('\n');
      return {
        success: true,
        content,
        meta: { oldName, newName, files: fileChanges.length, changes: totalReplacements, dryRun: !apply },
      };
    } catch (e) {
      return { success: false, content: '', error: `rename_symbol error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

const RENAME_IGNORES: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo', 'coverage', '.deepwhale',
]);

async function walkRepo(root: string, dir: string, depth: number, maxDepth: number, out: string[]): Promise<void> {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (RENAME_IGNORES.has(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    if (e.isSymbolicLink()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walkRepo(root, full, depth + 1, maxDepth, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function diffPreview(original: string, rewritten: string): string {
  // Trivial diff: just return first 5 changed lines context
  const oLines = original.split('\n');
  const rLines = rewritten.split('\n');
  const out: string[] = [];
  for (let i = 0; i < oLines.length && out.length < 5; i++) {
    if (oLines[i] !== rLines[i]) {
      out.push(`- L${i + 1}: ${oLines[i]}`);
      out.push(`+ L${i + 1}: ${rLines[i]}`);
    }
  }
  return out.length === 0 ? '(no visible diff)' : out.join('\n');
}

export const renameSymbolTool = new RenameSymbolTool();
