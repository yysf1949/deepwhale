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
import { computeLineHashes, createDefaultEngine, type EditEngine, type EditIntent } from '@deepwhale/edit-engine';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { buildSymbolGraph, findReferences, type Reference, type SymbolGraph } from '@deepwhale/code-intel';
import type { ToolCapability } from '../governance/tool-capabilities.js';

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

interface LexicalScanState {
  inBlockComment: boolean;
}

interface LexicalScanOptions {
  readonly blockComments: boolean;
  readonly slashLineComments: boolean;
  readonly hashLineComments: boolean;
  readonly skipHashPrivateIdentifier: boolean;
}

interface RenameEditHunk {
  file: string;
  line: number;
  kind: Reference['kind'] | 'textual';
  engine: string;
  confidence: 'heuristic';
  oldText: string;
  newText: string;
  patch: string;
}

interface RenameEditCandidate {
  file: string;
  line: number;
  kind: Reference['kind'] | 'textual';
}

interface FileChange {
  file: string;
  replacements: number;
  preview: string;
  editHunks: RenameEditHunk[];
  textualReplacements?: number;
}

export class RenameSymbolTool implements Tool {
  readonly name = 'rename_symbol' as ToolName;
  readonly description = 'Heuristic symbol rename across a repo. Default dry-run preview; pass apply=true to write. Uses code-intel references where available, not IDE-grade type analysis. Medium risk (cross-file write).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';
  readonly capabilities: readonly ToolCapability[] = ['file-read', 'file-write'] as const;

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
      return { success: true, content: '(oldName == newName, no-op)', meta: { changes: 0, heuristic: true, dryRun: true } };
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
      const editEngine = createDefaultEngine();
      const fileChanges: FileChange[] = [];
      for (const [file, fileRefs] of refsByFile) {
        const fullPath = resolve(repoPath, file);
        const original = await readFile(fullPath, 'utf8');
        const refResult = rewriteReferences(original, fileRefs, oldName, newName, file, graph.files.get(file)?.language);
        let rewritten = refResult.rewritten;
        let replacements = refResult.replacements;
        let textualReplacements = 0;
        let candidateHunks = refResult.editHunks;
        if (allowTextualFallback) {
          const textual = applyTextualFallback(rewritten, oldName, newName, file);
          textualReplacements = textual.replacements;
          rewritten = textual.rewritten;
          candidateHunks = [...candidateHunks, ...textual.editHunks];
        }
        if ((replacements + textualReplacements) > 0 && rewritten !== original) {
          const editHunks = buildEditHunks(original, rewritten, candidateHunks, file, editEngine);
          fileChanges.push({
            file,
            replacements,
            preview: formatEditHunks(editHunks),
            editHunks,
            ...(allowTextualFallback ? { textualReplacements } : {}),
          });
          if (apply) {
            const applied = applyEditHunks(original, editHunks, editEngine);
            if (!applied.ok) {
              return { success: false, content: '', error: `rename_symbol error: edit-engine ${applied.error}` };
            }
            await writeFile(fullPath, applied.text, 'utf8');
          }
        }
      }
      const totalReplacements = fileChanges.reduce((s, f) => s + f.replacements + (f.textualReplacements ?? 0), 0);
      const editHunks = fileChanges.flatMap((f) => f.editHunks);
      const content = [
        `${apply ? 'RENAMED' : 'DRY-RUN'}: '${oldName}' → '${newName}'${allowTextualFallback ? ' (allow_textual_fallback=true)' : ''}`,
        `Edit engine: ${editEngine.name}`,
        'Confidence: heuristic',
        `Files affected: ${fileChanges.length}`,
        `Total replacements: ${totalReplacements}`,
        `Edit hunks: ${editHunks.length}`,
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
          confidence: 'heuristic',
          editEngine: editEngine.name,
          editHunks,
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
    const lexicalOptions = lexicalOptionsForLanguage(graph.files.get(file)?.language);
    const lexicalState: LexicalScanState = { inBlockComment: false };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const scanLine = maskComments(line, lexicalState, lexicalOptions);
      for (const token of scanIdentifierTokens(scanLine, lexicalOptions)) {
        if (token.text !== oldName) continue;
        const candidate: SkippedReference = {
          file,
          line: i + 1,
          col: token.col,
          kind: isMemberReference(scanLine, token.col) ? 'property' : 'reference',
          reason: isMemberReference(scanLine, token.col)
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
  file: string,
): { rewritten: string; replacements: number; editHunks: RenameEditCandidate[] } {
  // 拍板 (D-33.2.2): opt-in broad mode. Use a word-boundary regex to
  // avoid partial matches (e.g. `food` for `foo`). We do NOT skip strings
  // or comments — that's the whole point of the fallback. We process line
  // by line so the `before.indexOf('//')` heuristic used elsewhere doesn't
  // interfere; word-boundary already guarantees identifier-only matches.
  const re = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
  const lines = source.split('\n');
  let replacements = 0;
  const editHunks: RenameEditCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let lineReplacements = 0;
    const next = line.replace(re, () => {
      replacements += 1;
      lineReplacements += 1;
      return newName;
    });
    if (lineReplacements > 0 && next !== line) {
      editHunks.push({ file, line: i + 1, kind: 'textual' });
    }
    lines[i] = next;
  }
  return { rewritten: lines.join('\n'), replacements, editHunks };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteReferences(
  source: string,
  refs: ReadonlyArray<Reference>,
  oldName: string,
  newName: string,
  file: string,
  language: string | undefined,
): { rewritten: string; replacements: number; editHunks: RenameEditCandidate[] } {
  const lineStarts = computeLineStarts(source);
  const lexicalOptions = lexicalOptionsForLanguage(language);
  const maskedSource = maskSourceComments(source, lexicalOptions);
  const replacementOffsets = new Set<number>();
  const candidatesByOffset = new Map<number, RenameEditCandidate>();

  for (const ref of refs) {
    const lineStart = lineStarts[ref.line - 1];
    if (lineStart === undefined) continue;
    const lineEnd = findLineEnd(source, lineStart);
    const rawScanLine = maskedSource.slice(lineStart, lineEnd);
    const scanLine = rawScanLine.endsWith('\r') ? rawScanLine.slice(0, -1) : rawScanLine;
    const col = resolveReplacementColumn(scanLine, ref, oldName, lexicalOptions);
    if (col === null) continue;
    const offset = lineStart + col;
    if (source.slice(offset, offset + oldName.length) === oldName) {
      replacementOffsets.add(offset);
      candidatesByOffset.set(offset, { file, line: ref.line, kind: ref.kind });
    }
  }

  const offsets = [...replacementOffsets].sort((a, b) => b - a);
  let rewritten = source;
  for (const offset of offsets) {
    rewritten = rewritten.slice(0, offset) + newName + rewritten.slice(offset + oldName.length);
  }
  const editHunks = offsets
    .map((offset) => candidatesByOffset.get(offset))
    .filter((candidate): candidate is RenameEditCandidate => candidate !== undefined);
  return { rewritten, replacements: offsets.length, editHunks };
}

function buildEditHunks(
  original: string,
  rewritten: string,
  candidates: ReadonlyArray<RenameEditCandidate>,
  file: string,
  editEngine: EditEngine,
): RenameEditHunk[] {
  const originalLines = original.split('\n');
  const rewrittenLines = rewritten.split('\n');
  const lineHashes = computeLineHashes(original);
  const candidatesByLine = groupCandidatesByLine(candidates);
  const out: RenameEditHunk[] = [];
  const lineCount = Math.max(originalLines.length, rewrittenLines.length);

  for (let i = 0; i < lineCount; i++) {
    const oldText = originalLines[i] ?? '';
    const newText = rewrittenLines[i] ?? '';
    if (oldText === newText) continue;
    const line = i + 1;
    const hash = lineHashes[i];
    if (hash === undefined) continue;
    const kind = selectCandidateKind(candidatesByLine.get(line));
    const intent: EditIntent = {
      file,
      anchor: { kind: 'line-hash', line, hash },
      oldText,
      newText,
    };
    out.push({
      file,
      line,
      kind,
      engine: editEngine.name,
      confidence: 'heuristic',
      oldText,
      newText,
      patch: editEngine.format(intent),
    });
  }

  return out;
}

function groupCandidatesByLine(candidates: ReadonlyArray<RenameEditCandidate>): Map<number, RenameEditCandidate[]> {
  const out = new Map<number, RenameEditCandidate[]>();
  for (const candidate of candidates) {
    const arr = out.get(candidate.line) ?? [];
    arr.push(candidate);
    out.set(candidate.line, arr);
  }
  return out;
}

function selectCandidateKind(candidates: ReadonlyArray<RenameEditCandidate> | undefined): Reference['kind'] | 'textual' {
  if (candidates === undefined || candidates.length === 0) return 'textual';
  const declaration = candidates.find((candidate) => candidate.kind === 'declaration');
  if (declaration !== undefined) return declaration.kind;
  const nonTextual = candidates.find((candidate) => candidate.kind !== 'textual');
  return nonTextual?.kind ?? 'textual';
}

function formatEditHunks(hunks: ReadonlyArray<RenameEditHunk>): string {
  if (hunks.length === 0) return '(no visible diff)';
  return hunks
    .map((hunk) =>
      [
        `# L${hunk.line} ${hunk.kind} ${hunk.confidence}`,
        hunk.patch,
        `- ${hunk.oldText}`,
        `+ ${hunk.newText}`,
      ].join('\n'),
    )
    .join('\n');
}

function applyEditHunks(
  original: string,
  hunks: ReadonlyArray<RenameEditHunk>,
  editEngine: EditEngine,
): { ok: true; text: string } | { ok: false; error: string } {
  let text = original;
  for (const hunk of hunks) {
    const result = editEngine.apply({ path: hunk.file, text }, hunk.patch);
    if (!result.ok) {
      return { ok: false, error: `${result.error.kind}: ${JSON.stringify(result.error)}` };
    }
    text = result.newText;
  }
  return { ok: true, text };
}

function resolveReplacementColumn(
  line: string,
  ref: Reference,
  oldName: string,
  options: LexicalScanOptions,
): number | null {
  if (isTokenAt(line, ref.col, oldName, options)) {
    return ref.col;
  }

  const candidates = scanIdentifierTokens(line, options).filter((token) => token.text === oldName);
  if (candidates.length === 0) return null;
  return candidates.find((token) => token.col >= ref.col)?.col ?? candidates[0]?.col ?? null;
}

function isTokenAt(line: string, col: number, oldName: string, options: LexicalScanOptions): boolean {
  if (line.slice(col, col + oldName.length) !== oldName) return false;
  if (isLikelyInsideString(line, col) || isAfterLineComment(line, col, options)) return false;
  if (shouldSkipIdentifierAt(line, col, options)) return false;
  const before = col > 0 ? line[col - 1] : '';
  const after = line[col + oldName.length] ?? '';
  return !isIdentifierChar(before) && !isIdentifierChar(after);
}

function scanIdentifierTokens(line: string, options: LexicalScanOptions): Array<{ text: string; col: number }> {
  const tokens: Array<{ text: string; col: number }> = [];
  const re = /[A-Za-z_$][\w$]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const col = match.index;
    if (isLikelyInsideString(line, col) || isAfterLineComment(line, col, options)) continue;
    if (shouldSkipIdentifierAt(line, col, options)) continue;
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

function maskSourceComments(source: string, options: LexicalScanOptions): string {
  const state: LexicalScanState = { inBlockComment: false };
  return source
    .split('\n')
    .map((line) => maskComments(line, state, options))
    .join('\n');
}

function maskComments(line: string, state: LexicalScanState, options: LexicalScanOptions): string {
  const chars = line.split('');
  let i = 0;
  while (options.blockComments && i < chars.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', i);
      const until = end >= 0 ? end + 2 : chars.length;
      for (let j = i; j < until; j++) chars[j] = ' ';
      state.inBlockComment = end < 0;
      i = until;
      continue;
    }

    const start = line.indexOf('/*', i);
    if (start < 0) break;
    if (isLikelyInsideString(line, start) || isAfterLineComment(chars.join(''), start, options)) {
      i = start + 2;
      continue;
    }

    const end = line.indexOf('*/', start + 2);
    const until = end >= 0 ? end + 2 : chars.length;
    for (let j = start; j < until; j++) chars[j] = ' ';
    state.inBlockComment = end < 0;
    i = until;
  }
  maskLineComment(chars, chars.join(''), options);
  return chars.join('');
}

function maskLineComment(chars: string[], line: string, options: LexicalScanOptions): void {
  const start = lineCommentStart(line, options);
  if (start < 0) return;
  for (let i = start; i < chars.length; i++) chars[i] = ' ';
}

function lineCommentStart(line: string, options: LexicalScanOptions): number {
  const starts: number[] = [];
  if (options.slashLineComments) {
    const slash = firstCommentTokenOutsideString(line, '//');
    if (slash >= 0) starts.push(slash);
  }
  if (options.hashLineComments) {
    const hash = firstCommentTokenOutsideString(line, '#');
    if (hash >= 0) starts.push(hash);
  }
  return starts.length > 0 ? Math.min(...starts) : -1;
}

function firstCommentTokenOutsideString(line: string, token: string): number {
  let index = line.indexOf(token);
  while (index >= 0) {
    if (!isLikelyInsideString(line, index)) return index;
    index = line.indexOf(token, index + token.length);
  }
  return -1;
}

function isAfterLineComment(line: string, col: number, options: LexicalScanOptions): boolean {
  return lineCommentStart(line.slice(0, col), options) >= 0;
}

function shouldSkipIdentifierAt(line: string, col: number, options: LexicalScanOptions): boolean {
  return options.skipHashPrivateIdentifier && line[col - 1] === '#';
}

function lexicalOptionsForLanguage(language: string | undefined): LexicalScanOptions {
  if (language === 'python' || language === 'bash') {
    return {
      blockComments: false,
      slashLineComments: false,
      hashLineComments: true,
      skipHashPrivateIdentifier: false,
    };
  }
  return {
    blockComments: true,
    slashLineComments: true,
    hashLineComments: false,
    skipHashPrivateIdentifier: language === 'typescript' || language === 'tsx' || language === 'javascript',
  };
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
