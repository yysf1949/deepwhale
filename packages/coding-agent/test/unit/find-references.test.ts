import { describe, it, expect, beforeAll } from 'vitest';
import { FindReferencesTool } from '../../src/tools/find-references.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, '../../../code-intel/test/fixtures');

describe('find_references (D-32.2.2)', () => {
  let tool: FindReferencesTool;
  beforeAll(() => {
    tool = new FindReferencesTool();
  });

  it('finds a TypeScript class declaration across the repo', async () => {
    const r = await tool.execute({ action: 'references', name: 'Greeter', path: REPO });
    expect(r.success).toBe(true);
    const count = (r.meta as { count?: number })?.count ?? 0;
    expect(count).toBeGreaterThan(0);
    // typescript.ts has `class Greeter`
    expect(r.content).toContain('typescript.ts');
    expect(r.content).toContain('declaration');
  });

  it('finds a Python class declaration (same name as TS) — different file', async () => {
    const r = await tool.execute({ action: 'references', name: 'Greeter', path: REPO });
    expect(r.success).toBe(true);
    expect(r.content).toContain('python.py');
  });

  it('filters by file param', async () => {
    const r = await tool.execute({ action: 'references', name: 'Greeter', path: REPO, file: 'typescript.ts' });
    expect(r.success).toBe(true);
    const count = (r.meta as { count?: number })?.count ?? 0;
    expect(count).toBeGreaterThan(0);
    // No python.py line should appear
    expect(r.content).not.toContain('python.py');
  });

  it('count mode returns just a number', async () => {
    const r = await tool.execute({ action: 'count', name: 'Greeter', path: REPO });
    expect(r.success).toBe(true);
    expect(r.content).toMatch(/^\d+$/);
  });

  it('returns (no references) for unknown symbol', async () => {
    const r = await tool.execute({ action: 'references', name: 'NoSuchSymbol_xyz', path: REPO });
    expect(r.success).toBe(true);
    expect(r.content).toBe('(no references)');
  });

  it('returns error for missing name', async () => {
    const r = await tool.execute({ action: 'references', name: '', path: REPO });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|name/i);
    }
  });
});
