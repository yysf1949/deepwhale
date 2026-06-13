import { describe, it, expect, beforeAll } from 'vitest';
import { SmartSearchTool } from '../../src/tools/smart-search.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, '../../../code-intel/test/fixtures');

describe('smart_search (D-32.3.1)', () => {
  let tool: SmartSearchTool;
  beforeAll(() => {
    tool = new SmartSearchTool();
  });

  it('local action finds symbol usage in fixture repo', async () => {
    const r = await tool.execute({ action: 'local', query: 'Greeter', path: REPO });
    expect(r.success).toBe(true);
    // Fixture has Greeter in typescript.ts and python.py (cross-file)
    expect(r.content).toContain('typescript.ts');
  });

  it('local action returns (no results) for unknown symbol', async () => {
    const r = await tool.execute({ action: 'local', query: 'NoSuchSymbol_zzz', path: REPO });
    expect(r.success).toBe(true);
    expect(r.content).toMatch(/no results/i);
  });

  it('remote action does not throw when gh is unavailable (graceful)', async () => {
    const r = await tool.execute({ action: 'remote', query: 'hello world' });
    expect(r.success).toBe(true);
    // gh may or may not be installed; tool should not throw
  });

  it('all action stays local-only when local has 0 results', async () => {
    const r = await tool.execute({ action: 'all', query: 'totally-unknown-symbol-zzz', path: REPO });
    expect(r.success).toBe(true);
    expect(r.content).toContain('local-only');
    expect(r.meta).toEqual(expect.objectContaining({
      action: 'all',
      remoteEnabled: false,
      remoteCount: 0,
    }));
  });

  it('returns error for missing query', async () => {
    const r = await tool.execute({ action: 'local' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|query/i);
    }
  });

  it('respects maxResults cap', async () => {
    const r = await tool.execute({ action: 'local', query: 'Greeter', path: REPO, maxResults: 1 });
    expect(r.success).toBe(true);
    const count = (r.meta as { count?: number })?.count ?? 0;
    expect(count).toBeLessThanOrEqual(1);
  });
});
