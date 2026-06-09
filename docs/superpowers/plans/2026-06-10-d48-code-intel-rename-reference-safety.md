# D48 Code Intel Rename Reference Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `rename_symbol` more honest and safer by exposing heuristic metadata, selector details, ambiguity counts, and skipped cross-file references before deeper IDE-grade binding work.

**Architecture:** Keep the current `@deepwhale/code-intel` graph as a heuristic AST/text index. Do not claim type-aware rename. Add focused regression tests around alias, barrel, and namespace import cases, then make `rename_symbol` return machine-readable metadata about what was changed and what was deliberately skipped.

**Tech Stack:** TypeScript, Vitest, `@deepwhale/code-intel`, existing `RenameSymbolTool`, PowerShell on Windows.

---

## Current Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*` files.
- Do not add Browser, media, productivity, channel, Desktop, or marketplace tools to the default registry.
- Keep Code Intel descriptions honest: heuristic, no IDE-grade/type-aware claims.
- Use TDD: write failing tests first, run them and observe the expected failure, then implement.

## Files

- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`
- Modify if needed: `packages/coding-agent/test/unit/code-intel-descriptions.test.ts`
- Create: `docs/superpowers/plans/2026-06-10-d48-code-intel-rename-reference-safety.md`

## Task 1: Red Tests For Rename Metadata And Skipped Bindings

- [x] **Step 1: Add failing metadata tests**

Add tests to `packages/coding-agent/test/unit/rename-symbol.test.ts`:

```ts
it('reports heuristic selector metadata and skipped cross-file alias references', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rename-sym-d48-alias-'));
  try {
    writeFileSync(join(dir, 'provider.ts'), 'export function target() {\n  return 1;\n}\n');
    writeFileSync(join(dir, 'other.ts'), 'export function target() {\n  return 2;\n}\n');
    writeFileSync(
      join(dir, 'consumer.ts'),
      "import { target as chosen } from './provider.js';\nexport function run() {\n  return chosen();\n}\n",
    );

    const result = await tool.execute({
      path: dir,
      oldName: 'target',
      newName: 'renamedTarget',
      targetFile: 'provider.ts',
      apply: true,
    });

    expect(result.success).toBe(true);
    expect(result.meta).toMatchObject({
      heuristic: true,
      selector: { targetFile: 'provider.ts' },
      ambiguousDeclarations: 2,
      changedReferences: expect.any(Number),
      skippedReferences: expect.any(Number),
    });
    expect(result.meta?.skippedReferenceDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'consumer.ts',
          reason: expect.stringMatching(/cross-file/),
        }),
      ]),
    );
    expect(readFileSync(join(dir, 'provider.ts'), 'utf8')).toContain('function renamedTarget()');
    expect(readFileSync(join(dir, 'consumer.ts'), 'utf8')).toContain('target as chosen');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('reports namespace member references as skipped instead of claiming full rename safety', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rename-sym-d48-namespace-'));
  try {
    writeFileSync(join(dir, 'provider.ts'), 'export function target() {\n  return 1;\n}\n');
    writeFileSync(
      join(dir, 'consumer.ts'),
      "import * as api from './provider.js';\nexport function run() {\n  return api.target();\n}\n",
    );

    const result = await tool.execute({
      path: dir,
      oldName: 'target',
      newName: 'renamedTarget',
      targetFile: 'provider.ts',
      apply: true,
    });

    expect(result.success).toBe(true);
    expect(result.meta).toMatchObject({
      heuristic: true,
      skippedReferences: expect.any(Number),
    });
    expect(result.meta?.skippedReferenceDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'consumer.ts',
          reason: expect.stringMatching(/cross-file|namespace/),
        }),
      ]),
    );
    expect(readFileSync(join(dir, 'consumer.ts'), 'utf8')).toContain('api.target()');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run tests to verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/rename-symbol.test.ts
```

Expected: fail because `meta.heuristic`, `meta.selector`, `meta.ambiguousDeclarations`, and skipped reference details do not exist yet.

Execution note: RED was verified before implementation. The new tests failed because `meta.heuristic`, `meta.selector`, `meta.ambiguousDeclarations`, and `skippedReferenceDetails` were missing from `rename_symbol` results.

## Task 2: Implement Honest Rename Metadata

- [x] **Step 1: Add selection metadata**

Update `selectRenameReferences()` in `packages/coding-agent/src/tools/rename-symbol.ts` to return:

```ts
{
  ok: true,
  refs: ReadonlyArray<Reference>,
  skippedRefs: ReadonlyArray<{ file: string; line: number; col: number; kind: Reference['kind']; reason: string }>,
  targetFile?: string,
  selector: { targetFile?: string; targetLine?: number; targetScope?: string },
  ambiguousDeclarations: number,
}
```

- [x] **Step 2: Keep implementation conservative**

When a selector matches one declaration, keep current same-file rewrite behavior. Count references in other files as skipped with a reason like `cross-file binding not rewritten by heuristic rename`. This is honest progress without pretending to solve type-aware rename.

- [x] **Step 3: Return machine-readable metadata**

Update successful `rename_symbol` results so `meta` includes:

```ts
{
  heuristic: true,
  selector,
  ambiguousDeclarations,
  changedReferences: totalReplacements,
  skippedReferences: skippedRefs.length,
  skippedReferenceDetails: skippedRefs,
}
```

Only include `skippedReferenceDetails` when non-empty.

- [x] **Step 4: Run tests to verify GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts
```

Expected: pass.

Execution note: GREEN command passed with 2 files and 12 tests:

```text
packages/coding-agent/test/unit/rename-symbol.test.ts
packages/coding-agent/test/unit/code-intel-descriptions.test.ts
Test Files: 2 passed
Tests: 12 passed
```

## Task 3: Verification And Commit

- [x] **Step 1: Run targeted Code Intel tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/find-references.test.ts packages/coding-agent/test/unit/call-graph.test.ts packages/code-intel/test/unit/symbol-graph.test.ts
```

Expected: pass.

Execution note: targeted Code Intel tests passed with 4 files and 39 tests:

```text
packages/coding-agent/test/unit/rename-symbol.test.ts
packages/coding-agent/test/unit/find-references.test.ts
packages/coding-agent/test/unit/call-graph.test.ts
packages/code-intel/test/unit/symbol-graph.test.ts
Test Files: 4 passed
Tests: 39 passed
```

- [x] **Step 2: Run repository verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
git status --short --branch
```

Expected: typecheck, lint, tests, and diff check pass. If `pnpm.cmd test` fails in sandbox with a fetch/network error, rerun the same command with escalation and record both outputs.

Execution notes:

- `.\node_modules\.bin\tsc.cmd -b`: passed.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: passed.
- `pnpm.cmd test` in sandbox: failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of the same `pnpm.cmd test`: passed with 194 test files (193 passed, 1 skipped) and 1154 tests (1150 passed, 4 skipped).
- `git diff --check`: clean.

- [ ] **Step 3: Commit and push**

Stage only the D48 files:

```powershell
git add docs/superpowers/plans/2026-06-10-d48-code-intel-rename-reference-safety.md packages/coding-agent/src/tools/rename-symbol.ts packages/coding-agent/test/unit/rename-symbol.test.ts
git commit -m "fix(D-48): expose rename reference safety metadata"
git push
```

Execution note before commit: include `packages/coding-agent/test/integration/runToolLoop-session-2c3.test.ts` in the D48 commit because Task 4 changed that file as the minimal full-suite live integration budget follow-up.

## Task 4: Full-Suite Live Integration Budget Follow-Up

During D48 verification, `pnpm.cmd test` in the sandbox failed with `[ERROR] fetch failed`, and the non-sandbox rerun exposed live integration non-determinism outside the D48 rename files:

- First rerun failed in `packages/coding-agent/test/repl/repl-close-during-turn.test.ts`; the file passed when rerun by itself.
- Second rerun failed in `packages/coding-agent/test/integration/runToolLoop-session-2c3.test.ts` with `ToolLoopLimitError: Tool loop exceeded max steps (5)`.

Root-cause evidence: sibling long-running live tests already use a 10-step budget because the live LLM can retry denied bash command shapes before converging. `runToolLoop-session-2c3.test.ts` still uses `maxSteps: 5` in both turns.

- [x] **Step 1: Treat the full-suite failure as the RED case**

Evidence command:

```powershell
pnpm.cmd test
```

Observed failure:

```text
packages/coding-agent/test/integration/runToolLoop-session-2c3.test.ts
ToolLoopLimitError: Tool loop exceeded max steps (5)
```

- [x] **Step 2: Apply the minimal test-budget fix**

Modify `packages/coding-agent/test/integration/runToolLoop-session-2c3.test.ts`:

```ts
const result = await runToolLoop(client, baseMessages, {
  registry,
  maxSteps: 10,
});

const result3 = await runToolLoop(client, reloadedMessagesWithSystem, {
  registry,
  maxSteps: 10,
});
```

- [x] **Step 3: Rerun targeted integration and full verification**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/integration/runToolLoop-session-2c3.test.ts
pnpm.cmd test
```

Expected: targeted test passes; full test either passes or exposes a different independent live flake that must be investigated before any broad completion claim.

Execution notes:

- Targeted integration in sandbox failed with `EACCES` network access while calling `https://api.deepseek.com/anthropic/v1/messages`.
- Approved non-sandbox rerun of the same targeted integration passed with 1 file and 1 test.
- Full `pnpm.cmd test` in sandbox failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of the same full test passed with 194 files (193 passed, 1 skipped) and 1154 tests (1150 passed, 4 skipped).
