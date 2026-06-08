/**
 * @deepwhale/code-intel — Language pack registry (D-32.1, 2026-06-08).
 *
 * Maps file extension → tree-sitter language name and its WASM file path.
 * 6 languages baseline: typescript / javascript / python / go / bash / rust.
 *
 * Web-tree-sitter (WASM) approach: each grammar ships its .wasm file as
 * a separate npm package (tree-sitter-{lang}). Language.load(wasmPath)
 * accepts a path string OR Uint8Array. We use require.resolve() to get
 * the absolute path of each wasm bundle.
 *
 * No native compilation — all cross-platform, 0 build steps.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Mapping of language id → wasm file path.
 * Paths resolved lazily on first lookup via LANG_WASM (not at module load)
 * so test code that imports languages.ts without ever calling
 * getLanguageForExtension() does not pay the require.resolve cost.
 */
const LANG_WASM: Record<string, string> = {
  typescript: require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm'),
  tsx: require.resolve('tree-sitter-typescript/tree-sitter-tsx.wasm'),
  javascript: require.resolve('tree-sitter-javascript/tree-sitter-javascript.wasm'),
  python: require.resolve('tree-sitter-python/tree-sitter-python.wasm'),
  go: require.resolve('tree-sitter-go/tree-sitter-go.wasm'),
  bash: require.resolve('tree-sitter-bash/tree-sitter-bash.wasm'),
  rust: require.resolve('tree-sitter-rust/tree-sitter-rust.wasm'),
};

/** extension (no leading dot) → language id */
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  sh: 'bash',
  bash: 'bash',
  rs: 'rust',
};

/** human-readable language name for output */
const LANG_DISPLAY: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  bash: 'Bash',
  rust: 'Rust',
};

export type LanguageId = keyof typeof LANG_WASM;

/**
 * Resolve a file path's extension to a supported language id.
 * Returns null if the extension is not in the 6-language baseline.
 *
 * @param filePath - absolute or relative path
 * @returns language id (e.g. 'typescript') or null if unsupported
 */
export function getLanguageForExtension(filePath: string): LanguageId | null {
  // strip querystrings, drop any dirs
  const base = filePath.split('?')[0]?.split('#')[0] ?? filePath;
  const slashIdx = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
  const filename = slashIdx >= 0 ? base.slice(slashIdx + 1) : base;
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx < 0 || dotIdx === filename.length - 1) return null;
  const ext = filename.slice(dotIdx + 1).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  return (lang ?? null) as LanguageId | null;
}

/**
 * Resolve a language id to its wasm file path on disk.
 * Throws if the language id is not in the 6-language baseline.
 */
export function getWasmPathForLanguage(lang: LanguageId): string {
  const path = LANG_WASM[lang];
  if (!path) throw new Error(`unsupported language: ${lang}`);
  return path;
}

/**
 * List all supported language ids.
 * Useful for tooling that wants to enumerate baseline support.
 */
export function listSupportedLanguages(): ReadonlyArray<LanguageId> {
  return Object.keys(LANG_WASM) as LanguageId[];
}

/**
 * Pretty name for a language id (e.g. 'typescript' → 'TypeScript').
 * Returns the raw id if unknown.
 */
export function displayName(lang: string): string {
  return LANG_DISPLAY[lang] ?? lang;
}
