/**
 * @deepwhale/code-intel — Symbol Graph (D-32.2.1, 2026-06-08).
 *
 * 跨文件 symbol reference map. 走 web-tree-sitter WASM (跟 D-32.1 1:1).
 *
 * 拍板:
 *   - buildSymbolGraph(repoPath): walk 整个 repo, parse 每 file, 抽 symbols
 *     + cross-file references (heuristic: name match across files)
 *   - findReferences(graph, name): 跨文件 search, 返 Reference[] (file + line:col
 *     + kind: import | declaration | call | type | property)
 *   - buildCallGraph(graph): 跨文件 call edges (heuristic: caller body 中
 *     token match 已知 function/class name). 不做 type analysis, 0 完整 type
 *     inference, 是 近似.
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读 walk).
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parseFile } from './parser.js';
import { getLanguageForExtension, type LanguageId } from './languages.js';
import { extractSymbols, type Symbol } from './symbols.js';

const DEFAULT_IGNORES: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', '.turbo', 'coverage', '.deepwhale',
]);

const MAX_WALK_DEPTH = 8;
const MAX_REFERENCES_PER_NAME = 1000;

export interface Import {
  /** imported name in this file (e.g. 'foo' in `import { foo }`) */
  local: string;
  /** exported/source symbol name before local aliasing (e.g. 'foo' in `import { foo as bar }`) */
  imported?: string;
  /** `export * from './module'` edge used to resolve barrel files. */
  exportAll?: boolean;
  /** `import * as ns from './module'` namespace binding. */
  namespace?: boolean;
  /** source path (e.g. './bar' or 'os' for Python's `import os`) */
  from: string;
  line: number;
  col: number;
}

export interface FileSymbols {
  path: string;
  language: string;
  symbols: Symbol[];
  imports: Import[];
}

export interface Reference {
  file: string;
  line: number;
  col: number;
  kind: 'import' | 'declaration' | 'call' | 'type' | 'property' | 'reference';
  scope?: string;
}

export interface SymbolGraph {
  /** Absolute repo root used to resolve `files` relative paths. */
  repoRoot: string;
  pathAliases: PathAlias[];
  files: Map<string, FileSymbols>;
  /** symbol name → all references (declarations + usages) across all files */
  byName: Map<string, Reference[]>;
}

interface PathAlias {
  prefix: string;
  suffix: string;
  targetPrefix: string;
  targetSuffix: string;
}

export interface CallEdge {
  caller: string; // `file:symbol`
  callee: string; // `file:symbol`
  line: number;
  file: string;
}

export interface CallGraph {
  edges: CallEdge[];
  byCaller: Map<string, CallEdge[]>;
  byCallee: Map<string, CallEdge[]>;
}

interface LexicalScanState {
  inBlockComment: boolean;
}

interface LexicalScanOptions {
  readonly blockComments: boolean;
  readonly slashLineComments: boolean;
  readonly hashLineComments: boolean;
}

// ── buildSymbolGraph ──────────────────────────────────────────────────────

export async function buildSymbolGraph(repoPath: string, options: { maxDepth?: number } = {}): Promise<SymbolGraph> {
  const maxDepth = options.maxDepth ?? MAX_WALK_DEPTH;
  const abs = resolve(repoPath);
  const statRes = await stat(abs);
  if (!statRes.isDirectory()) {
    throw new Error(`not-a-directory: ${abs}`);
  }
  const files: string[] = [];
  await walk(abs, abs, 0, maxDepth, files);

  const fileMap = new Map<string, FileSymbols>();
  const byName = new Map<string, Reference[]>();
  const pathAliases = await readTsconfigPathAliases(abs);

  for (const file of files) {
    const lang = getLanguageForExtension(file);
    if (!lang) continue; // unsupported language
    try {
      const parsed = await parseFile(file);
      const symbols = extractSymbols(parsed.tree, lang as LanguageId, file);
      const rel = relative(abs, file).split(sep).join('/');
      const imports = extractImports(parsed.source, lang as LanguageId);
      fileMap.set(rel, { path: rel, language: lang, symbols, imports });

      for (const s of symbols) {
        const ref: Reference = { file: rel, line: s.line, col: s.col, kind: 'declaration' };
        if (s.scope !== undefined) ref.scope = s.scope;
        pushRef(byName, s.name, ref);
      }
      for (const imp of imports) {
        if (imp.exportAll) continue;
        pushRef(byName, imp.local, {
          file: rel,
          line: imp.line,
          col: imp.col,
          kind: 'import',
        });
        if (imp.imported && imp.imported !== imp.local) {
          pushRef(byName, imp.imported, {
            file: rel,
            line: imp.line,
            col: imp.col,
            kind: 'import',
          });
        }
      }
      indexTextReferences(byName, parsed.source, rel, symbols, imports, lang as LanguageId);
    } catch {
      // skip files that fail to parse
    }
  }

  return { repoRoot: abs, pathAliases, files: fileMap, byName };
}

// ── findReferences ────────────────────────────────────────────────────────

export function findReferences(graph: SymbolGraph, name: string): Reference[] {
  return graph.byName.get(name) ?? [];
}

// ── buildCallGraph ────────────────────────────────────────────────────────

export async function buildCallGraph(graph: SymbolGraph): Promise<CallGraph> {
  const edges: CallEdge[] = [];
  const byCaller = new Map<string, CallEdge[]>();
  const byCallee = new Map<string, CallEdge[]>();

  // Build lookup: name → file:symbol identifiers
  const nameToIds = new Map<string, string[]>();
  for (const [filePath, fileSym] of graph.files) {
    for (const sym of fileSym.symbols) {
      const id = `${filePath}:${sym.scope ? sym.scope + '.' : ''}${sym.name}`;
      const arr = nameToIds.get(sym.name) ?? [];
      arr.push(id);
      nameToIds.set(sym.name, arr);
    }
  }

  // For each function/method, scan its source for call candidates
  for (const [filePath, fileSym] of graph.files) {
    const source = await readFile(resolve(graph.repoRoot, filePath), 'utf8').catch(() => '');
    if (!source) continue;
    const lines = source.split('\n');
    for (const sym of fileSym.symbols) {
      if (sym.kind !== 'function' && sym.kind !== 'method') continue;
      const callerId = `${filePath}:${sym.scope ? sym.scope + '.' : ''}${sym.name}`;
      const start = Math.max(0, sym.line - 1);
      const endLine = (sym as unknown as { endLine?: number }).endLine ?? start + 50;
      const end = Math.min(lines.length, endLine);
      const importTargets = buildImportTargetMap(filePath, fileSym, graph);
      const lexicalState: LexicalScanState = { inBlockComment: false };
      const lexicalOptions = lexicalOptionsForLanguage(fileSym.language);
      for (let ln = start; ln < end; ln++) {
        const line = lines[ln] ?? '';
        const scanLine = maskComments(line, lexicalState, lexicalOptions);
        for (const call of scanCallExpressions(scanLine, lexicalOptions)) {
          const namespaceTarget = call.qualifier
            ? resolveNamespaceMemberTarget(filePath, fileSym, call.qualifier, call.name, graph)
            : undefined;
          if (call.qualifier && isNamespaceImportQualifier(fileSym, call.qualifier) && !namespaceTarget) {
            continue;
          }
          const importTarget = namespaceTarget ?? importTargets.get(call.name);
          // 拍板 (D-33.2.1): prefer no edge over a false edge. If the file
          // imports a name that could not be resolved (e.g. tsconfig path
          // alias `@api/api` → `src/api/api` no such file), skip the
          // name-based fallback — the call may be a local var or a dangling
          // import, and we should not guess. If the file has no import of
          // the name at all, this is likely a same-file function call, so
          // allow the fallback.
          if (!importTarget && hasUnresolvedImportOfName(fileSym, call.name)) {
            continue;
          }
          const targetName = importTarget?.split(':').slice(1).join(':') ?? call.name;
          const calleeIds = nameToIds.get(targetName);
          if (!calleeIds) continue;
          const name = call.name;
          if (name === sym.name) continue;
          if (name.length < 2) continue;
          const filteredCalleeIds = filterCalleeIdsByImportTarget(calleeIds, importTarget);
          for (const calleeId of filteredCalleeIds) {
            const edge: CallEdge = { caller: callerId, callee: calleeId, line: ln + 1, file: filePath };
            edges.push(edge);
            pushEdge(byCaller, callerId, edge);
            pushEdge(byCallee, calleeId, edge);
          }
        }
      }
    }
  }

  return { edges, byCaller, byCallee };
}

// ── helpers ───────────────────────────────────────────────────────────────

function extractImports(source: string, lang: LanguageId): Import[] {
  if (lang === 'typescript' || lang === 'tsx' || lang === 'javascript') {
    return extractTsLikeImports(source, lexicalOptionsForLanguage(lang));
  }
  if (lang === 'python') {
    return extractPythonImports(source);
  }
  if (lang === 'go') {
    return extractGoImports(source);
  }
  if (lang === 'rust') {
    return extractRustImports(source);
  }
  if (lang === 'bash') {
    return extractBashImports(source);
  }
  return [];
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
    if (e.name.startsWith('.')) continue;
    if (e.isSymbolicLink()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(root, full, depth + 1, maxDepth, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function pushRef(map: Map<string, Reference[]>, name: string, ref: Reference): void {
  if (ref.line === 0) return;
  const arr = map.get(name) ?? [];
  if (arr.some((r) => r.file === ref.file && r.line === ref.line && r.col === ref.col && r.kind === ref.kind)) {
    return;
  }
  if (arr.length >= MAX_REFERENCES_PER_NAME) return;
  arr.push(ref);
  map.set(name, arr);
}

function pushEdge(map: Map<string, CallEdge[]>, key: string, edge: CallEdge): void {
  const arr = map.get(key) ?? [];
  arr.push(edge);
  map.set(key, arr);
}

function scanCallExpressions(line: string, options: LexicalScanOptions): Array<{ name: string; qualifier?: string }> {
  const calls: Array<{ name: string; qualifier?: string }> = [];
  const re = /(?:(\b[A-Za-z_$][\w$]*)\s*\.\s*)?(\b[A-Za-z_$][\w$]*)\b\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const qualifier = match[1];
    const name = match[2];
    if (!name) continue;
    const col = match.index;
    if (isLikelyInsideString(line, col) || isAfterLineComment(line, col, options)) continue;
    const call: { name: string; qualifier?: string } = { name };
    if (qualifier) call.qualifier = qualifier;
    calls.push(call);
  }
  return calls;
}

function buildImportTargetMap(filePath: string, fileSym: FileSymbols, graph: SymbolGraph): Map<string, string> {
  const targets = new Map<string, string>();
  for (const imp of fileSym.imports) {
    if (imp.namespace) continue;
    const resolved = resolveImportedSymbolTarget(filePath, imp, graph);
    if (resolved) targets.set(imp.local, resolved);
  }
  return targets;
}

function resolveNamespaceMemberTarget(
  filePath: string,
  fileSym: FileSymbols,
  qualifier: string,
  member: string,
  graph: SymbolGraph,
): string | undefined {
  const namespaceImport = fileSym.imports.find((imp) => imp.namespace && imp.local === qualifier);
  if (!namespaceImport) return undefined;
  const resolved = resolveRelativeImportFile(filePath, namespaceImport.from, graph);
  if (!resolved) return undefined;
  return resolveReExportTarget(resolved, member, graph, new Set());
}

function isNamespaceImportQualifier(fileSym: FileSymbols, qualifier: string): boolean {
  return fileSym.imports.some((imp) => imp.namespace && imp.local === qualifier);
}

function hasUnresolvedImportOfName(fileSym: FileSymbols, name: string): boolean {
  // An import is "unresolved" if it declares the name but the import map
  // (which is built by buildCallGraph) couldn't find a target file for it.
  // buildCallGraph will only have placed it in the importTargets map when
  // resolveImportedSymbolTarget succeeded, so we approximate by checking
  // that the file has an import whose local name matches AND the from path
  // is not a relative or namespace import that the resolver can handle.
  return fileSym.imports.some((imp) => {
    if (imp.local !== name) return false;
    // Names resolved through namespace imports / barrels / relative paths
    // ARE in the importTargets map. The remaining "unresolved" cases are
    // bare specifiers (tsconfig aliases, node modules) that the relative
    // resolver defers to resolvePathAliasImportFile. We can't fully
    // distinguish them here without re-running the resolver, so we only
    // signal "unresolved" when the import's `from` looks like a tsconfig
    // alias prefix (i.e. starts with an `@`-style alias) or is a node
    // module style specifier without a leading `./` or `../`.
    if (imp.from.startsWith('.')) return false;
    if (imp.namespace) return false;
    return true;
  });
}

function resolveImportedSymbolTarget(
  filePath: string,
  imp: Import,
  graph: SymbolGraph,
  seen: Set<string> = new Set(),
): string | undefined {
  const resolved = resolveRelativeImportFile(filePath, imp.from, graph);
  if (!resolved) return undefined;
  const symbolName = imp.imported ?? imp.local;
  return resolveReExportTarget(resolved, symbolName, graph, seen) ?? `${resolved}:${symbolName}`;
}

function resolveReExportTarget(
  filePath: string,
  symbolName: string,
  graph: SymbolGraph,
  seen: Set<string>,
): string | undefined {
  const key = `${filePath}:${symbolName}`;
  if (seen.has(key)) return undefined;
  seen.add(key);

  const fileSym = graph.files.get(filePath);
  if (!fileSym) return undefined;
  if (fileSym.symbols.some((symbol) => symbol.name === symbolName)) return key;

  for (const imp of fileSym.imports) {
    if (imp.local !== symbolName) continue;
    const target = resolveImportedSymbolTarget(filePath, imp, graph, seen);
    if (target) return target;
  }
  for (const imp of fileSym.imports) {
    if (!imp.exportAll) continue;
    const resolved = resolveRelativeImportFile(filePath, imp.from, graph);
    if (!resolved) continue;
    const target = resolveReExportTarget(resolved, symbolName, graph, seen);
    if (target) return target;
  }
  return undefined;
}

function resolveRelativeImportFile(filePath: string, from: string, graph: SymbolGraph): string | undefined {
  if (!from.startsWith('.')) return resolvePathAliasImportFile(from, graph);
  const fromParts = from.split('/').filter((part) => part.length > 0);
  const fileDir = filePath.split('/').slice(0, -1);
  const stack = [...fileDir];
  for (const part of fromParts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  const raw = stack.join('/');
  const withoutJsExt = raw.replace(/\.(js|jsx|mjs|cjs)$/i, '');
  const candidates = [
    raw,
    withoutJsExt,
    `${withoutJsExt}.ts`,
    `${withoutJsExt}.tsx`,
    `${withoutJsExt}.js`,
    `${withoutJsExt}.jsx`,
    `${withoutJsExt}.mjs`,
    `${withoutJsExt}.cjs`,
    `${withoutJsExt}/index.ts`,
    `${withoutJsExt}/index.tsx`,
    `${withoutJsExt}/index.js`,
  ];
  return candidates.find((candidate) => graph.files.has(candidate));
}

function resolvePathAliasImportFile(from: string, graph: SymbolGraph): string | undefined {
  for (const alias of graph.pathAliases) {
    if (!from.startsWith(alias.prefix) || !from.endsWith(alias.suffix)) continue;
    const matched = from.slice(alias.prefix.length, from.length - alias.suffix.length);
    const raw = `${alias.targetPrefix}${matched}${alias.targetSuffix}`.replace(/\\/g, '/');
    const withoutJsExt = raw.replace(/\.(js|jsx|mjs|cjs)$/i, '');
    const candidates = [
      raw,
      withoutJsExt,
      `${withoutJsExt}.ts`,
      `${withoutJsExt}.tsx`,
      `${withoutJsExt}.js`,
      `${withoutJsExt}.jsx`,
      `${withoutJsExt}.mjs`,
      `${withoutJsExt}.cjs`,
      `${withoutJsExt}/index.ts`,
      `${withoutJsExt}/index.tsx`,
      `${withoutJsExt}/index.js`,
    ];
    const found = candidates.find((candidate) => graph.files.has(candidate));
    if (found) return found;
  }
  return undefined;
}

function filterCalleeIdsByImportTarget(calleeIds: string[], target: string | undefined): string[] {
  if (!target) return calleeIds;
  const [targetFile, ...targetNameParts] = target.split(':');
  const targetName = targetNameParts.join(':');
  const filtered = calleeIds.filter((id) => {
    const [file, ...symbolParts] = id.split(':');
    return file === targetFile && symbolParts.join(':').split('.').pop() === targetName;
  });
  return filtered.length > 0 ? filtered : calleeIds;
}

async function readTsconfigPathAliases(repoRoot: string): Promise<PathAlias[]> {
  const raw = await readFile(resolve(repoRoot, 'tsconfig.json'), 'utf8').catch(() => '');
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonBom(raw));
  } catch {
    return [];
  }

  const compilerOptions = asRecord(parsed)?.compilerOptions;
  const options = asRecord(compilerOptions);
  const paths = asRecord(options?.paths);
  if (!paths) return [];

  const baseUrl = typeof options?.baseUrl === 'string' ? options.baseUrl : '.';
  const aliases: PathAlias[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) continue;
    const target = targets.find((candidate): candidate is string => typeof candidate === 'string');
    if (!target) continue;
    const alias = parsePathAlias(pattern, normalizeAliasTarget(baseUrl, target));
    if (alias) aliases.push(alias);
  }
  return aliases;
}

function parsePathAlias(pattern: string, target: string): PathAlias | undefined {
  const patternParts = pattern.split('*');
  const targetParts = target.split('*');
  if (patternParts.length > 2 || targetParts.length > 2) return undefined;
  if (patternParts.length === 1) {
    return { prefix: pattern, suffix: '', targetPrefix: target, targetSuffix: '' };
  }
  return {
    prefix: patternParts[0] ?? '',
    suffix: patternParts[1] ?? '',
    targetPrefix: targetParts[0] ?? '',
    targetSuffix: targetParts[1] ?? '',
  };
}

function normalizeAliasTarget(baseUrl: string, target: string): string {
  const normalizedBase = baseUrl.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  const normalizedTarget = target.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalizedBase && normalizedBase !== '.'
    ? `${normalizedBase}/${normalizedTarget}`
    : normalizedTarget;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stripJsonBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function indexTextReferences(
  byName: Map<string, Reference[]>,
  source: string,
  file: string,
  symbols: ReadonlyArray<Symbol>,
  imports: ReadonlyArray<Import>,
  lang: LanguageId,
): void {
  const names = new Set<string>();
  for (const symbol of symbols) {
    if (isIdentifierName(symbol.name)) names.add(symbol.name);
  }
  for (const imp of imports) {
    if (isIdentifierName(imp.local)) names.add(imp.local);
  }
  if (names.size === 0) return;

  const declarationRanges = symbols.map((s) => ({
    line: s.line,
    start: Math.max(0, s.col - 20),
    end: s.col + s.name.length,
  }));
  const importPositions = new Set(
    imports.map((imp) => positionKey(imp.line, imp.col)),
  );

  const lines = source.split('\n');
  const lexicalState: LexicalScanState = { inBlockComment: false };
  const lexicalOptions = lexicalOptionsForLanguage(lang);
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? '';
    const scanLine = maskComments(line, lexicalState, lexicalOptions);
    for (const token of scanIdentifierTokens(scanLine, lexicalOptions)) {
      if (!names.has(token.text)) continue;
      const lineNo = lineIdx + 1;
      const key = positionKey(lineNo, token.col);
      if (
        isWithinDeclarationRange(lineNo, token.col, declarationRanges) ||
        isDeclarationIdentifier(scanLine, token.col, token.text, symbols) ||
        importPositions.has(key)
      ) {
        continue;
      }
      const next = scanLine.slice(token.col + token.text.length).trimStart();
      pushRef(byName, token.text, {
        file,
        line: lineNo,
        col: token.col,
        kind: next.startsWith('(') ? 'call' : 'reference',
      });
    }
  }
}

function extractTsLikeImports(source: string, lexicalOptions: LexicalScanOptions): Import[] {
  const sourceForImports = maskSourceComments(source, lexicalOptions);
  const imports: Import[] = [];
  const exportAllRe = /\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  let exportAllMatch: RegExpExecArray | null;
  while ((exportAllMatch = exportAllRe.exec(sourceForImports)) !== null) {
    if (isOffsetInsideString(sourceForImports, exportAllMatch.index)) continue;
    const from = exportAllMatch[1] ?? '';
    const pos = offsetToLineCol(sourceForImports, exportAllMatch.index);
    imports.push({ local: '*', from, line: pos.line, col: pos.col, exportAll: true });
  }

  const namedImportRe = /\b(?:import|export)\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g;
  let namedMatch: RegExpExecArray | null;
  while ((namedMatch = namedImportRe.exec(sourceForImports)) !== null) {
    if (isOffsetInsideString(sourceForImports, namedMatch.index)) continue;
    const body = namedMatch[1] ?? '';
    const from = namedMatch[2] ?? '';
    const bodyOffset = namedMatch.index + (namedMatch[0].indexOf(body));
    const specifierRe = /([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/g;
    let specifier: RegExpExecArray | null;
    while ((specifier = specifierRe.exec(body)) !== null) {
      const imported = specifier[1];
      const local = specifier[2] ?? imported;
      if (local && imported && isIdentifierName(local) && isIdentifierName(imported)) {
        const localOffset = bodyOffset + specifier.index + specifier[0].lastIndexOf(local);
        const pos = offsetToLineCol(sourceForImports, localOffset);
        imports.push({ local, imported, from, line: pos.line, col: pos.col });
      }
    }
  }

  const lines = sourceForImports.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*import\s+(?:type\s+)?\{/.test(line)) continue;

    const defaultImport = line.match(/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/);
    if (defaultImport) {
      imports.push({
        local: defaultImport[1] ?? '',
        from: defaultImport[2] ?? '',
        line: i + 1,
        col: line.indexOf(defaultImport[1] ?? ''),
      });
      continue;
    }

    const namespaceImport = line.match(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/);
    if (namespaceImport) {
      imports.push({
        local: namespaceImport[1] ?? '',
        from: namespaceImport[2] ?? '',
        line: i + 1,
        col: line.indexOf(namespaceImport[1] ?? ''),
        namespace: true,
      });
    }
  }
  return imports.filter((imp) => imp.local.length > 0 && imp.col >= 0);
}

function extractPythonImports(source: string): Import[] {
  const imports: Import[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fromImport = line.match(/^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+(.+)$/);
    if (fromImport) {
      const from = fromImport[1] ?? '';
      for (const part of (fromImport[2] ?? '').split(',')) {
        const raw = part.trim();
        const local = raw.split(/\s+as\s+/i).pop()?.trim();
        if (local && isIdentifierName(local)) {
          imports.push({ local, from, line: i + 1, col: line.indexOf(local) });
        }
      }
      continue;
    }

    const importLine = line.match(/^\s*import\s+(.+)$/);
    if (importLine) {
      for (const part of (importLine[1] ?? '').split(',')) {
        const raw = part.trim();
        const local = raw.split(/\s+as\s+/i).pop()?.trim() ?? raw.split('.')[0] ?? '';
        if (local && isIdentifierName(local)) {
          imports.push({ local, from: raw, line: i + 1, col: line.indexOf(local) });
        }
      }
    }
  }
  return imports.filter((imp) => imp.local.length > 0 && imp.col >= 0);
}

function extractGoImports(source: string): Import[] {
  const imports: Import[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const aliasImport = line.match(/^\s*([A-Za-z_]\w*)\s+"([^"]+)"/);
    if (aliasImport) {
      imports.push({ local: aliasImport[1] ?? '', from: aliasImport[2] ?? '', line: i + 1, col: line.indexOf(aliasImport[1] ?? '') });
      continue;
    }
    const plainImport = line.match(/^\s*import\s+"([^"]+)"/) ?? line.match(/^\s*"([^"]+)"/);
    if (plainImport) {
      const from = plainImport[1] ?? '';
      const local = from.split('/').pop()?.replace(/[^A-Za-z0-9_]/g, '') ?? '';
      if (isIdentifierName(local)) imports.push({ local, from, line: i + 1, col: line.indexOf(from) });
    }
  }
  return imports.filter((imp) => imp.local.length > 0 && imp.col >= 0);
}

function extractRustImports(source: string): Import[] {
  const imports: Import[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const useLine = line.match(/^\s*use\s+(.+);/);
    if (!useLine) continue;
    const from = useLine[1] ?? '';
    for (const token of scanIdentifierTokens(from, lexicalOptionsForLanguage('rust'))) {
      imports.push({ local: token.text, from, line: i + 1, col: line.indexOf(token.text) });
    }
  }
  return imports.filter((imp) => imp.local.length > 0 && imp.col >= 0);
}

function extractBashImports(_source: string): Import[] {
  return [];
}

function scanIdentifierTokens(line: string, options: LexicalScanOptions): Array<{ text: string; col: number }> {
  const tokens: Array<{ text: string; col: number }> = [];
  const re = /[A-Za-z_$][\w$]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const text = match[0];
    const col = match.index;
    if (isLikelyInsideString(line, col) || isAfterLineComment(line, col, options)) continue;
    tokens.push({ text, col });
  }
  return tokens;
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
  const commentStart = lineCommentStart(line, options);
  if (commentStart < 0) return;
  for (let i = commentStart; i < chars.length; i++) chars[i] = ' ';
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

function lexicalOptionsForLanguage(lang: LanguageId | string): LexicalScanOptions {
  if (lang === 'python' || lang === 'bash') {
    return { blockComments: false, slashLineComments: false, hashLineComments: true };
  }
  return { blockComments: true, slashLineComments: true, hashLineComments: false };
}

function isIdentifierName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

function isLikelyInsideString(line: string, col: number): boolean {
  const before = line.slice(0, col);
  const singleQuotes = countUnescaped(before, "'");
  const doubleQuotes = countUnescaped(before, '"');
  const backticks = countUnescaped(before, '`');
  return singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1;
}

function isOffsetInsideString(source: string, offset: number): boolean {
  const before = source.slice(0, offset);
  const lineStart = before.lastIndexOf('\n') + 1;
  return isLikelyInsideString(source.slice(lineStart, offset), offset - lineStart);
}

function isAfterLineComment(line: string, col: number, options: LexicalScanOptions): boolean {
  const start = lineCommentStart(line.slice(0, col), options);
  return start >= 0;
}

function countUnescaped(text: string, char: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === char && text[i - 1] !== '\\') count += 1;
  }
  return count;
}

function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  if (offset < 0) return { line: 0, col: -1 };
  const before = source.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, col: lines.at(-1)?.length ?? 0 };
}

function isWithinDeclarationRange(
  line: number,
  col: number,
  ranges: ReadonlyArray<{ line: number; start: number; end: number }>,
): boolean {
  return ranges.some((range) => range.line === line && col >= range.start && col <= range.end);
}

function isDeclarationIdentifier(line: string, col: number, text: string, symbols: ReadonlyArray<Symbol>): boolean {
  if (!symbols.some((symbol) => symbol.name === text)) return false;
  const before = line.slice(0, col);
  return /\b(function|class|interface|type|enum|const|let|var)\s+$/.test(before);
}

function positionKey(line: number, col: number): string {
  return `${line}:${col}`;
}
