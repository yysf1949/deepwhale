# D70 Gate-1.5 Browser Decision Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Gate-1.5 Browser evidence so fixture dry-run results are advisory only, and keep the Browser roadmap branch deferred until real 20-task live browser evidence exists.

**Architecture:** Add a small report layer on top of the existing pure Gate-1.5 success-rate evaluator. The pure evaluator still maps success rates to algorithmic decisions, while the new report layer records evidence kind, binding status, and the actual roadmap branch decision. Public docs and scorecards then cite this machine-readable report instead of inferring Browser readiness from the fixture.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing `@deepwhale/coding-agent` Gate-1.5 script, Markdown/JSON evidence files.

---

## File Structure

- Modify `packages/coding-agent/src/browser/gate15.ts`: add the report contract, evidence-kind handling, binding flag, and branch decision mapping.
- Modify `packages/coding-agent/scripts/gate15-browser-viability.mjs`: write the richer report and Markdown interpretation.
- Modify `packages/coding-agent/test/unit/browser-gate15.test.ts`: RED/GREEN coverage for advisory fixture and binding live evidence.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require D70 status pointers and Gate-1.5 advisory wording.
- Regenerate `docs/superpowers/gate-1.5-browser-viability.{json,md}` from the fixture using the updated script.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: update current status from D69 to D70 and keep Browser deferred.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: record D70 evidence and move next actions to D71-D73.
- Create `docs/superpowers/plans/2026-06-10-d70-gate15-browser-decision-hygiene.md`: this plan.

## Task 1: RED Tests For Gate-1.5 Binding Semantics

**Files:**
- Modify: `packages/coding-agent/test/unit/browser-gate15.test.ts`

- [ ] **Step 1: Add report contract assertions**

Add these imports and tests:

```ts
import {
  buildBrowserGate15Report,
  evaluateBrowserGate15,
  type BrowserTask,
} from '../../src/browser/gate15.js';

it('keeps fixture dry-run evidence advisory even when the algorithmic decision is continue', () => {
  const report = buildBrowserGate15Report({
    tasks: makeBrowserTasks(16, 4),
    evidenceKind: 'fixture-dry-run',
  });

  expect(report.decision).toBe('continue');
  expect(report.successRate).toBe(0.8);
  expect(report.evidenceKind).toBe('fixture-dry-run');
  expect(report.binding).toBe(false);
  expect(report.branchDecision).toBe('defer-live-evidence');
  expect(report.requiredLiveTasks).toBe(20);
  expect(report.interpretation).toContain('advisory');
  expect(report.interpretation).toContain('20 live browser tasks');
});

it('allows binding Browser branch decisions only for live evidence with at least 20 tasks', () => {
  expect(
    buildBrowserGate15Report({
      tasks: makeBrowserTasks(16, 4),
      evidenceKind: 'live-browser',
    }).branchDecision,
  ).toBe('continue-browser-enhancement');

  expect(
    buildBrowserGate15Report({
      tasks: makeBrowserTasks(10, 10),
      evidenceKind: 'live-browser',
    }).branchDecision,
  ).toBe('freeze-browser-enhancement');

  expect(
    buildBrowserGate15Report({
      tasks: makeBrowserTasks(9, 11),
      evidenceKind: 'live-browser',
    }).branchDecision,
  ).toBe('minimal-browser-runtime');

  const undersized = buildBrowserGate15Report({
    tasks: makeBrowserTasks(10, 0),
    evidenceKind: 'live-browser',
  });
  expect(undersized.binding).toBe(false);
  expect(undersized.branchDecision).toBe('defer-live-evidence');
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-gate15.test.ts --reporter=verbose
```

Expected: FAIL because `buildBrowserGate15Report` does not exist yet.

## Task 2: GREEN Gate-1.5 Report Layer

**Files:**
- Modify: `packages/coding-agent/src/browser/gate15.ts`

- [ ] **Step 1: Add report types and implementation**

Implement:

```ts
export type BrowserGateEvidenceKind = 'fixture-dry-run' | 'live-browser';
export type BrowserGateBranchDecision =
  | 'continue-browser-enhancement'
  | 'freeze-browser-enhancement'
  | 'minimal-browser-runtime'
  | 'defer-live-evidence';

export interface BrowserGateReportInput {
  tasks: ReadonlyArray<BrowserTask>;
  evidenceKind: BrowserGateEvidenceKind;
  requiredLiveTasks?: number;
}

export interface BrowserGateReport extends BrowserGateResult {
  evidenceKind: BrowserGateEvidenceKind;
  requiredLiveTasks: number;
  binding: boolean;
  branchDecision: BrowserGateBranchDecision;
  interpretation: string;
}

export function buildBrowserGate15Report(input: BrowserGateReportInput): BrowserGateReport {
  const result = evaluateBrowserGate15(input.tasks);
  const requiredLiveTasks = input.requiredLiveTasks ?? 20;
  const total = result.successes + result.failures;
  const hasBindingEvidence = input.evidenceKind === 'live-browser' && total >= requiredLiveTasks;

  if (!hasBindingEvidence) {
    return {
      ...result,
      evidenceKind: input.evidenceKind,
      requiredLiveTasks,
      binding: false,
      branchDecision: 'defer-live-evidence',
      interpretation:
        input.evidenceKind === 'fixture-dry-run'
          ? 'Fixture dry-run result is advisory only; collect 20 live browser tasks before changing the Browser roadmap branch.'
          : `Live browser evidence has ${total} tasks; collect at least ${requiredLiveTasks} tasks before changing the Browser roadmap branch.`,
    };
  }

  const branchDecision = branchDecisionFor(result.decision);
  return {
    ...result,
    evidenceKind: input.evidenceKind,
    requiredLiveTasks,
    binding: true,
    branchDecision,
    interpretation: `Live browser evidence is binding for Gate-1.5 and maps to ${branchDecision}.`,
  };
}
```

Add a private helper:

```ts
function branchDecisionFor(decision: BrowserGateDecision): BrowserGateBranchDecision {
  if (decision === 'continue') return 'continue-browser-enhancement';
  if (decision === 'freeze-enhancement') return 'freeze-browser-enhancement';
  return 'minimal-browser-runtime';
}
```

- [ ] **Step 2: Run GREEN**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-gate15.test.ts --reporter=verbose
```

Expected: PASS.

## Task 3: Refresh Gate-1.5 Script Output

**Files:**
- Modify: `packages/coding-agent/scripts/gate15-browser-viability.mjs`
- Modify: `docs/superpowers/gate-1.5-browser-viability.json`
- Modify: `docs/superpowers/gate-1.5-browser-viability.md`

- [ ] **Step 1: Make the script write report fields**

Change the script so `parseArgs` accepts optional `--evidence-kind`, defaults it to `fixture-dry-run`, imports `buildBrowserGate15Report`, and writes:

```js
const evidenceKind = args['evidence-kind'] ?? 'fixture-dry-run';
const { buildBrowserGate15Report } = await importEvaluator();
const result = buildBrowserGate15Report({ tasks: data.tasks, evidenceKind });
```

Update Markdown to include:

```md
- **evidence kind**: `<kind>`
- **algorithmic decision**: `<decision>`
- **binding branch decision**: `<branchDecision>`
- **binding**: `<true|false>`
- **required live tasks**: 20

> Fixture dry-run result is advisory only; collect 20 live browser tasks before changing the Browser roadmap branch.
```

- [ ] **Step 2: Regenerate fixture report**

Run:

```bash
pnpm.cmd -F @deepwhale/coding-agent exec tsx scripts/gate15-browser-viability.mjs --fixture test/fixtures/browser-gate15/pass.json --json docs/superpowers/gate-1.5-browser-viability.json --md docs/superpowers/gate-1.5-browser-viability.md
```

Expected: exit 0 and output includes `decision=continue`, `branchDecision=defer-live-evidence`, and `binding=false`.

## Task 4: RED/GREEN Status Documentation

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Add RED status assertions**

Extend status hygiene tests to require:

```ts
expect(block).toContain('Current sprint: D70 Gate-1.5 evidence refresh and Browser branch decision');
expect(block).toContain('D70 Gate-1.5 Browser decision hygiene');
expect(block).toContain('Gate-1.5 evidence kind: fixture-dry-run');
expect(block).toContain('Gate-1.5 binding branch decision: defer-live-evidence');
expect(block).toContain('Next implementation slice: D71 Code Intel import/reference graph correctness');
expect(block).not.toMatch(/Current sprint: D69/i);
expect(block).not.toMatch(/Next implementation slice: D70/i);
```

Extend scorecard assertions to require:

```ts
expect(scorecard.nextActions).toContain(
  'D71: deepen Code Intel import/reference graph correctness without claiming IDE-grade semantics.',
);
expect(scorecard.nextActions).toContain(
  'D72: refresh release/version hygiene after the Gate-1.5 advisory decision.',
);
expect(scorecard.nextActions.join('\n')).not.toMatch(/^D70:/m);
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because public docs still point to D69/D70.

- [ ] **Step 3: Update docs**

For current-status blocks:

- Change current sprint to `D70 Gate-1.5 evidence refresh and Browser branch decision`.
- Add Gate-1.5 evidence lines from `docs/superpowers/gate-1.5-browser-viability.json`.
- Add completed slice `D70 Gate-1.5 Browser decision hygiene: refreshed fixture evidence is advisory only and keeps Browser branch decision deferred pending 20 live tasks.`
- Change next work to `Next implementation slice: D71 Code Intel import/reference graph correctness`.
- Keep default Browser not enabled.

For scorecard:

- Keep aggregate percent `48`.
- Keep v2.0 percent `40`.
- Add D70 evidence under v2.0.
- Keep blocker that live 20-task browser evidence is incomplete.
- Move next actions to D71-D73.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/coding-agent/test/unit/browser-gate15.test.ts --reporter=verbose
```

Expected: PASS.

## Task 5: Verification, Commit, And Push

**Files:**
- Stage only:
  - `README.md`
  - `ROADMAP.md`
  - `docs/ROADMAP_DECISIONS.md`
  - `docs/superpowers/gate-1.5-browser-viability.json`
  - `docs/superpowers/gate-1.5-browser-viability.md`
  - `docs/superpowers/v1-v4-evidence-scorecard.json`
  - `docs/superpowers/v1-v4-evidence-scorecard.md`
  - `docs/superpowers/plans/2026-06-10-d70-gate15-browser-decision-hygiene.md`
  - `packages/coding-agent/src/browser/gate15.ts`
  - `packages/coding-agent/scripts/gate15-browser-viability.mjs`
  - `packages/coding-agent/test/unit/browser-gate15.test.ts`
  - `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Run broad verification**

Run:

```bash
pnpm.cmd exec tsc -b
pnpm.cmd exec eslint . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
pnpm.cmd build
```

Expected: all exit 0.

- [ ] **Step 2: Commit**

Run:

```bash
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1.5-browser-viability.json docs/superpowers/gate-1.5-browser-viability.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d70-gate15-browser-decision-hygiene.md packages/coding-agent/src/browser/gate15.ts packages/coding-agent/scripts/gate15-browser-viability.mjs packages/coding-agent/test/unit/browser-gate15.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts
git commit -m "docs(D-70): defer browser branch to live gate evidence"
```

- [ ] **Step 3: Push**

Run:

```bash
git push origin feature/d36-gate2-live
```

## Self-Review

- Spec coverage: D70 refreshes Gate-1.5 evidence semantics, documents Browser branch decision as deferred, and avoids default Browser exposure.
- Placeholder scan: no placeholders; commands, file paths, expected outputs, and status strings are explicit.
- Type consistency: report fields match JSON, Markdown, tests, and public status docs.
- Truthfulness: fixture dry-run can show algorithmic `continue`, but only live 20-task evidence can bind the Browser roadmap branch.
