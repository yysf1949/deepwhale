# D51 Smart Search Default Local-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the default Code Intel surface coding-local by preventing `smart_search` from invoking GitHub remote search unless the caller explicitly uses `action: "remote"`.

**Architecture:** Preserve the existing `smart_search` tool name so registry profiles and callers stay compatible. Change `action: "all"` from "local with remote fallback" to "local aggregate only" and leave `action: "remote"` as the explicit opt-in path. Update descriptions, tests, and execution notes so the default/code-intel profile no longer implies network/channel capability.

**Tech Stack:** TypeScript, Vitest, existing `SmartSearchTool`, PowerShell on Windows.

---

## Current Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked plan files.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or other non-coding tools to the default registry.
- Do not remove `smart_search` from the code-intel profile in this slice; only make its default/aggregate behavior local-only.
- Keep remote GitHub search available only through explicit `action: "remote"`.
- Use TDD: write failing tests, verify RED, implement, verify GREEN.

## Files

- Modify: `packages/coding-agent/test/unit/smart-search.test.ts`
  - Replace the old `all action falls back to remote` expectation with a local-only expectation.
  - Assert `meta.remoteCount === 0` and content says local-only when local has no result.
- Modify: `packages/coding-agent/src/tools/smart-search.ts`
  - Update comments and description to say `all` is local-only.
  - Prevent `action: "all"` from invoking `remoteSearch`.
  - Add `remoteEnabled` metadata so callers can see whether remote was allowed.
- Create: `docs/superpowers/plans/2026-06-10-d51-smart-search-default-local-only.md`

## Task 1: RED Tests For Local-Only `all`

- [x] **Step 1: Update the `all` action test**

Replace the existing `all action falls back to remote when local has 0 results` test in `packages/coding-agent/test/unit/smart-search.test.ts` with:

```ts
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
```

- [x] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/smart-search.test.ts
```

Expected before implementation: fail because `meta.remoteEnabled` is missing and the no-result content does not say local-only.

Execution note: RED verified. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/smart-search.test.ts` failed with 1 assertion failure because `all` no-result content did not contain `local-only`.

## Task 2: Implement Local-Only Aggregate Search

- [x] **Step 1: Update tool description and header comment**

Change `packages/coding-agent/src/tools/smart-search.ts` so the header says:

```ts
 *     all    — local aggregate search only; never invokes gh
```

Change the public description to:

```ts
readonly description = 'Heuristic code search with symbol-aware local matches. Remote GitHub search is explicit opt-in via action=remote; local/all results are not IDE-grade/type-aware. Low risk (read-only).';
```

- [x] **Step 2: Restrict remote search to explicit `remote`**

Change the remote execution condition to:

```ts
const remoteEnabled = action === 'remote';
if (remoteEnabled) {
  const remote = await remoteSearch(query, maxResults);
  results.push(...remote);
}
```

Keep local search for `action === 'local' || action === 'all'`.

- [x] **Step 3: Expose local-only metadata**

Update the result meta to include:

```ts
remoteEnabled,
```

- [x] **Step 4: Clarify no-result formatting**

Update `formatResults` signature to accept `remoteEnabled: boolean` and return:

```ts
const mode = remoteEnabled ? action : `${action} local-only`;
return `(no results for '${query}' in ${mode} search)`;
```

Pass `remoteEnabled` from `execute()`.

- [x] **Step 5: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/smart-search.test.ts packages/coding-agent/test/unit/smart-search-semantic.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts
```

Expected: pass.

Execution note: GREEN verified. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/smart-search.test.ts packages/coding-agent/test/unit/smart-search-semantic.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts` passed with 3 files and 8 tests.

## Task 3: Wider Verification

- [x] **Step 1: Run registry/profile related tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/smart-search.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts
```

Expected: pass. Registry counts should remain unchanged.

Execution note: Passed. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/smart-search.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-code-intel-foundation.test.ts` passed with 4 files and 17 tests.

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

- `.\node_modules\.bin\tsc.cmd -b`: passed.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: passed.
- `git diff --check`: clean.
- `pnpm.cmd test`: sandbox run failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of `pnpm.cmd test`: passed with 194 test files (193 passed, 1 skipped) and 1158 tests (1154 passed, 4 skipped).

## Task 4: Commit And Push

- [x] **Step 1: Update this plan with execution notes**

Record RED/GREEN and verification results in this file before committing.

- [ ] **Step 2: Stage only D51 files**

Run:

```powershell
git add docs/superpowers/plans/2026-06-10-d51-smart-search-default-local-only.md packages/coding-agent/src/tools/smart-search.ts packages/coding-agent/test/unit/smart-search.test.ts
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "fix(D-51): keep smart search default local-only"
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- This plan does not change registry profile counts.
- This plan does not remove the explicit remote action.
- This plan does not add any new network, Browser, productivity, media, channel, or marketplace capability.
- This plan makes default/code-intel `smart_search` safer by making `all` local-only.
