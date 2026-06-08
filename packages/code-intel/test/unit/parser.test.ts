import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { parseFile, ensureInit, parseSource, _resetForTest } from '../../src/parser.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = join(__dirname, '..', 'fixtures');

describe('parser (D-32.1)', () => {
  beforeAll(async () => {
    await ensureInit();
  });

  it('parses a TypeScript file and detects language', async () => {
    const r = await parseFile(join(FIXTURES, 'typescript.ts'));
    expect(r.language).toBe('typescript');
    expect(r.source).toContain('Greeter');
    expect(r.tree).toBeDefined();
    expect(r.tree.rootNode).toBeDefined();
    expect(r.tree.rootNode.type).toBe('program');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parses a JavaScript file', async () => {
    const r = await parseFile(join(FIXTURES, 'javascript.js'));
    expect(r.language).toBe('javascript');
    expect(r.tree.rootNode.type).toBe('program');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parses a Python file', async () => {
    const r = await parseFile(join(FIXTURES, 'python.py'));
    expect(r.language).toBe('python');
    expect(r.tree.rootNode.type).toBe('module');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parses a Go file', async () => {
    const r = await parseFile(join(FIXTURES, 'go.go'));
    expect(r.language).toBe('go');
    expect(r.tree.rootNode.type).toBe('source_file');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parses a Bash file', async () => {
    const r = await parseFile(join(FIXTURES, 'bash.sh'));
    expect(r.language).toBe('bash');
    expect(r.tree.rootNode.type).toBe('program');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parses a Rust file', async () => {
    const r = await parseFile(join(FIXTURES, 'rust.rs'));
    expect(r.language).toBe('rust');
    expect(r.tree.rootNode.type).toBe('source_file');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('throws on unsupported extension', async () => {
    await expect(parseFile(join(FIXTURES, 'unsupported.xyz'))).rejects.toThrow(/unsupported/);
  });

  it('propagates ENOENT for missing files', async () => {
    await expect(parseFile(join(FIXTURES, 'nope-does-not-exist.ts'))).rejects.toThrow();
  });

  it('parseSource works with inline source (no IO)', async () => {
    const r = await parseSource('const x = 1;', 'inline.ts');
    expect(r.language).toBe('typescript');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parseSource works for python inline', async () => {
    const r = await parseSource('def hi():\n    pass\n', 'inline.py');
    expect(r.language).toBe('python');
    expect(r.tree.rootNode.hasError).toBe(false);
  });

  it('parseSource throws on unknown extension', async () => {
    await expect(parseSource('hi', 'foo.unknown')).rejects.toThrow(/unsupported/);
  });

  it('partial tree on syntax errors (does NOT throw)', async () => {
    // type error: missing close brace
    const r = await parseSource('function broken( {', 'inline.ts');
    expect(r.tree).toBeDefined();
    expect(r.tree.rootNode.hasError).toBe(true);
  });

  it('does not call Parser.init twice (idempotent)', async () => {
    // ensureInit has been called once in beforeAll; a second call should
    // return the same promise (no observable diff, but we exercise the path).
    const a = ensureInit();
    const b = ensureInit();
    expect(a).toBe(b);
    await a;
    await b;
    // also re-reset to validate the test-only reset hook
    _resetForTest();
    const c = ensureInit();
    expect(c).not.toBe(a);
    await c;
  });
});
