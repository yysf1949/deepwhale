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

// D-32.2.1 (2026-06-08): symbol-graph 跨文件 reference infra
export {
  buildSymbolGraph,
  findReferences,
  buildCallGraph,
  type SymbolGraph,
  type CallGraph,
  type CallEdge,
  type FileSymbols,
  type Import,
  type Reference,
} from './symbol-graph.js';

// Stabilization Gate-1 runner: machine-verifiable large-repo Code Intel gate.
export {
  runGate1,
  readGate1Scenario,
  parseGate1Args,
  loadGate1CliConfig,
  formatGate1Markdown,
  type Gate1Options,
  type Gate1CliConfig,
  type Gate1ParsedArgs,
  type Gate1Metrics,
  type Gate1Evidence,
  type Gate1SymbolEvidence,
  type Gate1Result,
} from './gate1.js';
