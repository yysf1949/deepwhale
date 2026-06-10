/**
 * @deepwhale/code-intel — Symbol extraction (D-32.1, 2026-06-08).
 *
 * Walks the tree-sitter AST and surfaces top-level + nested definitions:
 * functions, classes, methods, imports, exports, types, variables. 6
 * language baseline: typescript / tsx / javascript / python / go / bash /
 * rust.
 *
 * Strategy: per-language AST walk keyed on the language-specific node type
 * (e.g. `function_declaration` in TS/JS, `function_definition` in Python,
 * `method_declaration` in Go, `function_item` in Rust). The name is taken
 * from the grammar's `name` field, with a fallback to scanning for the
 * first identifier-typed named child.
 *
 * Scope is derived by walking the parent chain: a method inside a class
 * inherits the class name as its scope; a function nested inside another
 * function inherits the outer function name. Anonymous exports produce a
 * Symbol with name='' so callers can still see the export site.
 *
 * No native build. No I/O. Pure AST walk.
 */

import type { Tree, Node } from 'web-tree-sitter';
import type { LanguageId } from './languages.js';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'import'
  | 'export'
  | 'type';

export interface Symbol {
  name: string;
  kind: SymbolKind;
  /** 1-based start line (tree-sitter Point.row is 0-based). */
  line: number;
  /** 0-based start column. */
  col: number;
  /** 1-based end line. */
  endLine: number;
  /** 0-based end column. */
  endCol: number;
  /** Enclosing scope name (e.g. class name for a method). */
  scope?: string;
  /** True when this named TS/JS declaration appears inside `export default ...`. */
  defaultExport?: boolean;
  /** File path the symbol was extracted from. */
  file: string;
}

/** First named child whose type represents a string literal. */
function firstStringText(node: Node): string | undefined {
  for (const c of node.namedChildren) {
    if (
      c.type === 'string' ||
      c.type === 'string_literal' ||
      c.type === 'raw_string_literal' ||
      c.type === 'interpreted_string_literal'
    ) {
      return c.text;
    }
  }
  return undefined;
}

/** First named child whose type represents an identifier / name. */
function firstIdentifierText(node: Node): string | undefined {
  for (const c of node.namedChildren) {
    if (
      c.type === 'identifier' ||
      c.type === 'type_identifier' ||
      c.type === 'property_identifier' ||
      c.type === 'name'
    ) {
      return c.text;
    }
  }
  return undefined;
}

/**
 * Build a Symbol from a tree-sitter node. `scope` is only included in the
 * output when defined so the result conforms to the optional `scope?` field
 * under `exactOptionalPropertyTypes: true`.
 */
function makeSymbol(
  node: Node,
  name: string,
  kind: SymbolKind,
  file: string,
  scope: string | undefined,
): Symbol {
  const start = node.startPosition;
  const end = node.endPosition;
  const base: Symbol = {
    name,
    kind,
    file,
    line: start.row + 1,
    col: start.column,
    endLine: end.row + 1,
    endCol: end.column,
  };
  if (scope !== undefined) {
    return { ...base, scope };
  }
  return base;
}

function withDefaultExport(symbol: Symbol, node: Node): Symbol {
  const parent = node.parent;
  if (parent?.type === 'export_statement' && /\bexport\s+default\b/.test(parent.text)) {
    return { ...symbol, defaultExport: true };
  }
  return symbol;
}

function visitChildren(
  node: Node,
  file: string,
  scope: string | undefined,
  visit: (n: Node, file: string, scope: string | undefined) => void,
): void {
  for (const c of node.namedChildren) {
    visit(c, file, scope);
  }
}

/** TS / TSX / JS / JSX share the same grammar family. */
function extractTsLike(
  root: Node,
  file: string,
  opts: { methodName: string; importName: string },
): Symbol[] {
  const out: Symbol[] = [];
  const visit = (node: Node, file: string, scope: string | undefined): void => {
    const t = node.type;
    if (t === 'function_declaration' || t === 'function') {
      const name = node.childForFieldName('name')?.text ?? firstIdentifierText(node);
      if (name) {
        out.push(withDefaultExport(makeSymbol(node, name, 'function', file, scope), node));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'class_declaration' || t === 'class') {
      const name = node.childForFieldName('name')?.text ?? firstIdentifierText(node);
      if (name) {
        out.push(withDefaultExport(makeSymbol(node, name, 'class', file, scope), node));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === opts.methodName) {
      const name = node.childForFieldName('name')?.text ?? firstIdentifierText(node);
      if (name) {
        out.push(makeSymbol(node, name, 'method', file, scope));
        visitChildren(node, file, scope, visit);
        return;
      }
    } else if (t === opts.importName) {
      const src = node.childForFieldName('source')?.text ?? firstStringText(node);
      if (src) {
        out.push(makeSymbol(node, src, 'import', file, scope));
      }
    } else if (t === 'export_statement') {
      out.push(makeSymbol(node, '', 'export', file, scope));
      visitChildren(node, file, scope, visit);
      return;
    }
    visitChildren(node, file, scope, visit);
  };
  visit(root, file, undefined);
  return out;
}

/** Python: functions, classes, methods (function def inside a class), imports. */
function extractPython(root: Node, file: string): Symbol[] {
  const out: Symbol[] = [];
  const visit = (node: Node, file: string, scope: string | undefined): void => {
    const t = node.type;
    if (t === 'function_definition') {
      const name = node.childForFieldName('name')?.text ?? firstIdentifierText(node);
      if (name) {
        const kind: SymbolKind = scope ? 'method' : 'function';
        out.push(makeSymbol(node, name, kind, file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'class_definition') {
      const name = node.childForFieldName('name')?.text ?? firstIdentifierText(node);
      if (name) {
        out.push(makeSymbol(node, name, 'class', file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'import_statement' || t === 'import_from_statement') {
      const txt = node.text;
      if (txt) {
        out.push(makeSymbol(node, txt, 'import', file, scope));
      }
    }
    visitChildren(node, file, scope, visit);
  };
  visit(root, file, undefined);
  return out;
}

/** Go: functions, methods, type declarations, imports. */
function extractGo(root: Node, file: string): Symbol[] {
  const out: Symbol[] = [];
  const visit = (node: Node, file: string, scope: string | undefined): void => {
    const t = node.type;
    if (t === 'function_declaration') {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        out.push(makeSymbol(node, name, 'function', file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'method_declaration') {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        out.push(makeSymbol(node, name, 'method', file, scope));
        visitChildren(node, file, scope, visit);
        return;
      }
    } else if (t === 'type_declaration') {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        out.push(makeSymbol(node, name, 'type', file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'import_declaration') {
      const src = firstStringText(node);
      if (src) {
        out.push(makeSymbol(node, src, 'import', file, scope));
      }
    }
    visitChildren(node, file, scope, visit);
  };
  visit(root, file, undefined);
  return out;
}

/** Bash: function definitions + top-level variable assignments. */
function extractBash(root: Node, file: string): Symbol[] {
  const out: Symbol[] = [];
  const visit = (node: Node, file: string, scope: string | undefined): void => {
    const t = node.type;
    if (t === 'function_definition') {
      const name = node.childForFieldName('name')?.text ?? firstIdentifierText(node);
      if (name) {
        out.push(makeSymbol(node, name, 'function', file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'variable_assignment') {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        out.push(makeSymbol(node, name, 'variable', file, scope));
      }
    }
    visitChildren(node, file, scope, visit);
  };
  visit(root, file, undefined);
  return out;
}

/** Rust: functions, structs, enums, traits, impl bodies, use declarations. */
function extractRust(root: Node, file: string): Symbol[] {
  const out: Symbol[] = [];
  const visit = (node: Node, file: string, scope: string | undefined): void => {
    const t = node.type;
    if (t === 'function_item') {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        out.push(makeSymbol(node, name, 'function', file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'struct_item' || t === 'enum_item' || t === 'trait_item') {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        out.push(makeSymbol(node, name, 'type', file, scope));
        visitChildren(node, file, name, visit);
        return;
      }
    } else if (t === 'impl_item') {
      visitChildren(node, file, scope, visit);
      return;
    } else if (t === 'use_declaration') {
      const txt = node.text.replace(/^use\s+/, '').replace(/;$/, '').trim();
      if (txt) {
        out.push(makeSymbol(node, txt, 'import', file, scope));
      }
    }
    visitChildren(node, file, scope, visit);
  };
  visit(root, file, undefined);
  return out;
}

/**
 * Walk the tree-sitter AST and return all definitions, imports, and exports.
 *
 * Supports 7 baseline language ids: typescript / tsx / javascript / python /
 * go / bash / rust. Other languages throw.
 *
 * @param tree - parsed tree (from `parseFile` / `parseSource`)
 * @param lang - language id (must match the tree's grammar)
 * @param file - file path (recorded in each Symbol for downstream use)
 * @returns array of Symbol in source order
 */
export function extractSymbols(
  tree: Tree,
  lang: LanguageId,
  file: string,
): Symbol[] {
  const root = tree.rootNode;
  switch (lang) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
      return extractTsLike(root, file, {
        methodName: 'method_definition',
        importName: 'import_statement',
      });
    case 'python':
      return extractPython(root, file);
    case 'go':
      return extractGo(root, file);
    case 'bash':
      return extractBash(root, file);
    case 'rust':
      return extractRust(root, file);
    default:
      throw new Error(`unsupported language: ${lang}`);
  }
}
