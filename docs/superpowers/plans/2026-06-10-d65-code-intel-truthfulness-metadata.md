# D65 Code Intel Truthfulness Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make heuristic Code Intel tool outputs machine-readable so agents cannot mistake search, reference, call graph, or rename results for IDE-grade truth.

**Architecture:** Keep AST parsing and symbol extraction behavior unchanged. Add or tighten `meta.heuristic: true` on the heuristic Code Intel tool success paths: `smart_search`, `rename_symbol`, `find_references`, and `call_graph`. Existing descriptions already say heuristic; this sprint makes the same boundary visible to programmatic callers.

**Tech Stack:** TypeScript, Vitest, existing `ToolResult.meta` records, existing Code Intel tools.

---

## Files

- Modify: `packages/coding-agent/src/tools/smart-search.ts`
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`
- Modify: `packages/coding-agent/test/unit/smart-search-semantic.test.ts`
- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`
- Create: `docs/superpowers/plans/2026-06-10-d65-code-intel-truthfulness-metadata.md`

## Task 1: RED Tests For Missing Machine-Readable Heuristic Metadata

- [x] Add a test to `packages/coding-agent/test/unit/smart-search-semantic.test.ts`:

```ts
it('marks successful local results as heuristic in metadata', async () => {
  const tool = new SmartSearchTool();
  const result = await tool.execute({
    action: 'local',
    query: 'Greeter',
    path: resolve(process.cwd(), 'packages/code-intel/test/fixtures'),
  });

  expect(result.success).toBe(true);
  expect(result.meta).toMatchObject({ heuristic: true });
});
```

- [x] Add `resolve` from `node:path` to that test file.
- [x] Add a test to `packages/coding-agent/test/unit/rename-symbol.test.ts` in the existing `rename_symbol (D-32.2.4)` block:

```ts
it('marks no-op success results as heuristic metadata', async () => {
  const r = await tool.execute({ oldName: 'foo', newName: 'foo', path: tmpDir });
  expect(r.success).toBe(true);
  expect(r.meta).toMatchObject({ heuristic: true });
});
```

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\smart-search-semantic.test.ts packages\coding-agent\test\unit\rename-symbol.test.ts
```

- [x] Expected RED: both new assertions fail because `smart_search` success meta and rename no-op success meta do not include `heuristic: true`.

Execution note: RED was observed. `smart_search` success meta lacked `heuristic: true`, and `rename_symbol` oldName==newName no-op meta was only `{ changes: 0 }`.

## Task 2: Implement Minimal Metadata Fix

- [x] In `packages/coding-agent/src/tools/smart-search.ts`, add `heuristic: true` to the success `meta` object returned by `SmartSearchTool.execute()`.
- [x] In `packages/coding-agent/src/tools/rename-symbol.ts`, add `heuristic: true` and `dryRun: true` to the oldName==newName no-op success `meta`.
- [x] Do not change search behavior, rename behavior, registry profiles, or Gate thresholds.

Execution note: GREEN was observed with:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\smart-search-semantic.test.ts packages\coding-agent\test\unit\rename-symbol.test.ts
```

Result: 2 test files passed, 16 tests passed.

## Task 3: Verify And Commit

- [x] Run the focused D65 tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\smart-search-semantic.test.ts packages\coding-agent\test\unit\rename-symbol.test.ts packages\coding-agent\test\unit\find-references.test.ts packages\coding-agent\test\unit\call-graph.test.ts packages\coding-agent\test\unit\code-intel-descriptions.test.ts
```

- [x] Run `.\node_modules\.bin\tsc.cmd -b`.
- [x] Run `.\node_modules\.bin\eslint.cmd . --max-warnings 0`.
- [x] Run `git diff --check`.
- [x] Run `pnpm.cmd test -- --reporter=verbose`; if sandbox reports `fetch failed`, rerun the same command with escalation and record both outcomes.
- [ ] Stage only D65 files.
- [ ] Commit:

```powershell
git commit -m "fix(D-65): expose heuristic code intel metadata"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```

Verification evidence:

- Focused D65 suite: 5 test files passed, 31 tests passed.
- `.\node_modules\.bin\tsc.cmd -b`: exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: exit 0.
- `git diff --check`: exit 0.
- `pnpm.cmd test -- --reporter=verbose` in sandbox: failed with `[ERROR] fetch failed`.
- Escalated same command: exit 0, 197 test files total, 196 passed, 1 skipped; 1191 tests total, 1187 passed, 4 skipped.
