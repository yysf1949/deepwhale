# D67 Rename Symbol Edit Hunks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen `rename_symbol` dry-run and apply safety by exposing per-file edit hunks, hashline edit-engine patches, and heuristic confidence metadata.

**Architecture:** Keep rename conservative and heuristic. Reuse `@deepwhale/edit-engine` through its public `createDefaultEngine()` and `EditIntent` interface to produce/apply line-hash anchored edits for changed lines, while preserving the existing reference scanner and write behavior.

**Tech Stack:** TypeScript, Vitest, `@deepwhale/code-intel`, `@deepwhale/edit-engine`, pnpm workspaces.

---

## File Structure

- Modify `packages/coding-agent/test/unit/rename-symbol.test.ts`: add D67 tests for per-line edit hunks, `confidence: "heuristic"`, and `editEngine: "hashline"` metadata.
- Modify `packages/coding-agent/src/tools/rename-symbol.ts`: route changed-line application/preview through the edit-engine interface and expose structured edit hunks.
- Create `docs/superpowers/plans/2026-06-10-d67-rename-symbol-edit-hunks.md`: this plan and execution notes.
- Optional update `docs/superpowers/v1-v4-evidence-scorecard.{json,md}` only if verification changes the score; D67 should not overclaim IDE-grade rename.

## Task 1: RED Test For Edit Hunks

**Files:**
- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`

- [ ] **Step 1: Add a failing test**

Add a test in the `rename_symbol conservative mode (D-33.2.2)` describe block:

```ts
it('dry-run reports hashline edit hunks and heuristic confidence metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rename-sym-d67-hunks-'));
  try {
    writeFileSync(
      join(dir, 'provider.ts'),
      [
        'export function target() {',
        '  return target();',
        '}',
        'function helper() {',
        '  return 1;',
        '}',
        '',
      ].join('\n'),
    );

    const result = await tool.execute({
      path: dir,
      oldName: 'target',
      newName: 'renamedTarget',
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Confidence: heuristic');
    expect(result.content).toContain('@@');
    expect(result.meta).toMatchObject({
      heuristic: true,
      confidence: 'heuristic',
      editEngine: 'hashline',
      dryRun: true,
    });
    expect(result.meta?.editHunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'provider.ts',
          line: 1,
          kind: 'declaration',
          engine: 'hashline',
          confidence: 'heuristic',
          oldText: 'export function target() {',
          newText: 'export function renamedTarget() {',
        }),
        expect.objectContaining({
          file: 'provider.ts',
          line: 2,
          oldText: '  return target();',
          newText: '  return renamedTarget();',
        }),
      ]),
    );
    expect(readFileSync(join(dir, 'provider.ts'), 'utf8')).toContain('export function target()');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/rename-symbol.test.ts --reporter=verbose
```

Expected: FAIL because `meta.editHunks`, `confidence`, and `editEngine` do not exist yet.

## Task 2: Implement Hashline Hunk Preview And Apply

**Files:**
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`

- [ ] **Step 1: Import edit-engine public API**

Use:

```ts
import { createDefaultEngine, computeLineHashes, type EditIntent } from '@deepwhale/edit-engine';
```

- [ ] **Step 2: Replace ad-hoc diff previews with structured hunk planning**

Add a `RenameEditHunk` interface with:

```ts
interface RenameEditHunk {
  file: string;
  line: number;
  kind: Reference['kind'] | 'textual';
  engine: string;
  confidence: 'heuristic';
  oldText: string;
  newText: string;
  patch: string;
}
```

- [ ] **Step 3: Build edit hunks from line changes**

After `rewriteReferences()` and optional textual fallback produce `rewritten`, compare original lines to rewritten lines. For each changed line, create an `EditIntent` anchored with `computeLineHashes(original)[line - 1]`, format it through `createDefaultEngine()`, and store the patch in the hunk.

- [ ] **Step 4: Apply through edit-engine in order**

For `apply=true`, apply each hunk patch through the same edit engine against the current file text. If any hunk fails, return `success: false` with a clear `rename_symbol error: edit-engine ...` message and do not write the partial file.

- [ ] **Step 5: Preserve existing behavior**

Keep existing ambiguous symbol behavior, skipped reference metadata, dry-run no-write semantics, textual fallback flag behavior, and `heuristic: true`.

## Task 3: GREEN And Verification

**Files:**
- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`

- [ ] **Step 1: Run focused GREEN**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/rename-symbol.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 2: Run related Code Intel checks**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/find-references.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 3: Run broad verification**

Run:

```bash
pnpm.cmd exec tsc -b
pnpm.cmd exec eslint . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
```

Expected: all exit 0. If sandboxed `pnpm.cmd exec` fails with `[ERROR] fetch failed`, rerun with approved escalation and record the reason.

## Task 4: Commit And Push

**Files:**
- Stage only:
  - `packages/coding-agent/src/tools/rename-symbol.ts`
  - `packages/coding-agent/test/unit/rename-symbol.test.ts`
  - `docs/superpowers/plans/2026-06-10-d67-rename-symbol-edit-hunks.md`

- [ ] **Step 1: Commit**

```bash
git add packages/coding-agent/src/tools/rename-symbol.ts packages/coding-agent/test/unit/rename-symbol.test.ts docs/superpowers/plans/2026-06-10-d67-rename-symbol-edit-hunks.md
git commit -m "fix(D-67): expose rename edit hunks"
```

- [ ] **Step 2: Push**

```bash
git push origin feature/d36-gate2-live
```

## Self-Review

- Spec coverage: moves v1.5 Code Intel closer to the master plan by giving `rename_symbol` structured dry-run hunks and edit-engine anchored application.
- Placeholder scan: no placeholders; every command and touched file is explicit.
- Type consistency: uses existing edit-engine public exports and existing `ToolResult.meta` flexibility.
- Truthfulness: still reports `heuristic` confidence and does not claim IDE-grade rename.

## Execution Notes

- RED existed before implementation: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/rename-symbol.test.ts --reporter=verbose` failed on missing `Confidence: heuristic` / edit-hunk metadata.
- Implementation: `rename_symbol` now builds per-line hashline edit hunks from changed reference/textual lines, exposes `confidence: "heuristic"`, `editEngine: "hashline"`, and applies hunks through `@deepwhale/edit-engine` for `apply=true`.
- Focused GREEN: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/rename-symbol.test.ts --reporter=verbose` passed: 1 test file, 15 tests.
- Related Code Intel checks: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/find-references.test.ts packages/coding-agent/test/unit/code-intel-descriptions.test.ts --reporter=verbose` passed: 3 test files, 23 tests.
- Broad verification:
  - `pnpm.cmd exec tsc -b`: exit 0.
  - `pnpm.cmd exec eslint . --max-warnings 0`: exit 0.
  - `git diff --check`: clean.
  - `pnpm.cmd test -- --reporter=verbose`: passed; 197 test files total, 196 passed, 1 skipped; 1193 tests total, 1189 passed, 4 skipped.
- Environment note: sandboxed `pnpm.cmd exec ...` / `pnpm.cmd test ...` hit `[ERROR] fetch failed`; commands were rerun with approved escalation for verification.
- Scope note: no v1-v4 scorecard percentage changed; D67 improves v1.5 Code Intel rename safety/evidence but remains heuristic and does not claim IDE-grade rename.
