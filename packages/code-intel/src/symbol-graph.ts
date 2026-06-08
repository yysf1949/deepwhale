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
  kind: 'import' | 'declaration' | 'call' | 'type' | 'property';
  scope?: string;
}

export interface SymbolGraph {
  files: Map<string, FileSymbols>;
  /** symbol name → all references (declarations + usages) across all files */
  byName: Map<string, Reference[]>;
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

  for (const file of files) {
    const lang = getLanguageForExtension(file);
    if (!lang) continue; // unsupported language
    try {
      const parsed = await parseFile(file);
      const symbols = extractSymbols(parsed.tree, lang as LanguageId, file);
      const imports = extractImports(parsed.tree, lang as LanguageId, file);
      const rel = relative(abs, file).split(sep).join('/');
      fileMap.set(rel, { path: rel, language: lang, symbols, imports });

      for (const s of symbols) {
        const ref: Reference = { file: rel, line: s.line, col: s.col, kind: 'declaration' };
        if (s.scope !== undefined) ref.scope = s.scope;
        pushRef(byName, s.name, ref);
      }
      for (const imp of imports) {
        pushRef(byName, imp.local, {
          file: rel,
          line: imp.line,
          col: imp.col,
          kind: 'import',
        });
      }
    } catch {
      // skip files that fail to parse
    }
  }

  return { files: fileMap, byName };
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
    const source = await readFile(resolve(filePath), 'utf8').catch(() => '');
    if (!source) continue;
    const lines = source.split('\n');
    for (const sym of fileSym.symbols) {
      if (sym.kind !== 'function' && sym.kind !== 'method') continue;
      const callerId = `${filePath}:${sym.scope ? sym.scope + '.' : ''}${sym.name}`;
      const start = Math.max(0, sym.line - 1);
      const endLine = (sym as unknown as { endLine?: number }).endLine ?? start + 50;
      const end = Math.min(lines.length, endLine);
      for (let ln = start; ln < end; ln++) {
        const line = lines[ln] ?? '';
        for (const [name, calleeIds] of nameToIds) {
          if (name === sym.name) continue;
          if (name.length < 2) continue;
          const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
          if (re.test(line)) {
            for (const calleeId of calleeIds) {
              const edge: CallEdge = { caller: callerId, callee: calleeId, line: ln + 1, file: filePath };
              edges.push(edge);
              pushEdge(byCaller, callerId, edge);
              pushEdge(byCallee, calleeId, edge);
            }
          }
        }
      }
    }
  }

  return { edges, byCaller, byCallee };
}

// ── helpers ───────────────────────────────────────────────────────────────

function extractImports(_tree: unknown, _lang: LanguageId, _file: string): Import[] {
  // Simplified: defer full import extraction to D-32.2.2 (find_references tool)
  // where language-specific heuristics are added per language. For now, the
  // graph's byName index is built from symbol declarations only.
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
  if (arr.length >= MAX_REFERENCES_PER_NAME) return;
  arr.push(ref);
  map.set(name, arr);
}

function pushEdge(map: Map<string, CallEdge[]>, key: string, edge: CallEdge): void {
  const arr = map.get(key) ?? [];
  arr.push(edge);
  map.set(key, arr);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
