/**
 * @deepwhale/code-intel — public API (D-32.1, 2026-06-08).
 *
 * Exports parser (parseFile / parseSource / ensureInit), languages
 * (getLanguageForExtension / getWasmPathForLanguage / listSupportedLanguages
 * / displayName), and symbols (extractSymbols / Symbol / SymbolKind).
 *
 * Web-tree-sitter (WASM) is the only AST backend. No native bindings.
 */

export {
  ensureInit,
  parseFile,
  parseSource,
  type ParsedFile,
} from './parser.js';
export {
  getLanguageForExtension,
  getWasmPathForLanguage,
  listSupportedLanguages,
  displayName,
  type LanguageId,
} from './languages.js';
export {
  extractSymbols,
  type Symbol,
  type SymbolKind,
} from './symbols.js';
