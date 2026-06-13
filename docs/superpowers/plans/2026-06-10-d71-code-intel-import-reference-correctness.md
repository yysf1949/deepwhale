# D71 Code Intel Import Reference Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the heuristic Code Intel symbol graph so TypeScript combined default-plus-named imports are indexed and resolved consistently.

**Architecture:** Keep the change inside `packages/code-intel/src/symbol-graph.ts`. Extend the existing TypeScript-like import extraction path to parse `import defaultName, { named as local } from './module'` while preserving conservative call graph resolution and avoiding IDE-grade claims.

**Tech Stack:** TypeScript, Vitest, tree-sitter-backed symbol extraction, pnpm workspace scripts.

---

## File Structure

- Modify `packages/code-intel/test/unit/symbol-graph.test.ts`: add a RED test for combined default and named imports.
- Modify `packages/code-intel/src/symbol-graph.ts`: extend `extractTsLikeImports()` with minimal parsing for combined imports.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: advance status hygiene assertions from D70 to D71.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: record D71 completion and point next work to D72.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: record D71 evidence under v1.5 and keep aggregate progress conservative.

## Task 1: RED Test For Combined Imports

**Files:**
- Modify: `packages/code-intel/test/unit/symbol-graph.test.ts`

- [ ] **Step 1: Add the failing test**

Add this test after the existing namespace import member call test in the first `describe('symbol-graph (D-32.2.1)'...)` block:

```ts
  it('indexes and resolves TypeScript combined default and named imports', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'dw-symbol-combined-imports-'));
    try {
      await writeFile(
        resolve(dir, 'provider.ts'),
        [
          'export default function defaultTarget() {',
          '  return 1;',
          '}',
          '',
          'export function namedTarget() {',
          '  return 2;',
          '}',
        ].join('\n'),
      );
      await writeFile(resolve(dir, 'other.ts'), 'export function namedTarget() {\n  return 3;\n}\n');
      await writeFile(
        resolve(dir, 'consumer.ts'),
        [
          "import defaultTarget, { namedTarget as chosenTarget } from './provider.js';",
          '',
          'export function run() {',
          '  defaultTarget();',
          '  return chosenTarget();',
          '}',
        ].join('\n'),
      );

      const g = await buildSymbolGraph(dir);
      const defaultRefs = findReferences(g, 'defaultTarget');
      const namedRefs = findReferences(g, 'namedTarget');
      const chosenRefs = findReferences(g, 'chosenTarget');
      const callGraph = await buildCallGraph(g);

      expect(defaultRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'provider.ts', kind: 'declaration' }),
          expect.objectContaining({ file: 'consumer.ts', kind: 'import', line: 1 }),
          expect.objectContaining({ file: 'consumer.ts', kind: 'call', line: 4 }),
        ]),
      );
      expect(namedRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: 'provider.ts', kind: 'declaration' }),
          expect.objectContaining({ file: 'consumer.ts', kind: 'import', line: 1 }),
        ]),
      );
      expect(chosenRefs).toEqual(
        expect.arrayContaining([expect.objectContaining({ file: 'consumer.ts', kind: 'call', line: 5 })]),
      );
      expect(callGraph.edges.filter((edge) => edge.caller === 'consumer.ts:run')).toEqual([
        expect.objectContaining({
          caller: 'consumer.ts:run',
          callee: 'provider.ts:defaultTarget',
          line: 4,
        }),
        expect.objectContaining({
          caller: 'consumer.ts:run',
          callee: 'provider.ts:namedTarget',
          line: 5,
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
pnpm.cmd exec vitest run packages/code-intel/test/unit/symbol-graph.test.ts --reporter=verbose
```

Expected: FAIL because combined imports are not indexed and no call graph edge resolves through `chosenTarget`.

## Task 2: Minimal Import Extraction Fix

**Files:**
- Modify: `packages/code-intel/src/symbol-graph.ts`

- [ ] **Step 1: Add combined import parsing**

Inside `extractTsLikeImports()`, after the named import loop and before the line-by-line default/namespace loop, add a conservative parser for `import defaultName, { ... } from '...'`:

```ts
  const combinedImportRe =
    /\bimport\s+([A-Za-z_$][\w$]*)\s*,\s*\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g;
  let combinedMatch: RegExpExecArray | null;
  while ((combinedMatch = combinedImportRe.exec(sourceForImports)) !== null) {
    if (isOffsetInsideString(sourceForImports, combinedMatch.index)) continue;
    const defaultLocal = combinedMatch[1] ?? '';
    const body = combinedMatch[2] ?? '';
    const from = combinedMatch[3] ?? '';
    const defaultOffset = combinedMatch.index + combinedMatch[0].indexOf(defaultLocal);
    const defaultPos = offsetToLineCol(sourceForImports, defaultOffset);
    if (isIdentifierName(defaultLocal)) {
      imports.push({ local: defaultLocal, from, line: defaultPos.line, col: defaultPos.col });
    }

    const bodyOffset = combinedMatch.index + combinedMatch[0].indexOf(body);
    const specifierRe = /([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?/g;
    let specifier: RegExpExecArray | null;
    while ((specifier = specifierRe.exec(body)) !== null) {
      const imported = specifier[1];
      const local = specifier[2] ?? imported;
      if (local && imported && isIdentifierName(local) && isIdentifierName(imported)) {
        const localOffset = bodyOffset + specifier.index + specifier[0].lastIndexOf(local);
        const pos = offsetToLineCol(sourceForImports, localOffset);
        imports.push({ local, imported, from, line: pos.line, col: pos.col });
      }
    }
  }
```

- [ ] **Step 2: Avoid duplicate named-import extraction**

Change the existing `namedImportRe` so it does not also match combined imports:

```ts
  const namedImportRe = /\b(?:import|export)\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]/g;
```

Keep this expression unchanged if focused GREEN shows `pushRef()` de-duplicates the resulting import refs and the call graph target map remains stable.

- [ ] **Step 3: Run focused GREEN**

Run:

```powershell
pnpm.cmd exec vitest run packages/code-intel/test/unit/symbol-graph.test.ts --reporter=verbose
```

Expected: PASS for the new combined import test and existing symbol graph tests.

## Task 3: Status And Scorecard Updates

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update status hygiene test**

Change the final status test from D70 to D71. Require:

```ts
expect(block).toContain('Current sprint: D71 Code Intel import/reference graph correctness');
expect(block).toContain('D71 Code Intel combined import correctness');
expect(block).toContain('Next implementation slice: D72 release/version hygiene refresh');
expect(block).not.toMatch(/Current sprint: D70/i);
expect(block).not.toMatch(/Next implementation slice: D71/i);
```

Update the scorecard assertions to include D71 evidence and next actions D72-D74.

- [ ] **Step 2: Run RED for status docs**

Run:

```powershell
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because docs still point to D70/D71.

- [ ] **Step 3: Update public current-status blocks**

In `README.md`, `ROADMAP.md`, and `docs/ROADMAP_DECISIONS.md`:

- Change current sprint to `D71 Code Intel import/reference graph correctness`.
- Add completed slice `D71 Code Intel combined import correctness: TypeScript combined default-plus-named imports are indexed and resolved in the heuristic symbol graph and call graph.`
- Change next work to `Next implementation slice: D72 release/version hygiene refresh`.
- Add D71 plan path in the README reading guide.
- Change last status hygiene sprint in README to D71.

- [ ] **Step 4: Update scorecard**

Keep `aggregatePercent` at `48` and v1.5 at `65`. Add D71 evidence to v1.5:

```json
"D71 covers TypeScript combined default-plus-named import references and call edges"
```

Append the same evidence sentence to the Markdown evidence updates. Change next actions to:

```json
[
  "D72: refresh release/version hygiene after the Gate-1.5 advisory decision.",
  "D73: collect or explicitly defer live Gate-1.5 browser tasks before Browser enhancement work.",
  "D74: continue Code Intel correctness hardening only where tests prove specific behavior."
]
```

- [ ] **Step 5: Run status GREEN**

Run:

```powershell
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 4: Full Verification And Git

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full verification**

Run:

```powershell
pnpm.cmd exec tsc -b
pnpm.cmd exec eslint . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
pnpm.cmd build
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect diff**

Run:

```powershell
git diff -- packages/code-intel/src/symbol-graph.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d71-code-intel-import-reference-correctness.md
```

Expected: only D71 scoped changes.

- [ ] **Step 3: Stage D71 files only**

Run:

```powershell
git add packages/code-intel/src/symbol-graph.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d71-code-intel-import-reference-correctness.md
```

Expected: unrelated untracked plan files remain unstaged.

- [ ] **Step 4: Commit and push**

Run:

```powershell
git commit -m "fix(D-71): improve code intel import reference correctness"
git push
```

Expected: commit and push succeed on `feature/d36-gate2-live`.

---

## Self-Review

- Spec coverage: The plan implements the D71 scorecard action by improving a specific import/reference graph behavior without claiming IDE-grade semantics.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: The new test uses existing `buildSymbolGraph`, `findReferences`, and `buildCallGraph` APIs.
- Scope guard: No Browser defaulting, Gate-1 preferred-100k claim, or v1-v4 completion claim is introduced.
