import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { RenameSymbolTool } from '../../src/tools/rename-symbol.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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

describe('rename_symbol conservative mode (D-33.2.2)', () => {
  // 拍板 (D-33.2.2): default = reference-limited (no comment/string rewrite).
  // allow_textual_fallback=true is an OPT-IN to also rewrite occurrences in
  // comments and strings, using a word-boundary regex over the whole file.
  let tool: RenameSymbolTool;
  let tmpDir: string;
  beforeAll(() => {
    tool = new RenameSymbolTool();
  });
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rename-sym-d332-'));
    writeFileSync(
      join(tmpDir, 'a.ts'),
      [
        'export function target() { return 1; }',
        'export function caller() { return target(); }',
        "const text = 'target';",
        '// target is documentation only',
      ].join('\n'),
    );
    writeFileSync(join(tmpDir, 'b.ts'), 'function target() { return 2; }\n');
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not rewrite comments, strings, unrelated locals, or unrelated files by default', async () => {
    // apply=true so we can inspect the actual on-disk file content (the
    // dry-run output header itself contains the literal newName, which
    // would defeat a string-substring check on the dry-run content).
    const result = await tool.execute({
      path: tmpDir,
      oldName: 'target',
      newName: 'renamedTarget',
      apply: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/ambiguous-symbol/);
    }
    expect(readFileSync(join(tmpDir, 'a.ts'), 'utf8')).toContain('export function target()');
    expect(readFileSync(join(tmpDir, 'b.ts'), 'utf8')).toContain('function target()');
  });

  it('renames only the selected declaration file when targetFile disambiguates same-name declarations', async () => {
    const result = await tool.execute({
      path: tmpDir,
      oldName: 'target',
      newName: 'renamedTarget',
      targetFile: 'a.ts',
      apply: true,
    });

    expect(result.success).toBe(true);
    const aContent = readFileSync(join(tmpDir, 'a.ts'), 'utf8');
    const bContent = readFileSync(join(tmpDir, 'b.ts'), 'utf8');
    // Identifier references in code ARE rewritten
    expect(aContent).toContain('export function renamedTarget()');
    expect(aContent).toContain('return renamedTarget()');
    expect(bContent).toContain('function target()');
    expect(bContent).not.toContain('renamedTarget');
    // But string and comment occurrences are NOT rewritten (conservative default)
    expect(aContent).toContain("'target'");
    expect(aContent).toContain('// target is documentation only');
  });

  it('requires allow_textual_fallback=true to do broad textual replacement', async () => {
    // Use apply=true on a fresh fixture so we can compare on-disk file
    // content for both the safe (default) and the broad (opt-in) paths.
    const safeDir = mkdtempSync(join(tmpdir(), 'rename-sym-d332-safe-'));
    const broadDir = mkdtempSync(join(tmpdir(), 'rename-sym-d332-broad-'));
    for (const root of [safeDir, broadDir]) {
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(
        join(root, 'src', 'a.ts'),
        [
          'export function target() { return 1; }',
          "const text = 'target';",
        ].join('\n'),
      );
    }

    const safeResult = await tool.execute({
      path: safeDir,
      oldName: 'target',
      newName: 'renamedTarget',
      apply: true,
    });
    const broadResult = await tool.execute({
      path: broadDir,
      oldName: 'target',
      newName: 'renamedTarget',
      apply: true,
      allow_textual_fallback: true,
    });

    expect(safeResult.success).toBe(true);
    expect(broadResult.success).toBe(true);

    // Safe (default): string NOT rewritten
    const safeContent = readFileSync(join(safeDir, 'src', 'a.ts'), 'utf8');
    expect(safeContent).toContain("'target'");
    // Broad (opt-in): string IS rewritten
    const broadContent = readFileSync(join(broadDir, 'src', 'a.ts'), 'utf8');
    expect(broadContent).toContain("'renamedTarget'");

    rmSync(safeDir, { recursive: true, force: true });
    rmSync(broadDir, { recursive: true, force: true });
  });

  it('reports heuristic selector metadata and skipped cross-file alias references', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rename-sym-d48-alias-'));
    try {
      writeFileSync(join(dir, 'provider.ts'), 'export function target() {\n  return 1;\n}\n');
      writeFileSync(join(dir, 'other.ts'), 'export function target() {\n  return 2;\n}\n');
      writeFileSync(
        join(dir, 'consumer.ts'),
        "import { target as chosen } from './provider.js';\nexport function run() {\n  return chosen();\n}\n",
      );

      const result = await tool.execute({
        path: dir,
        oldName: 'target',
        newName: 'renamedTarget',
        targetFile: 'provider.ts',
        apply: true,
      });

      expect(result.success).toBe(true);
      expect(result.meta).toMatchObject({
        heuristic: true,
        selector: { targetFile: 'provider.ts' },
        ambiguousDeclarations: 2,
        changedReferences: expect.any(Number),
        skippedReferences: expect.any(Number),
      });
      expect(result.meta?.skippedReferenceDetails).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: 'consumer.ts',
            reason: expect.stringMatching(/cross-file/),
          }),
        ]),
      );
      expect(readFileSync(join(dir, 'provider.ts'), 'utf8')).toContain('function renamedTarget()');
      expect(readFileSync(join(dir, 'consumer.ts'), 'utf8')).toContain('target as chosen');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports namespace member references as skipped instead of claiming full rename safety', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rename-sym-d48-namespace-'));
    try {
      writeFileSync(join(dir, 'provider.ts'), 'export function target() {\n  return 1;\n}\n');
      writeFileSync(
        join(dir, 'consumer.ts'),
        "import * as api from './provider.js';\nexport function run() {\n  return api.target();\n}\n",
      );

      const result = await tool.execute({
        path: dir,
        oldName: 'target',
        newName: 'renamedTarget',
        targetFile: 'provider.ts',
        apply: true,
      });

      expect(result.success).toBe(true);
      expect(result.meta).toMatchObject({
        heuristic: true,
        skippedReferences: expect.any(Number),
      });
      expect(result.meta?.skippedReferenceDetails).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: 'consumer.ts',
            reason: expect.stringMatching(/cross-file|namespace/),
          }),
        ]),
      );
      expect(readFileSync(join(dir, 'consumer.ts'), 'utf8')).toContain('api.target()');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
