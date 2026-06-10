# D74 Code Intel Default Re-Export Call Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the heuristic TypeScript call graph resolve calls imported through `export { default as name } from './module'` barrels to the original named default declaration.

**Architecture:** Add one regression test that proves a consumer importing a named default re-export from a barrel gets a call edge to the provider's actual default function name. Then extend symbol extraction with a conservative `defaultExport` marker for default-exported function/class declarations and use that marker only when resolving the synthetic `default` export name.

**Tech Stack:** TypeScript, Vitest, tree-sitter-backed Code Intel parser, Markdown/JSON status docs.

---

## File Structure

- Modify `packages/code-intel/test/unit/symbol-graph.test.ts`: add the RED regression for default re-export barrel call graph resolution.
- Modify `packages/code-intel/src/symbols.ts`: mark named TypeScript/JavaScript function/class declarations inside `export default` statements with `defaultExport: true`.
- Modify `packages/code-intel/src/symbol-graph.ts`: resolve a synthetic `default` re-export to the unique symbol marked `defaultExport`.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: advance status docs and scorecard expectations to D74/D75-D77.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: add completed D74 slice and next work D75.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: add D74 v1.5 evidence while preserving the heuristic caveat and 48% aggregate.

## Task 1: RED Code Intel Regression

**Files:**
- Modify: `packages/code-intel/test/unit/symbol-graph.test.ts`

- [ ] **Step 1: Add failing regression test**

Add this test after `resolves calls imported through TypeScript export-star barrels to the original file`:

```ts
  it('resolves calls imported through TypeScript default re-export barrels to the original named default declaration', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'dw-symbol-callgraph-default-reexport-'));
    try {
      await writeFile(
        resolve(dir, 'provider.ts'),
        [
          'export default function defaultTarget() {',
          '  return 1;',
          '}',
        ].join('\n'),
      );
      await writeFile(resolve(dir, 'barrel.ts'), "export { default as defaultTarget } from './provider.js';\n");
      await writeFile(resolve(dir, 'other.ts'), 'export function defaultTarget() {\n  return 2;\n}\n');
      await writeFile(
        resolve(dir, 'consumer.ts'),
        [
          "import { defaultTarget } from './barrel.js';",
          '',
          'export function run() {',
          '  return defaultTarget();',
          '}',
        ].join('\n'),
      );

      const g = await buildSymbolGraph(dir);
      const callGraph = await buildCallGraph(g);

      expect(callGraph.edges.filter((edge) => edge.caller === 'consumer.ts:run')).toEqual([
        expect.objectContaining({
          caller: 'consumer.ts:run',
          callee: 'provider.ts:defaultTarget',
          line: 4,
        }),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: Run focused RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/code-intel/test/unit/symbol-graph.test.ts -t "default re-export barrels" --reporter=verbose
```

Expected: FAIL because the call graph currently resolves the barrel re-export through the synthetic name `default`, which has no callee id.

## Task 2: Minimal Code Intel Fix

**Files:**
- Modify: `packages/code-intel/src/symbols.ts`
- Modify: `packages/code-intel/src/symbol-graph.ts`

- [ ] **Step 1: Mark default-exported declarations**

In `packages/code-intel/src/symbols.ts`, extend `Symbol`:

```ts
  /** True when this named TS/JS declaration appears inside `export default ...`. */
  defaultExport?: boolean;
```

Add a helper near `makeSymbol`:

```ts
function withDefaultExport(symbol: Symbol, node: Node): Symbol {
  const parent = node.parent;
  if (parent?.type === 'export_statement' && /\bexport\s+default\b/.test(parent.text)) {
    return { ...symbol, defaultExport: true };
  }
  return symbol;
}
```

Wrap named TS-like function/class symbols:

```ts
out.push(withDefaultExport(makeSymbol(node, name, 'function', file, scope), node));
```

and:

```ts
out.push(withDefaultExport(makeSymbol(node, name, 'class', file, scope), node));
```

- [ ] **Step 2: Resolve synthetic default re-exports**

In `packages/code-intel/src/symbol-graph.ts`, add a helper near `resolveReExportTarget`:

```ts
function findDefaultExportTarget(filePath: string, fileSym: FileSymbols): string | undefined {
  const defaultSymbols = fileSym.symbols.filter((symbol) => symbol.defaultExport && symbol.name.length > 0);
  if (defaultSymbols.length !== 1) return undefined;
  const symbol = defaultSymbols[0];
  return `${filePath}:${symbol.scope ? symbol.scope + '.' : ''}${symbol.name}`;
}
```

Then, in `resolveReExportTarget` after the direct symbol-name check:

```ts
  if (symbolName === 'default') {
    const defaultTarget = findDefaultExportTarget(filePath, fileSym);
    if (defaultTarget) return defaultTarget;
  }
```

- [ ] **Step 3: Run focused GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/code-intel/test/unit/symbol-graph.test.ts -t "default re-export barrels" --reporter=verbose
```

Expected: PASS.

## Task 3: Status Docs RED/GREEN

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update status hygiene test**

Change scorecard nextActions expectations to:

```ts
expect(scorecard.nextActions).toContain(
  'D75: tighten planner, reviewer, memory, and main-loop integration evidence without expanding default tools.',
);
expect(scorecard.nextActions).toContain(
  'D76: collect real Gate-1.5 Browser task runs only after opt-in Browser task sourcing is available.',
);
expect(scorecard.nextActions).toContain(
  'D77: convert the v2.5 planner integration gap into a main-loop evidence fixture before any rescore.',
);
expect(scorecard.nextActions.join('\n')).not.toMatch(/^D74:/m);
```

Change final status assertions:

```ts
expect(block).toContain('Current sprint: D74 Code Intel default re-export call graph correctness');
expect(block).toContain('D74 Code Intel default re-export call graph correctness');
expect(block).toContain('Next implementation slice: D75 planner, reviewer, memory, and main-loop integration evidence');
expect(block).not.toMatch(/Current sprint: D73/i);
expect(block).not.toMatch(/Next implementation slice: D74/i);
```

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL until docs and scorecard are updated.

- [ ] **Step 2: Update public status docs**

In all three public docs:

- Change current sprint to `D74 Code Intel default re-export call graph correctness`.
- Add completed slice `D74 Code Intel default re-export call graph correctness: calls imported through default re-export barrels resolve to the original named default declaration.`
- Change next implementation slice to `D75 planner, reviewer, memory, and main-loop integration evidence`.

In README only:

- Add `D74 plan: docs/superpowers/plans/2026-06-10-d74-code-intel-default-reexport-callgraph.md`.
- Change `Last status hygiene sprint: D73.` to `Last status hygiene sprint: D74.`

- [ ] **Step 3: Update scorecard**

Keep aggregate `48%` and v1.5 `65%`.

Add v1.5 evidence:

```json
"D74 resolves TypeScript default re-export barrel call edges to the original named default declaration"
```

Change next actions to:

```json
[
  "D75: tighten planner, reviewer, memory, and main-loop integration evidence without expanding default tools.",
  "D76: collect real Gate-1.5 Browser task runs only after opt-in Browser task sourcing is available.",
  "D77: convert the v2.5 planner integration gap into a main-loop evidence fixture before any rescore."
]
```

Mirror those updates in Markdown.

- [ ] **Step 4: Run status GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 4: Full Verification And Git

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full verification**

Run:

```powershell
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
```

Expected: all commands exit 0.

- [ ] **Step 2: Stage D74 files only**

Run:

```powershell
git add packages/code-intel/src/symbols.ts packages/code-intel/src/symbol-graph.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d74-code-intel-default-reexport-callgraph.md
```

Expected: unrelated untracked plan files remain unstaged.

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "fix(D-74): resolve default re-export call graph targets"
git push
```

Expected: commit and push succeed on `feature/d36-gate2-live`.

---

## Self-Review

- Spec coverage: D74 covers one Code Intel correctness gap with a focused regression test.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: `defaultExport?: boolean` is optional and does not require fixture churn.
- Scope guard: Code Intel remains heuristic; this does not claim IDE-grade import/export analysis or change any default tool exposure.
