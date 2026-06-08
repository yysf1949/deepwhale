/**
 * @deepwhale/code-intel — Parser (D-32.1, 2026-06-08).
 *
 * Web-tree-sitter wrapper that lazily initializes the runtime once and
 * caches a per-language Parser instance. parseFile() reads a file from
 * disk, detects the language, loads its grammar (cached), and returns
 * the AST tree.
 *
 * Red lines (跟 D-32.1 plan §Pitfalls):
 *   - Parser.init() must be awaited BEFORE any `new Parser()`. We lazy-init
 *     via ensureInit() on first parseFile() call.
 *   - 0 native build. All grammars are .wasm via web-tree-sitter.
 *   - No `/tmp` or os.tmpdir() usage. Fixtures live in test/fixtures/.
 *   - parse errors do NOT throw — tree-sitter returns a partial tree with
 *     .rootNode.hasError true. Caller can inspect.
 */

import { readFile } from 'node:fs/promises';
import { Parser, Language, type Tree } from 'web-tree-sitter';
import {
  getLanguageForExtension,
  getWasmPathForLanguage,
  type LanguageId,
} from './languages.js';

/** Public result of parseFile() */
export interface ParsedFile {
  /** source text that was parsed */
  source: string;
  /** detected language id (e.g. 'typescript') */
  language: LanguageId;
  /** tree-sitter tree; rootNode.hasError indicates parse errors */
  tree: Tree;
}

/** Module-private: has Parser.init() been awaited? */
let initPromise: Promise<void> | null = null;

/** Module-private: cache of Language instances per language id */
const langCache = new Map<LanguageId, Language>();

/**
 * One-time async init for web-tree-sitter. Idempotent — multiple callers
 * share the same Promise. Safe to call from any async context.
 *
 * Note: per web-tree-sitter docs, Parser.init() loads the runtime wasm.
 * It MUST be awaited before constructing any Parser.
 */
export function ensureInit(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = Parser.init().then(() => undefined);
  return initPromise;
}

/**
 * Get (or load+cache) a Language instance for the given language id.
 * Throws if init has not been awaited — call ensureInit() first.
 */
async function getLanguage(lang: LanguageId): Promise<Language> {
  const cached = langCache.get(lang);
  if (cached) return cached;
  const wasmPath = getWasmPathForLanguage(lang);
  const langObj = await Language.load(wasmPath);
  langCache.set(lang, langObj);
  return langObj;
}

/**
 * Parse a file from disk.
 *
 * Steps:
 *   1. ensureInit() — one-time web-tree-sitter runtime init.
 *   2. readFile(path) — read UTF-8 source.
 *   3. detect language from extension.
 *   4. load+cache grammar (Language.load(wasmPath)).
 *   5. construct a fresh Parser, setLanguage, parse.
 *
 * Errors:
 *   - file-not-found (ENOENT) — propagates as a NodeJS error
 *   - unsupported language (unknown extension) — throws Error
 *   - parse error — does NOT throw; tree has rootNode.hasError === true
 *
 * @param filePath - absolute or relative path
 * @returns ParsedFile { source, language, tree }
 */
export async function parseFile(filePath: string): Promise<ParsedFile> {
  await ensureInit();
  const source = await readFile(filePath, 'utf8');
  const language = getLanguageForExtension(filePath);
  if (!language) {
    throw new Error(`unsupported language for file: ${filePath}`);
  }
  const langObj = await getLanguage(language);
  const parser = new Parser();
  parser.setLanguage(langObj);
  const tree = parser.parse(source);
  if (!tree) throw new Error('parser returned null tree');
  return { source, language, tree };
}

/**
 * Parse a source string (no file IO).
 * Useful for tests that build source inline.
 *
 * @param source - source text
 * @param filePath - used for language detection (e.g. 'foo.ts')
 */
export async function parseSource(source: string, filePath: string): Promise<ParsedFile> {
  await ensureInit();
  const language = getLanguageForExtension(filePath);
  if (!language) {
    throw new Error(`unsupported language for file: ${filePath}`);
  }
  const langObj = await getLanguage(language);
  const parser = new Parser();
  parser.setLanguage(langObj);
  const tree = parser.parse(source);
  if (!tree) throw new Error('parser returned null tree');
  return { source, language, tree };
}

/**
 * Test-only helper: reset the init + language cache. Lets test files
 * re-init between cases if they mock the wasm path. Not part of the
 * public API (not exported from index.ts).
 */
export function _resetForTest(): void {
  initPromise = null;
  langCache.clear();
}
