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
    expect(r.content).toContain('Heuristic calls (outgoing, depth=2):');
    expect(r.content).toContain('Heuristic called by (incoming, depth=2):');
    expect(r.meta).toEqual(expect.objectContaining({ heuristic: true }));
  });

  it('for-symbol depth controls transitive outgoing traversal', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'dw-callgraph-depth-'));
    tempDirs.push(repo);
    writeFileSync(
      join(repo, 'main.ts'),
      [
        'function leaf() {',
        '  return 1;',
        '}',
        '',
        'function mid() {',
        '  return leaf();',
        '}',
        '',
        'function root() {',
        '  return mid();',
        '}',
      ].join('\n'),
    );

    const depth1 = await tool.execute({ action: 'for-symbol', path: repo, symbol: 'root', depth: 1 });
    const depth2 = await tool.execute({ action: 'for-symbol', path: repo, symbol: 'root', depth: 2 });

    expect(depth1.success).toBe(true);
    expect(depth2.success).toBe(true);
    expect(depth1.meta).toMatchObject({
      traversalDepth: 1,
      outgoingCount: 1,
    });
    expect(depth1.content).toContain('depth=1');
    expect(depth1.content).toContain('main.ts:mid');
    expect(depth1.content).not.toContain('main.ts:leaf');
    expect(depth2.meta).toMatchObject({
      traversalDepth: 2,
      outgoingCount: 2,
    });
    expect(depth2.content).toContain('depth=2');
    expect(depth2.content).toContain('main.ts:mid');
    expect(depth2.content).toContain('main.ts:leaf');
    expect(depth2.meta?.outgoing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'main.ts:mid', depth: 1 }),
        expect.objectContaining({ id: 'main.ts:leaf', depth: 2 }),
      ]),
    );
  });

  it('for-symbol depth controls transitive incoming traversal', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'dw-callgraph-incoming-depth-'));
    tempDirs.push(repo);
    writeFileSync(
      join(repo, 'main.ts'),
      [
        'function leaf() {',
        '  return 1;',
        '}',
        '',
        'function mid() {',
        '  return leaf();',
        '}',
        '',
        'function root() {',
        '  return mid();',
        '}',
      ].join('\n'),
    );

    const result = await tool.execute({ action: 'for-symbol', path: repo, symbol: 'leaf', depth: 2 });

    expect(result.success).toBe(true);
    expect(result.meta).toMatchObject({
      traversalDepth: 2,
      incomingCount: 2,
    });
    expect(result.content).toContain('Heuristic called by (incoming, depth=2):');
    expect(result.content).toContain('main.ts:mid');
    expect(result.content).toContain('main.ts:root');
    expect(result.meta?.incoming).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'main.ts:mid', depth: 1 }),
        expect.objectContaining({ id: 'main.ts:root', depth: 2 }),
      ]),
    );
  });

  it('returns error for missing symbol in for-symbol', async () => {
    const r = await tool.execute({ action: 'for-symbol', path: REPO });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|symbol/i);
    }
  });

  it('for-symbol handles re-export chain (caller -> intermediate re-exporter -> target) (D-84 v1.5)', async () => {
    // Setup: caller imports `answer` from intermediate, intermediate
    // re-exports `answer` from target. The call graph for `answer` should
    // find caller.ts as a transitive caller via the re-export chain.
    const repo = mkdtempSync(join(tmpdir(), 'dw-callgraph-reexport-'));
    tempDirs.push(repo);
    writeFileSync(
      join(repo, 'target.ts'),
      'export function answer() { return 42; }\n',
    );
    writeFileSync(
      join(repo, 'intermediate.ts'),
      "export { answer } from './target';\n",
    );
    writeFileSync(
      join(repo, 'caller.ts'),
      "import { answer } from './intermediate';\nexport function run() { return answer(); }\n",
    );

    const result = await tool.execute({
      action: 'for-symbol',
      path: repo,
      symbol: 'answer',
      depth: 3,
    });

    // The call graph must recognize the re-export chain: caller.ts is a
    // transitive caller of `answer` via the re-export through intermediate.ts.
    // If the heuristic ignores re-exports, the incoming list would be empty.
    expect(result.success).toBe(true);
    expect(result.meta?.incomingCount).toBeGreaterThan(0);
    expect(result.content).toContain('caller.ts');
  });

  it('returns error for missing file in for-file', async () => {
    const r = await tool.execute({ action: 'for-file', path: REPO });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).toMatch(/invalid-input|file/i);
    }
  });
});
