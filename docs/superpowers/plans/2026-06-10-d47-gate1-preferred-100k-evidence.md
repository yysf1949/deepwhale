# D47 Gate1 Preferred 100K Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce honest Gate-1 preferred 100K evidence, or a machine-readable blocker proving no local 100K target is available.

**Architecture:** Add a small reusable target-inventory layer to `@deepwhale/code-intel` so Gate-1 target availability is measured instead of inferred. Then refresh the existing Vite Gate-1 minimum evidence and persist a D47 preferred-target status report that cannot be mistaken for a preferred pass.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, `tsx`, `@deepwhale/code-intel`, Superpowers TDD and verification workflow.

---

## Files

- Create: `packages/code-intel/src/gate1-targets.ts`
  - Inventory immediate child directories under `.gate-targets`.
  - Count supported-language LOC with the same Gate-1 LOC counter.
  - Classify each target as `below-minimum`, `minimum-50k`, or `preferred-100k`.
  - Render a Markdown report with an explicit blocker when no preferred target exists.
- Modify: `packages/code-intel/src/gate1.ts`
  - Export `countSupportedLoc()` and `Gate1LocStats` so target inventory does not duplicate LOC logic.
- Modify: `packages/code-intel/src/index.ts`
  - Export the new target inventory API.
- Create: `packages/code-intel/scripts/gate1-target-inventory.mjs`
  - CLI that writes `docs/superpowers/gate-1-preferred-targets.{json,md}`.
- Create: `packages/code-intel/test/unit/gate1-targets.test.ts`
  - TDD tests for minimum-only and preferred-available target inventories.
- Modify: `docs/superpowers/gate-1-vite-result.{json,md}`
  - Fresh Vite Gate-1 run. It may pass only as `minimum-50k`.
- Create: `docs/superpowers/gate-1-preferred-targets.{json,md}`
  - D47 machine-readable and human-readable target availability report.
- Modify: `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md`
  - Add D47 note: preferred 100K remains blocked unless a 100K local target is present.
- Potentially modify: `README.md`
  - Add a concise D47 status note only after evidence is generated.

## Task 1: Target Inventory API

- [x] Write failing tests in `packages/code-intel/test/unit/gate1-targets.test.ts`.

```ts
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inventoryGate1Targets, renderGate1TargetInventoryMarkdown } from '../../src/gate1-targets.js';

describe('Gate-1 target inventory', () => {
  it('reports minimum-only when no local target reaches preferred LOC', async () => {
    const root = await makeTargetsRoot({ vite: 12 });
    try {
      const report = await inventoryGate1Targets({ targetsRoot: root, minimumLoc: 10, preferredLoc: 20 });

      expect(report.status).toBe('minimum-only');
      expect(report.preferredTargets).toEqual([]);
      expect(report.bestAvailable?.name).toBe('vite');
      expect(report.blocker).toMatch(/no local 100K/);
      expect(renderGate1TargetInventoryMarkdown(report)).toContain('Status: minimum-only');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports preferred-available when a target reaches preferred LOC', async () => {
    const root = await makeTargetsRoot({ small: 12, large: 25 });
    try {
      const report = await inventoryGate1Targets({ targetsRoot: root, minimumLoc: 10, preferredLoc: 20 });

      expect(report.status).toBe('preferred-available');
      expect(report.preferredTargets.map((target) => target.name)).toEqual(['large']);
      expect(report.blocker).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
```

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1-targets.test.ts
```

Expected before implementation: fails because `../../src/gate1-targets.js` does not exist.

- [x] Export `countSupportedLoc()` from `packages/code-intel/src/gate1.ts`.
- [x] Implement `inventoryGate1Targets()` and `renderGate1TargetInventoryMarkdown()`.
- [x] Export the new API from `packages/code-intel/src/index.ts`.
- [x] Rerun the same test and confirm it passes.

Execution notes:
- RED: `vitest.cmd run packages/code-intel/test/unit/gate1-targets.test.ts` failed because `../../src/gate1-targets.js` did not exist.
- GREEN: the same command passed with 1 file and 3 tests.

## Task 2: Inventory CLI

- [x] Create `packages/code-intel/scripts/gate1-target-inventory.mjs`.
- [x] Run:

```powershell
.\node_modules\.bin\tsx.cmd packages/code-intel/scripts/gate1-target-inventory.mjs --targets-root .gate-targets --json docs/superpowers/gate-1-preferred-targets.json --md docs/superpowers/gate-1-preferred-targets.md
```

Expected in the current workspace: exit `0`, report status `minimum-only`, best target `vite`, no preferred target.

Execution note: `pnpm -F @deepwhale/code-intel exec tsx ...` timed out locally before printing output. Direct `tsx.cmd` from the repo root completed in 1.4s and wrote the report, so the re-runnable D47 command uses direct `tsx.cmd`. The generated report has `status: "minimum-only"`, `preferredTargets: []`, and best target `vite` at 86,216 LOC.

## Task 3: Refresh Vite Gate-1 Evidence

- [x] Run the formal Vite Gate-1 command:

```powershell
pnpm -F @deepwhale/code-intel exec tsx scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --caller createServer --callee _createServer --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md
```

Expected: exit `0`, JSON has `"passed": true` and `"locQualification": "minimum-50k"`.

Execution note: direct `.\node_modules\.bin\tsx.cmd packages\code-intel\scripts\gate1-current-workspace.mjs ...` exited `0`; JSON has `passed: true`, `locQualification: "minimum-50k"`, and 86,216 LOC.

## Task 4: Documentation Hygiene

- [x] Update D41 progress plan and README with D47 status:
  - Vite remains a valid 50K minimum Gate-1 pass.
  - Preferred 100K Gate-1 evidence is blocked by missing local 100K target.
  - Do not upgrade v1.5 Code Intel maturity based on the Vite run alone.

## Task 5: Verification, Commit, Push

- [x] Run targeted tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages/code-intel/test/unit/gate1-targets.test.ts packages/code-intel/test/unit/gate1.test.ts packages/code-intel/test/unit/gate1-shape.test.ts
```

- [x] Run static and full checks:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
```

If `pnpm.cmd test` fails in the sandbox with `fetch failed`, rerun the same command with approved non-sandbox execution and record both facts.

Execution notes:
- Targeted tests passed: 3 files, 13 tests.
- `tsc.cmd -b` passed after fixing a `Dirent[]` annotation in `gate1-targets.ts`.
- `eslint.cmd . --max-warnings 0` passed.
- `git diff --check` passed.
- `pnpm.cmd test` failed in sandbox with `[ERROR] fetch failed`; approved non-sandbox rerun passed with 194 files (193 passed, 1 skipped) and 1152 tests (1148 passed, 4 skipped).

- [ ] Stage only D47 files.
- [ ] Commit:

```powershell
git commit -m "test(D-47): record Gate-1 preferred target inventory"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- Do not claim `preferred-100k` unless `gate-1-preferred-targets.json` contains a preferred target and a separate Gate-1 run on that target passes.
- Do not download or fabricate a 100K repository in this slice.
- Do not alter Gate-1 thresholds to make Vite count as preferred.
- Do not change the default registry or unlock Browser/Desktop/Channel/media/productivity tools.
