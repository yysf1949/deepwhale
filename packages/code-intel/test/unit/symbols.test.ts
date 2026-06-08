import { describe, it, expect, beforeAll } from 'vitest';
import { extractSymbols, type Symbol } from '../../src/symbols.js';
import { parseSource, ensureInit } from '../../src/parser.js';

describe('symbols (D-32.1)', () => {
  beforeAll(async () => {
    await ensureInit();
  });

  it('extracts a top-level function (TS)', async () => {
    const source = 'function add(a: number, b: number): number { return a + b; }\n';
    const r = await parseSource(source, 'inline.ts');
    const syms = extractSymbols(r.tree, r.language, 'inline.ts');
    const fn = syms.find((s) => s.name === 'add');
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe('function');
    expect(fn!.line).toBe(1);
    expect(fn!.col).toBe(0);
    expect(fn!.file).toBe('inline.ts');
    expect(fn!.scope).toBeUndefined();
    // end position is past the closing brace
    expect(fn!.endLine).toBeGreaterThanOrEqual(1);
  });

  it('extracts a class (TS)', async () => {
    const source =
      'export class Greeter {\n  greet(name: string): string { return name; }\n}\n';
    const r = await parseSource(source, 'inline.ts');
    const syms = extractSymbols(r.tree, r.language, 'inline.ts');
    const cls = syms.find((s) => s.name === 'Greeter' && s.kind === 'class');
    expect(cls).toBeDefined();
    expect(cls!.line).toBe(1);
    expect(cls!.scope).toBeUndefined();
    expect(cls!.file).toBe('inline.ts');
  });

  it('extracts an import (TS)', async () => {
    const source = "import { foo } from './bar.js';\nfunction hi() {}\n";
    const r = await parseSource(source, 'inline.ts');
    const syms = extractSymbols(r.tree, r.language, 'inline.ts');
    const imp = syms.find((s) => s.kind === 'import');
    expect(imp).toBeDefined();
    // tree-sitter keeps the source quotes intact in `string` node text
    expect(imp!.name).toBe("'./bar.js'");
    expect(imp!.line).toBe(1);
    expect(imp!.file).toBe('inline.ts');
    // also: the file should have at least one function ("hi") so we know
    // extraction isn't accidentally returning only the import
    const fn = syms.find((s) => s.name === 'hi' && s.kind === 'function');
    expect(fn).toBeDefined();
  });

  it('extracts a method with the enclosing class as scope (nested scope)', async () => {
    const source = 'export class Outer {\n  inner(): void {}\n}\n';
    const r = await parseSource(source, 'inline.ts');
    const syms = extractSymbols(r.tree, r.language, 'inline.ts');
    const m = syms.find((s) => s.name === 'inner' && s.kind === 'method');
    expect(m).toBeDefined();
    expect(m!.scope).toBe('Outer');
    expect(m!.line).toBe(2);
    expect(m!.file).toBe('inline.ts');
    // sanity: the class itself is also there at line 1
    const cls = syms.find((s) => s.name === 'Outer' && s.kind === 'class');
    expect(cls).toBeDefined();
    expect(cls!.line).toBe(1);
  });
});
