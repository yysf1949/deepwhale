# D55 Undefined State Path Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent DeepWhale runtime state from resolving under a literal `undefined/.deepwhale` directory and remove the existing generated residue from the repo root.

**Architecture:** Treat string values such as `undefined` and `null` from environment variables as unusable home paths, not as real directories. Route default persistent tool singletons through `deepwhaleRoot()` instead of ad hoc `process.env.HOME || process.env.USERPROFILE || '.'` path construction.

**Tech Stack:** TypeScript, Vitest, Node path/fs APIs, existing `packages/coding-agent/src/util/deepwhale-paths.ts` and tool singleton exports.

---

## Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*.md` files and `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md`.
- Do not add or default-enable Browser, Desktop, Channel, media, productivity, marketplace, or other non-coding tools.
- Do not change Gate-1 or Gate-2 pass thresholds.
- Use TDD for behavior changes.
- Do not use `git add .`.

## Files

- Modify: `packages/coding-agent/src/util/deepwhale-paths.ts`
- Modify: `packages/coding-agent/src/util/tui-history.ts`
- Modify: `packages/coding-agent/src/tools/blogwatcher.ts`
- Modify: `packages/coding-agent/src/tools/kanban-orchestrator.ts`
- Modify: `packages/coding-agent/src/tools/llm-wiki.ts`
- Modify: `packages/coding-agent/src/tools/webhook-subscriptions.ts`
- Modify: `packages/coding-agent/test/unit/deepwhale-paths.test.ts`
- Modify: `packages/coding-agent/test/util/tui-history.test.ts`
- Create: `packages/coding-agent/test/unit/default-persistent-paths.test.ts`
- Remove generated local state after verification: `undefined/.deepwhale/tui-history`

## Task 1: RED Tests For Literal Undefined Homes

- [x] Add failing tests to `deepwhale-paths.test.ts`:

```ts
it('rejects literal undefined/null env home values', () => {
  process.env.HOME = 'undefined';
  process.env.USERPROFILE = 'null';
  delete process.env.DEEPWHALE_HOME;
  const root = deepwhaleRoot().replaceAll('\\', '/');
  expect(root).not.toContain('/undefined/');
  expect(root).not.toContain('/null/');
  expect(root).not.toContain('undefined/.deepwhale');
  expect(root).toContain('/.deepwhale');
});
```

- [x] Add the same literal-env regression to `tui-history.test.ts` for `tuiHistoryPath()`.
- [x] Create `default-persistent-paths.test.ts` that imports the default persistent tool singletons after setting `HOME='undefined'` and `USERPROFILE='null'`, then asserts their internal configured paths do not contain `/undefined/`, `/null/`, or `undefined/.deepwhale`.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts packages/coding-agent/test/unit/default-persistent-paths.test.ts
```

Expected before implementation: at least the literal-env regression fails.

RED evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts packages/coding-agent/test/unit/default-persistent-paths.test.ts` failed as expected:
  - `deepwhaleRoot()` returned `undefined/.deepwhale`;
  - `tuiHistoryPath()` returned `undefined/.deepwhale/tui-history`;
  - default `blogwatcher.rootDir` was `undefined`.

## Task 2: Implement Path Hygiene

- [x] Add a small internal predicate in `deepwhale-paths.ts` that accepts only non-empty, non-`undefined`, non-`null` home path strings.
- [x] Use the same predicate behavior in `tui-history.ts`.
- [x] Change default persistent singleton exports to use `deepwhaleRoot()`:
  - `blogwatcher`: `rootDir: deepwhaleRoot()`
  - `kanban_orchestrator`: `boardDir: join(deepwhaleRoot(), 'kanban')`
  - `llm_wiki`: `dbPath: join(deepwhaleRoot(), 'wiki.db')`
  - `webhook_subscriptions`: `subsDir: join(deepwhaleRoot(), 'webhooks')`
- [x] Run the RED command again and confirm it passes.

GREEN evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts packages/coding-agent/test/unit/default-persistent-paths.test.ts` passed: 3 files, 26 tests.
- Registry research profile now constructs `blogwatcher` with `deepwhaleRoot()`, covered by `default-persistent-paths.test.ts`.

## Task 3: Remove Generated Residue

- [x] Verify `undefined/` is untracked:

```powershell
git status --short -- undefined
```

- [x] Verify the resolved path is inside `D:\App\openClaw\projects\deepwhale`.
- [x] Remove the generated `undefined/` directory.
- [x] Run:

```powershell
git status --short --branch
```

Expected: no `undefined/` untracked entry remains.

Cleanup evidence:

- `Resolve-Path -LiteralPath 'undefined'` was `D:\App\openClaw\projects\deepwhale\undefined` before removal.
- Removal used a guard requiring the target to equal `Join-Path $workspace 'undefined'`.
- `Test-Path -LiteralPath 'undefined'` returned `False`.

## Task 4: Verification

- [x] Run targeted tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts packages/coding-agent/test/unit/default-persistent-paths.test.ts packages/coding-agent/test/unit/blogwatcher.test.ts packages/coding-agent/test/unit/llm-wiki.test.ts packages/coding-agent/test/unit/kanban-orchestrator.test.ts packages/coding-agent/test/unit/webhook-subscriptions.test.ts
```

- [x] Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
pnpm.cmd test
```

If `pnpm.cmd test` fails in the sandbox with `[ERROR] fetch failed`, rerun the same command with approval and record both outcomes.

Targeted verification evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts packages/coding-agent/test/unit/default-persistent-paths.test.ts packages/coding-agent/test/unit/blogwatcher.test.ts packages/coding-agent/test/unit/llm-wiki.test.ts packages/coding-agent/test/unit/kanban-orchestrator.test.ts packages/coding-agent/test/unit/webhook-subscriptions.test.ts` passed: 7 files, 43 tests.
- `.\node_modules\.bin\tsc.cmd -b` passed with exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0` passed with exit 0.
- `git diff --check` passed with exit 0.
- Path fallback anti-pattern scan returned no matches:
  `rg -n "process\.env\.HOME \|\| process\.env\.USERPROFILE|process\.env\['HOME'\]\s*\|\||process\.env\['USERPROFILE'\]\s*\|\||rootDir: process\.env|boardDir: join\(process\.env|dbPath: join\(process\.env|subsDir: join\(process\.env" packages/coding-agent/src/tools packages/coding-agent/src/util`
- `pnpm.cmd test` in sandbox failed with `[ERROR] fetch failed`.
- `pnpm.cmd test` rerun outside sandbox passed: 195 test files, 194 passed / 1 skipped; 1165 tests, 1161 passed / 4 skipped.

## Task 5: Commit And Push

- [ ] Stage only D55 files.
- [ ] Commit:

```powershell
git commit -m "fix(D-55): prevent undefined runtime state paths"
```

- [ ] Push `feature/d36-gate2-live`.
