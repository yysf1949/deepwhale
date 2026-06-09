import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { CallGraphTool } from '../../src/tools/call-graph.js';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO = resolve(__dirname, '../../../code-intel/test/fixtures');

describe('call_graph (D-32.2.3)', () => {
  let tool: CallGraphTool;
  const tempDirs: string[] = [];

  beforeAll(() => {
    tool = new CallGraphTool();
  });

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('for-repo returns a summary of call graph edges', async () => {
    const r = await tool.execute({ action: 'for-repo', path: REPO });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Total edges:');
    expect(r.content).toContain('Top 20 by degree');
  });

  it('for-file returns deterministic edges in a single file', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'dw-callgraph-tool-'));
    tempDirs.push(repo);
    writeFileSync(
      join(repo, 'main.ts'),
      [
        'function callee() {',
        '  return 1;',
        '}',
        '',
        'function caller() {',
        '  return callee();',
        '}',
      ].join('\n'),
    );

    const r = await tool.execute({ action: 'for-file', path: repo, file: 'main.ts' });

    expect(r.success).toBe(true);
    expect(r.content).toContain('main.ts:caller');
    expect(r.content).toContain('main.ts:callee');
    expect(r.meta).toEqual(expect.objectContaining({ edgeCount: 1 }));
  });

  it('for-symbol returns incoming + outgoing calls for a symbol', async () => {
    const r = await tool.execute({ action: 'for-symbol', path: REPO, symbol: 'hello' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Symbol: hello');
    expect(r.content).toContain('Calls (outgoing):');
    expect(r.content).toContain('Called by (incoming):');
  });

  it('returns error for missing symbol in for-symbol', async () => {
    const r = await tool.execute({ action: 'for-symbol', path: REPO });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|symbol/i);
    }
  });

  it('returns error for missing file in for-file', async () => {
    const r = await tool.execute({ action: 'for-file', path: REPO });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|file/i);
    }
  });
});
