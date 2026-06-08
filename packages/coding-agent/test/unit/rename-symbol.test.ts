import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { RenameSymbolTool } from '../../src/tools/rename-symbol.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('rename_symbol (D-32.2.4)', () => {
  let tool: RenameSymbolTool;
  let tmpDir: string;
  beforeAll(() => {
    tool = new RenameSymbolTool();
  });
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rename-sym-test-'));
    writeFileSync(join(tmpDir, 'a.ts'), 'export function foo(): number { return 42; }\nexport const bar = foo;\n');
    writeFileSync(join(tmpDir, 'b.ts'), 'import { foo } from "./a";\nexport function useFoo() { return foo(); }\n');
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run returns preview without writing', async () => {
    const r = await tool.execute({ oldName: 'foo', newName: 'baz', path: tmpDir });
    expect(r.success).toBe(true);
    expect(r.content).toContain('DRY-RUN');
    expect(r.content).toMatch(/'foo'.*'baz'/);
    // Original file unchanged
    expect(readFileSync(join(tmpDir, 'a.ts'), 'utf8')).toContain('export function foo()');
  });

  it('apply=true writes changes to all files', async () => {
    const r = await tool.execute({ oldName: 'foo', newName: 'baz', path: tmpDir, apply: true });
    expect(r.success).toBe(true);
    expect(r.content).toContain('RENAMED');
    // Files now contain baz instead of foo
    expect(readFileSync(join(tmpDir, 'a.ts'), 'utf8')).toContain('export function baz()');
    expect(readFileSync(join(tmpDir, 'b.ts'), 'utf8')).toContain('baz');
    expect(readFileSync(join(tmpDir, 'b.ts'), 'utf8')).not.toContain('foo');
  });

  it('returns no-op for oldName == newName', async () => {
    const r = await tool.execute({ oldName: 'foo', newName: 'foo', path: tmpDir });
    expect(r.success).toBe(true);
    expect(r.content).toMatch(/no-op/i);
  });

  it('returns (no changes) for unknown symbol', async () => {
    const r = await tool.execute({ oldName: 'nonexistent_xyz_abc', newName: 'newone', path: tmpDir });
    expect(r.success).toBe(true);
    expect(r.content).toMatch(/Files affected: 0/);
  });

  it('word-boundary: does not replace partial matches (e.g. "food" stays)', async () => {
    writeFileSync(join(tmpDir, 'c.ts'), 'export const food = "rice";\nexport function fooBar() { return food; }\n');
    const r = await tool.execute({ oldName: 'foo', newName: 'baz', path: tmpDir, apply: true });
    expect(r.success).toBe(true);
    // `food` is NOT renamed (word boundary)
    expect(readFileSync(join(tmpDir, 'c.ts'), 'utf8')).toContain('const food = "rice"');
    // `fooBar` contains "foo" at word boundary (foo is followed by Bar which is uppercase)
    // Actually `foo` is followed by `B` which is alphanumeric, so `\bfoo\b` won't match.
    // Therefore fooBar stays.
    expect(readFileSync(join(tmpDir, 'c.ts'), 'utf8')).toContain('fooBar');
  });

  it('does not rewrite strings or comments during reference-limited rename', async () => {
    writeFileSync(
      join(tmpDir, 'c.ts'),
      [
        'import { foo } from "./a";',
        '// foo should stay in this comment',
        'const label = "foo should stay in this string";',
        'export function callFoo() { return foo(); }',
        '',
      ].join('\n'),
    );

    const r = await tool.execute({ oldName: 'foo', newName: 'baz', path: tmpDir, apply: true });

    expect(r.success).toBe(true);
    const content = readFileSync(join(tmpDir, 'c.ts'), 'utf8');
    expect(content).toContain('import { baz } from "./a";');
    expect(content).toContain('// foo should stay in this comment');
    expect(content).toContain('"foo should stay in this string"');
    expect(content).toContain('return baz();');
  });
});
