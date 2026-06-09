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

import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { buildSymbolGraph, findReferences, type Reference, type SymbolGraph } from '@deepwhale/code-intel';

interface RenameSelector {
  targetFile?: string;
  targetLine?: number;
  targetScope?: string;
}

interface SkippedReference {
  file: string;
  line: number;
  col: number;
  kind: Reference['kind'];
  reason: string;
}

export class RenameSymbolTool implements Tool {
  readonly name = 'rename_symbol' as ToolName;
  readonly description = 'Heuristic symbol rename across a repo. Default dry-run preview; pass apply=true to write. Uses code-intel references where available, not IDE-grade type analysis. Medium risk (cross-file write).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      oldName: { type: 'string', description: 'current symbol name' },
      newName: { type: 'string', description: 'new symbol name' },
      path: { type: 'string', description: 'repo root path (default: current working directory)' },
      targetFile: {
        type: 'string',
        description: 'optional declaration file to disambiguate same-name symbols (relative to repo root)',
      },
      targetLine: {
        type: 'number',
        description: 'optional declaration line to disambiguate same-name symbols',
      },
      targetScope: {
        type: 'string',
        description: 'optional declaration scope to disambiguate same-name symbols',
      },
      apply: { type: 'boolean', description: 'if true, write changes to disk (default: false, dry-run preview)' },
      // 拍板 (D-33.2.2): default false. When true, ALSO rewrite occurrences in
      // comments and strings using a word-boundary regex across the whole
      // file. The reference-limited path is always taken; the textual
      // fallback is additive.
      allow_textual_fallback: {
        type: 'boolean',
        description:
          'opt-in: additionally rewrite occurrences of oldName in comments and strings (word-boundary). Default false.',
      },
    },
    required: ['oldName', 'newName'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const oldName = input['oldName'];
    const newName = input['newName'];
    const apply = input['apply'] === true;
    const allowTextualFallback = input['allow_textual_fallback'] === true;
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
      const graph = await buildSymbolGraph(repoPath);
      const refs = findReferences(graph, oldName);
      const selection = selectRenameReferences(refs, input);
      if (!selection.ok) {
        return { success: false, content: '', error: selection.error };
      }
      const skippedRefs = await expandSkippedReferences(graph, oldName, selection);
      const refsByFile = groupReferencesByFile(selection.refs);
      const fileChanges: Array<{ file: string; replacements: number; preview: string; textualReplacements?: number }> = [];
      for (const [file, fileRefs] of refsByFile) {
        const fullPath = resolve(repoPath, file);
        const original = await readFile(fullPath, 'utf8');
        const refResult = rewriteReferences(original, fileRefs, oldName, newName);
        let rewritten = refResult.rewritten;
        let replacements = refResult.replacements;
        let textualReplacements = 0;
        if (allowTextualFallback) {
          const textual = applyTextualFallback(rewritten, oldName, newName);
          textualReplacements = textual.replacements;
          rewritten = textual.rewritten;
        }
        if ((replacements + textualReplacements) > 0 && rewritten !== original) {
          fileChanges.push({
            file,
            replacements,
            preview: diffPreview(original, rewritten),
            ...(allowTextualFallback ? { textualReplacements } : {}),
          });
          if (apply) {
            await writeFile(fullPath, rewritten, 'utf8');
          }
        }
      }
      const totalReplacements = fileChanges.reduce((s, f) => s + f.replacements + (f.textualReplacements ?? 0), 0);
      const content = [
        `${apply ? 'RENAMED' : 'DRY-RUN'}: '${oldName}' → '${newName}'${allowTextualFallback ? ' (allow_textual_fallback=true)' : ''}`,
        `Files affected: ${fileChanges.length}`,
        `Total replacements: ${totalReplacements}`,
        `Skipped heuristic references: ${skippedRefs.length}`,
        '',
        ...fileChanges.map((f) =>
          [
            `--- ${f.file} (${f.replacements} ref${allowTextualFallback ? ` + ${f.textualReplacements ?? 0} textual` : ''} replacements) ---`,
            f.preview,
          ].join('\n'),
        ),
      ].join('\n');
      return {
        success: true,
        content,
        meta: {
          oldName,
          newName,
          files: fileChanges.length,
          changes: totalReplacements,
          heuristic: true,
          selector: selection.selector,
          ambiguousDeclarations: selection.ambiguousDeclarations,
          changedReferences: totalReplacements,
          skippedReferences: skippedRefs.length,
          ...(skippedRefs.length > 0 ? { skippedReferenceDetails: skippedRefs } : {}),
          dryRun: !apply,
          ...(selection.targetFile ? { targetFile: selection.targetFile } : {}),
          ...(allowTextualFallback ? { allowTextualFallback: true } : {}),
        },
      };
    } catch (e) {
      return { success: false, content: '', error: `rename_symbol error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
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

function groupReferencesByFile(refs: ReadonlyArray<Reference>): Map<string, Reference[]> {
  const out = new Map<string, Reference[]>();
  for (const ref of refs) {
    const arr = out.get(ref.file) ?? [];
    arr.push(ref);
    out.set(ref.file, arr);
  }
  return out;
}

function selectRenameReferences(
  refs: ReadonlyArray<Reference>,
  input: Record<string, unknown>,
):
  | {
      ok: true;
      refs: ReadonlyArray<Reference>;
      skippedRefs: ReadonlyArray<SkippedReference>;
      selector: RenameSelector;
      ambiguousDeclarations: number;
      targetFile?: string;
    }
  | { ok: false; error: string } {
  const declarations = refs.filter((ref) => ref.kind === 'declaration');
  const targetFile = optionalNormalizedPath(input['targetFile']);
  const targetLine = typeof input['targetLine'] === 'number' ? input['targetLine'] : undefined;
  const targetScope = typeof input['targetScope'] === 'string' ? input['targetScope'] : undefined;
  const selector = buildSelector(targetFile, targetLine, targetScope);
  const hasSelector = targetFile !== undefined || targetLine !== undefined || targetScope !== undefined;

  if (declarations.length > 1 && !hasSelector) {
    return {
      ok: false,
      error: `ambiguous-symbol: ${declarations.length} declarations found; pass targetFile, targetLine, or targetScope`,
    };
  }

  if (!hasSelector) {
    return {
      ok: true,
      refs,
      skippedRefs: [],
      selector,
      ambiguousDeclarations: declarations.length,
    };
  }

  const matches = declarations.filter((ref) => {
    if (targetFile !== undefined && ref.file !== targetFile) return false;
    if (targetLine !== undefined && ref.line !== targetLine) return false;
    if (targetScope !== undefined && ref.scope !== targetScope) return false;
    return true;
  });

  if (matches.length !== 1) {
    return {
      ok: false,
      error: `ambiguous-symbol: selector matched ${matches.length} declarations; expected exactly 1`,
    };
  }

  const selected = matches[0]!;
  const selectedRefs = refs.filter((ref) => ref.file === selected.file);
  const skippedRefs = refs
    .filter((ref) => ref.file !== selected.file)
    .map((ref) => skippedReferenceFrom(ref, 'cross-file binding not rewritten by heuristic rename'));
  return {
    ok: true,
    refs: selectedRefs,
    skippedRefs,
    selector,
    ambiguousDeclarations: declarations.length,
    targetFile: selected.file,
  };
}

function buildSelector(
  targetFile: string | undefined,
  targetLine: number | undefined,
  targetScope: string | undefined,
): RenameSelector {
  const selector: RenameSelector = {};
  if (targetFile !== undefined) selector.targetFile = targetFile;
  if (targetLine !== undefined) selector.targetLine = targetLine;
  if (targetScope !== undefined) selector.targetScope = targetScope;
  return selector;
}

function skippedReferenceFrom(ref: Reference, reason: string): SkippedReference {
  return {
    file: ref.file,
    line: ref.line,
    col: ref.col,
    kind: ref.kind,
    reason,
  };
}

async function expandSkippedReferences(
  graph: SymbolGraph,
  oldName: string,
  selection: Extract<ReturnType<typeof selectRenameReferences>, { ok: true }>,
): Promise<SkippedReference[]> {
  const skipped = [...selection.skippedRefs];
  if (!selection.targetFile) return skipped;

  const seen = new Set<string>();
  for (const ref of [...selection.refs, ...skipped]) {
    seen.add(referenceKey(ref));
  }

  for (const file of graph.files.keys()) {
    if (file === selection.targetFile) continue;
    const source = await readFile(resolve(graph.repoRoot, file), 'utf8').catch(() => '');
    if (!source) continue;
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const token of scanIdentifierTokens(line)) {
        if (token.text !== oldName) continue;
        const candidate: SkippedReference = {
          file,
          line: i + 1,
          col: token.col,
          kind: isMemberReference(line, token.col) ? 'property' : 'reference',
          reason: isMemberReference(line, token.col)
            ? 'namespace/member candidate not rewritten by heuristic rename'
            : 'cross-file candidate not rewritten by heuristic rename',
        };
        const key = referenceKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);
        skipped.push(candidate);
      }
    }
  }

  return skipped;
}

function referenceKey(ref: Pick<SkippedReference, 'file' | 'line' | 'col'>): string {
  return `${ref.file}:${ref.line}:${ref.col}`;
}

function isMemberReference(line: string, col: number): boolean {
  let i = col - 1;
  while (i >= 0 && /\s/.test(line[i] ?? '')) i--;
  return line[i] === '.';
}

function optionalNormalizedPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.replace(/\\/g, '/');
}

function applyTextualFallback(
  source: string,
  oldName: string,
  newName: string,
): { rewritten: string; replacements: number } {
  // 拍板 (D-33.2.2): opt-in broad mode. Use a word-boundary regex to
  // avoid partial matches (e.g. `food` for `foo`). We do NOT skip strings
  // or comments — that's the whole point of the fallback. We process line
  // by line so the `before.indexOf('//')` heuristic used elsewhere doesn't
  // interfere; word-boundary already guarantees identifier-only matches.
  const re = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
  const lines = source.split('\n');
  let replacements = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const next = line.replace(re, () => {
      replacements += 1;
      return newName;
    });
    lines[i] = next;
  }
  return { rewritten: lines.join('\n'), replacements };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteReferences(
  source: string,
  refs: ReadonlyArray<Reference>,
  oldName: string,
  newName: string,
): { rewritten: string; replacements: number } {
  const lineStarts = computeLineStarts(source);
  const replacementOffsets = new Set<number>();

  for (const ref of refs) {
    const lineStart = lineStarts[ref.line - 1];
    if (lineStart === undefined) continue;
    const lineEnd = findLineEnd(source, lineStart);
    const rawLine = source.slice(lineStart, lineEnd);
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const col = resolveReplacementColumn(line, ref, oldName);
    if (col === null) continue;
    const offset = lineStart + col;
    if (source.slice(offset, offset + oldName.length) === oldName) {
      replacementOffsets.add(offset);
    }
  }

  const offsets = [...replacementOffsets].sort((a, b) => b - a);
  let rewritten = source;
  for (const offset of offsets) {
    rewritten = rewritten.slice(0, offset) + newName + rewritten.slice(offset + oldName.length);
  }
  return { rewritten, replacements: offsets.length };
}

function resolveReplacementColumn(line: string, ref: Reference, oldName: string): number | null {
  if (isTokenAt(line, ref.col, oldName)) {
    return ref.col;
  }

  const candidates = scanIdentifierTokens(line).filter((token) => token.text === oldName);
  if (candidates.length === 0) return null;
  return candidates.find((token) => token.col >= ref.col)?.col ?? candidates[0]?.col ?? null;
}

function isTokenAt(line: string, col: number, oldName: string): boolean {
  if (line.slice(col, col + oldName.length) !== oldName) return false;
  if (isLikelyInsideString(line, col) || isAfterLineComment(line, col)) return false;
  const before = col > 0 ? line[col - 1] : '';
  const after = line[col + oldName.length] ?? '';
  return !isIdentifierChar(before) && !isIdentifierChar(after);
}

function scanIdentifierTokens(line: string): Array<{ text: string; col: number }> {
  const tokens: Array<{ text: string; col: number }> = [];
  const re = /[A-Za-z_$][\w$]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const col = match.index;
    if (isLikelyInsideString(line, col) || isAfterLineComment(line, col)) continue;
    tokens.push({ text: match[0], col });
  }
  return tokens;
}

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function findLineEnd(source: string, lineStart: number): number {
  const nextNewline = source.indexOf('\n', lineStart);
  return nextNewline === -1 ? source.length : nextNewline;
}

function isLikelyInsideString(line: string, col: number): boolean {
  const before = line.slice(0, col);
  const singleQuotes = countUnescaped(before, "'");
  const doubleQuotes = countUnescaped(before, '"');
  const backticks = countUnescaped(before, '`');
  return singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1;
}

function isAfterLineComment(line: string, col: number): boolean {
  const before = line.slice(0, col);
  return before.indexOf('//') >= 0 || before.indexOf('#') >= 0;
}

function countUnescaped(text: string, char: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === char && text[i - 1] !== '\\') count += 1;
  }
  return count;
}

function isIdentifierChar(char: string | undefined): boolean {
  return typeof char === 'string' && /[A-Za-z0-9_$]/.test(char);
}

export const renameSymbolTool = new RenameSymbolTool();
