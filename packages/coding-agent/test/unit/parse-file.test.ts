import { describe, it, expect, beforeAll } from 'vitest';
import { ParseFileTool } from '../../src/tools/parse-file.js';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const FIXTURE_DIR = resolve(
  process.cwd(),
  'packages/code-intel/test/fixtures'
);

describe('parse_file (D-32.1.1)', () => {
  let tool: ParseFileTool;
  beforeAll(() => {
    tool = new ParseFileTool();
  });

  it('summary mode returns language + line count + symbol count', async () => {
    const r = await tool.execute({
      action: 'summary',
      path: resolve(FIXTURE_DIR, 'typescript.ts'),
    });
    expect(r.success).toBe(true);
    expect(r.content).toContain('TypeScript');
    // ts fixture has 1 class + 1 function + 1 import = 3+ symbols
    const symCount = (r.meta as { symbolCount?: number })?.symbolCount ?? 0;
    expect(symCount).toBeGreaterThan(0);
  });

  it('ast mode returns AST root node type', async () => {
    const r = await tool.execute({
      action: 'ast',
      path: resolve(FIXTURE_DIR, 'typescript.ts'),
    });
    expect(r.success).toBe(true);
    expect(r.content).toMatch(/program/i);
  });

  it('symbols mode returns list of symbol names', async () => {
    const r = await tool.execute({
      action: 'symbols',
      path: resolve(FIXTURE_DIR, 'typescript.ts'),
    });
    expect(r.success).toBe(true);
    // ts fixture has at least one class + one function
    expect(r.content).toMatch(/class|function|interface/i);
  });

  it('returns error for missing file', async () => {
    const r = await tool.execute({
      action: 'summary',
      path: '/nonexistent/foo.ts',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/ENOENT|no such file|cannot find/i);
    }
  });

  it('returns error for unsupported extension', async () => {
    const r = await tool.execute({
      action: 'summary',
      path: resolve(FIXTURE_DIR, 'unsupported.xyz'),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/unsupported/i);
    }
  });
});

// silence "imported but unused" — keeps readFileSync reference for fixture shape
void readFileSync;
void existsSync;
