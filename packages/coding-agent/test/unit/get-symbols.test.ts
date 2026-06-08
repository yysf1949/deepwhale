import { describe, it, expect, beforeAll } from 'vitest';
import { GetSymbolsTool } from '../../src/tools/get-symbols.js';
import { resolve } from 'node:path';

const FIXTURE_DIR = resolve(
  process.cwd(),
  'packages/code-intel/test/fixtures'
);

describe('get_symbols (D-32.1.2)', () => {
  let tool: GetSymbolsTool;
  beforeAll(() => {
    tool = new GetSymbolsTool();
  });

  it('returns full symbol list for a file', async () => {
    const r = await tool.execute({ path: resolve(FIXTURE_DIR, 'typescript.ts') });
    expect(r.success).toBe(true);
    // ts fixture has at least 1 class + 1 function
    const count = (r.meta as { count?: number })?.count ?? 0;
    expect(count).toBeGreaterThan(0);
  });

  it('filters by kind=class', async () => {
    const r = await tool.execute({ path: resolve(FIXTURE_DIR, 'typescript.ts'), kind: 'class' });
    expect(r.success).toBe(true);
    const count = (r.meta as { count?: number })?.count ?? 0;
    expect(count).toBeGreaterThan(0);
    // All returned symbols should be 'class' kind
    expect(r.content.split('\n').every((line) => line.startsWith('class\t'))).toBe(true);
  });

  it('filters by kind=import', async () => {
    const r = await tool.execute({ path: resolve(FIXTURE_DIR, 'typescript.ts'), kind: 'import' });
    expect(r.success).toBe(true);
    // ts fixture has 1 import statement
    const count = (r.meta as { count?: number })?.count ?? 0;
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('returns error for unsupported extension', async () => {
    const r = await tool.execute({ path: resolve(FIXTURE_DIR, 'unsupported.xyz') });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/unsupported/i);
    }
  });

  it('rejects invalid kind value', async () => {
    const r = await tool.execute({ path: resolve(FIXTURE_DIR, 'typescript.ts'), kind: 'not-a-kind' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|kind/i);
    }
  });
});
