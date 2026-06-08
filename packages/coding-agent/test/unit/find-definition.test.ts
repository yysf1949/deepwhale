import { describe, it, expect, beforeAll } from 'vitest';
import { FindDefinitionTool } from '../../src/tools/find-definition.js';
import { resolve } from 'node:path';

const FIXTURE_DIR = resolve(
  process.cwd(),
  'packages/code-intel/test/fixtures'
);

describe('find_definition (D-32.1.4)', () => {
  let tool: FindDefinitionTool;
  beforeAll(() => {
    tool = new FindDefinitionTool();
  });

  it('finds a function definition', async () => {
    const r = await tool.execute({
      symbol: 'hello',
      path: resolve(FIXTURE_DIR, 'typescript.ts'),
    });
    expect(r.success).toBe(true);
    expect(r.content).toContain('hello');
    const kind = (r.meta as { kind?: string })?.kind;
    expect(kind).toBe('function');
  });

  it('finds a class definition', async () => {
    const r = await tool.execute({
      symbol: 'Greeter',
      path: resolve(FIXTURE_DIR, 'typescript.ts'),
    });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Greeter');
    const kind = (r.meta as { kind?: string })?.kind;
    expect(kind).toBe('class');
  });

  it('returns not-found for missing symbol', async () => {
    const r = await tool.execute({
      symbol: 'nonexistent_symbol_xyz',
      path: resolve(FIXTURE_DIR, 'typescript.ts'),
    });
    expect(r.success).toBe(true);
    expect(r.content).toMatch(/not found/i);
    const found = (r.meta as { found?: boolean })?.found;
    expect(found).toBe(false);
  });

  it('returns error for unsupported file', async () => {
    const r = await tool.execute({
      symbol: 'foo',
      path: resolve(FIXTURE_DIR, 'unsupported.xyz'),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/unsupported/i);
    }
  });
});
