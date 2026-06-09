# D50 Call Graph Depth Traversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `call_graph.depth` truthful by implementing real bounded BFS traversal for `for-symbol` results and exposing machine-readable traversal metadata.

**Architecture:** Keep `@deepwhale/code-intel` as a heuristic call graph provider. Implement traversal in the `call_graph` tool layer so the public tool behavior matches its schema without changing the graph builder API. `for-symbol` will return direct and transitive incoming/outgoing call nodes up to the requested depth; `for-file` and `for-repo` remain one-shot summaries and do not claim traversal.

**Tech Stack:** TypeScript, Vitest, `@deepwhale/code-intel`, existing `CallGraphTool`, PowerShell on Windows.

---

## Current Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*` and `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md`.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or other non-coding tools to the default registry.
- Keep Code Intel descriptions honest: heuristic, no IDE-grade/type-aware claims.
- Use TDD: write failing tests, verify RED, implement, verify GREEN.

## Files

- Modify: `packages/coding-agent/test/unit/call-graph.test.ts`
  - Add RED tests proving `depth` changes `for-symbol` traversal.
  - Assert meta includes outgoing/incoming nodes with depth values.
- Modify: `packages/coding-agent/src/tools/call-graph.ts`
  - Implement BFS traversal helpers.
  - Clamp depth to `[1, 4]`.
  - Return `meta.traversalDepth`, `meta.outgoing`, `meta.incoming`, `meta.rootIds`, and counts.
  - Update content headings to label heuristic BFS traversal.
- Create: `docs/superpowers/plans/2026-06-10-d50-call-graph-depth-traversal.md`

## Task 1: RED Tests For Depth Traversal

- [x] **Step 1: Add a three-hop fixture test**

Add this test to `packages/coding-agent/test/unit/call-graph.test.ts`:

```ts
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
```

- [x] **Step 2: Add an incoming traversal test**

Add this test:

```ts
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
```

- [x] **Step 3: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts
```

Expected before implementation: failures because `depth=1` and `depth=2` produce the same one-hop output and `meta.outgoing` / `meta.incoming` are missing.

Execution note: RED was verified before the BFS implementation. The new depth traversal tests failed because `traversalDepth`, machine-readable traversal arrays, and transitive incoming traversal were missing. A final wording RED was also verified after review: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts` failed with 2 assertion failures because the public `for-symbol` headings did not yet label the traversal as heuristic.

## Task 2: Implement BFS Traversal

- [x] **Step 1: Import call graph types**

Modify `packages/coding-agent/src/tools/call-graph.ts`:

```ts
import { buildSymbolGraph, buildCallGraph, type CallGraph } from '@deepwhale/code-intel';
```

- [x] **Step 2: Add traversal types and depth parsing**

Add near the imports:

```ts
interface TraversalNode {
  id: string;
  depth: number;
  via?: string;
  file: string;
  name: string;
}
```

Replace depth parsing with:

```ts
const depth = parseTraversalDepth(input['depth']);
```

Add helper:

```ts
function parseTraversalDepth(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 2;
  return Math.min(4, Math.max(1, Math.trunc(raw)));
}
```

- [x] **Step 3: Add BFS helper**

Add helper functions below the class:

```ts
function traverseCallGraph(
  callGraph: CallGraph,
  roots: ReadonlySet<string>,
  direction: 'outgoing' | 'incoming',
  maxDepth: number,
): TraversalNode[] {
  const index = direction === 'outgoing' ? callGraph.byCaller : callGraph.byCallee;
  const nodes: TraversalNode[] = [];
  const visited = new Set(roots);
  const queue = [...roots].map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const edge of index.get(current.id) ?? []) {
      const nextId = direction === 'outgoing' ? edge.callee : edge.caller;
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      const nextDepth = current.depth + 1;
      nodes.push({
        id: nextId,
        depth: nextDepth,
        via: current.id,
        file: symbolIdFile(nextId),
        name: symbolIdName(nextId),
      });
      queue.push({ id: nextId, depth: nextDepth });
    }
  }

  return nodes.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

function formatTraversal(nodes: ReadonlyArray<TraversalNode>): string {
  if (nodes.length === 0) return '(none)';
  return nodes.map((node) => `d${node.depth} ${node.id}${node.via ? ` via ${node.via}` : ''}`).join('\n  ');
}

function symbolIdFile(id: string): string {
  return id.split(':')[0] ?? '';
}
```

- [x] **Step 4: Use BFS in `for-symbol`**

Replace the direct one-hop set logic with:

```ts
const outgoing = traverseCallGraph(callGraph, matchingIds, 'outgoing', depth);
const incoming = traverseCallGraph(callGraph, matchingIds, 'incoming', depth);
const content = [
  `Symbol: ${sym}`,
  `Matched declarations: ${[...matchingIds].sort().join('\n  ') || '(none)'}`,
  `Heuristic calls (outgoing, depth=${depth}): ${formatTraversal(outgoing)}`,
  `Heuristic called by (incoming, depth=${depth}): ${formatTraversal(incoming)}`,
].join('\n');
return {
  success: true,
  content,
  meta: {
    action,
    symbol: sym,
    rootIds: [...matchingIds].sort(),
    traversalDepth: depth,
    outgoingCount: outgoing.length,
    incomingCount: incoming.length,
    outgoing,
    incoming,
    heuristic: true,
  },
};
```

- [x] **Step 5: Clarify non-traversal actions**

For `for-file`, add `heuristic: true` to meta and leave no `depth`.

For `for-repo`, replace `depth` in meta with `heuristic: true` only:

```ts
meta: { action, edgeCount: callGraph.edges.length, heuristic: true }
```

- [x] **Step 6: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts
```

Expected: pass.

Execution note: GREEN verified. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts` passed with 1 file and 7 tests after adding heuristic headings.

## Task 3: Wider Verification

- [x] **Step 1: Run Code Intel related tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts
```

Expected: pass.

Execution note: Passed. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts` passed with 4 files and 36 tests.

- [x] **Step 2: Run repository verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
git status --short --branch
```

Expected: typecheck, lint, tests, and diff check pass. If `pnpm.cmd test` fails in sandbox with a fetch/network error, rerun the same command with approval and record both outputs.

Execution note:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts`: passed with 2 files and 8 tests.
- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/call-graph.test.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts`: passed with 4 files and 36 tests.
- `.\node_modules\.bin\tsc.cmd -b`: passed.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: passed.
- `git diff --check`: clean.
- `pnpm.cmd test`: sandbox first timed out at 120s, second sandbox run failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of `pnpm.cmd test`: passed with 194 test files (193 passed, 1 skipped) and 1158 tests (1154 passed, 4 skipped).

## Task 4: Commit And Push

- [x] **Step 1: Update this plan with execution notes**

Record RED/GREEN and verification results in this file before committing.

- [ ] **Step 2: Stage only D50 files**

Run:

```powershell
git add docs/superpowers/plans/2026-06-10-d50-call-graph-depth-traversal.md packages/coding-agent/src/tools/call-graph.ts packages/coding-agent/test/unit/call-graph.test.ts
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "fix(D-50): implement call graph depth traversal"
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- This plan does not claim IDE-grade/type-aware call graph accuracy.
- This plan does not change Gate thresholds.
- This plan does not unlock any frozen non-coding tool surface.
- `depth` applies only to `for-symbol`; `for-file` and `for-repo` remain summaries and should not expose misleading depth metadata.
