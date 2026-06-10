# D73 Gate-1.5 Live Browser Task Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit machine-readable live Browser task evidence status so Gate-1.5 remains deferred until 20 live tasks exist.

**Architecture:** Create a D73 live-task ledger under `docs/superpowers/`, then update the public status blocks and v1-v4 scorecard to cite it. The ledger must not change Browser defaults or unlock Browser enhancement work; it records that zero live tasks are available in the current repository state.

**Tech Stack:** Markdown, JSON, Vitest status-doc hygiene test, pnpm workspace verification commands.

---

## File Structure

- Create `docs/superpowers/gate-1.5-live-browser-tasks.json`: machine-readable D73 live task ledger and deferral decision.
- Create `docs/superpowers/gate-1.5-live-browser-tasks.md`: human-readable companion report.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require the D73 ledger fields, D73 current sprint, D74 next slice, and scorecard nextActions after D73.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: add live ledger pointer, completed D73 slice, and next work D74.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: record explicit D73 live-task deferral while keeping v2.0 incomplete.

## Task 1: RED Status Test

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Add live-task ledger assertions**

Add a new test after `keeps release/version claims quarantined by a machine-readable hygiene report`:

```ts
  it('keeps Gate-1.5 live Browser task evidence deferred until 20 live tasks exist', () => {
    const ledger = JSON.parse(readRepoFile('docs/superpowers/gate-1.5-live-browser-tasks.json')) as {
      evidenceKind: string;
      status: string;
      requiredTasks: number;
      completedTasks: number;
      successes: number;
      failures: number;
      successRate: number | null;
      binding: boolean;
      branchDecision: string;
      browserEnhancementUnlocked: boolean;
      reason: string;
      fixtureReport: string;
    };
    const ledgerMd = readRepoFile('docs/superpowers/gate-1.5-live-browser-tasks.md');

    expect(ledger.evidenceKind).toBe('live-browser-task-ledger');
    expect(ledger.status).toBe('deferred');
    expect(ledger.requiredTasks).toBe(20);
    expect(ledger.completedTasks).toBe(0);
    expect(ledger.successes).toBe(0);
    expect(ledger.failures).toBe(0);
    expect(ledger.successRate).toBeNull();
    expect(ledger.binding).toBe(false);
    expect(ledger.branchDecision).toBe('defer-live-evidence');
    expect(ledger.browserEnhancementUnlocked).toBe(false);
    expect(ledger.reason).toContain('No 20-task live browser evidence has been collected');
    expect(ledger.fixtureReport).toBe('docs/superpowers/gate-1.5-browser-viability.json');
    expect(ledgerMd).toContain('Live Browser Task Evidence Deferred');

    for (const path of DOCS) {
      const block = currentStatusBlock(readRepoFile(path));
      expect(block).toContain('Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json');
      expect(block).toContain('Gate-1.5 live tasks: 0/20; binding=false; Browser enhancement unlocked=false.');
    }
  });
```

- [ ] **Step 2: Advance scorecard nextActions**

In the scorecard test:

```ts
expect(scorecard.nextActions).toContain(
  'D74: continue Code Intel correctness hardening only where tests prove specific behavior.',
);
expect(scorecard.nextActions).toContain(
  'D75: tighten planner, reviewer, memory, and main-loop integration evidence without expanding default tools.',
);
expect(scorecard.nextActions).toContain(
  'D76: collect real Gate-1.5 Browser task runs only after opt-in Browser task sourcing is available.',
);
expect(scorecard.nextActions.join('\n')).not.toMatch(/^D73:/m);
```

- [ ] **Step 3: Advance current sprint assertions from D72 to D73**

In the final status test:

```ts
expect(block).toContain('Current sprint: D73 Gate-1.5 live browser task decision');
expect(block).toContain('D73 Gate-1.5 live browser task ledger');
expect(block).toContain('Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json');
expect(block).toContain('Next implementation slice: D74 Code Intel correctness hardening');
expect(block).not.toMatch(/Current sprint: D72/i);
expect(block).not.toMatch(/Next implementation slice: D73/i);
```

- [ ] **Step 4: Run focused RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because `docs/superpowers/gate-1.5-live-browser-tasks.json` does not exist and status docs still point at D72/D73.

## Task 2: Live Task Ledger

**Files:**
- Create: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Create: `docs/superpowers/gate-1.5-live-browser-tasks.md`

- [ ] **Step 1: Create JSON ledger**

Create `docs/superpowers/gate-1.5-live-browser-tasks.json` with:

```json
{
  "generatedAt": "2026-06-10T00:00:00.000Z",
  "slice": "D73",
  "branch": "feature/d36-gate2-live",
  "evidenceKind": "live-browser-task-ledger",
  "status": "deferred",
  "requiredTasks": 20,
  "completedTasks": 0,
  "successes": 0,
  "failures": 0,
  "successRate": null,
  "binding": false,
  "branchDecision": "defer-live-evidence",
  "browserEnhancementUnlocked": false,
  "reason": "No 20-task live browser evidence has been collected in this repository state.",
  "fixtureReport": "docs/superpowers/gate-1.5-browser-viability.json",
  "constraints": [
    "Fixture dry-run evidence remains advisory only.",
    "A binding Browser branch decision requires 20 live browser tasks.",
    "Browser enhancement work stays locked until live evidence is available.",
    "Browser remains opt-in and not default-enabled."
  ],
  "nextAction": "D74: continue Code Intel correctness hardening only where tests prove specific behavior."
}
```

- [ ] **Step 2: Create Markdown companion**

Create `docs/superpowers/gate-1.5-live-browser-tasks.md` with:

```md
# Gate-1.5 Live Browser Tasks

Generated: 2026-06-10

## Live Browser Task Evidence Deferred

- Required live tasks: 20
- Completed live tasks: 0
- Successes: 0
- Failures: 0
- Success rate: not available
- Binding decision: false
- Branch decision: defer-live-evidence
- Browser enhancement unlocked: false

No 20-task live browser evidence has been collected in this repository state. The fixture report remains useful as advisory dry-run evidence only: `docs/superpowers/gate-1.5-browser-viability.json`.

## Constraints

- Fixture dry-run evidence remains advisory only.
- A binding Browser branch decision requires 20 live browser tasks.
- Browser enhancement work stays locked until live evidence is available.
- Browser remains opt-in and not default-enabled.
```

## Task 3: Docs And Scorecard

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update public current-status blocks**

In all three public docs:

- Change current sprint to `D73 Gate-1.5 live browser task decision`.
- Add `- Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json` near the existing Gate-1.5 fixture report line.
- Add `- Gate-1.5 live tasks: 0/20; binding=false; Browser enhancement unlocked=false.`
- Add completed slice `D73 Gate-1.5 live browser task ledger: no 20-task live evidence exists, so Browser branch decision remains deferred and enhancement stays locked.`
- Change next implementation slice to `D74 Code Intel correctness hardening`.

In README only:

- Add `D73 plan: docs/superpowers/plans/2026-06-10-d73-gate15-live-browser-task-decision.md`.
- Add `Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json`.
- Change `Last status hygiene sprint: D72.` to `Last status hygiene sprint: D73.`

- [ ] **Step 2: Update scorecard**

Keep aggregate `48%` and v2.0 `40%`.

Add v2.0 evidence:

```json
"D73 live Browser task ledger records 0/20 live tasks and binding=false"
```

Change or keep v2.0 blockers to include:

```json
"Gate-1.5 live 20-task browser evidence is not complete"
```

Change next actions to:

```json
[
  "D74: continue Code Intel correctness hardening only where tests prove specific behavior.",
  "D75: tighten planner, reviewer, memory, and main-loop integration evidence without expanding default tools.",
  "D76: collect real Gate-1.5 Browser task runs only after opt-in Browser task sourcing is available."
]
```

Mirror those updates in the Markdown scorecard.

- [ ] **Step 3: Run focused GREEN**

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

- [ ] **Step 2: Stage D73 files only**

Run:

```powershell
git add packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/gate-1.5-live-browser-tasks.json docs/superpowers/gate-1.5-live-browser-tasks.md docs/superpowers/plans/2026-06-10-d73-gate15-live-browser-task-decision.md
```

Expected: unrelated untracked plan files remain unstaged.

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "docs(D-73): defer live browser task branch decision"
git push
```

Expected: commit and push succeed on `feature/d36-gate2-live`.

---

## Self-Review

- Spec coverage: D73 explicitly records the missing live Browser evidence and keeps Gate-1.5 non-binding.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: New JSON fields match the status-doc hygiene test.
- Scope guard: No Browser default enablement, no Browser enhancement unlock, no v1-v4 completion claim, and no package release claim.
