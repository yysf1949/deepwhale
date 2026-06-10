# D66 Status Gate1 V1V4 Rescore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align current status docs after D63-D65, harden Gate-1 preferred blocker wording, and publish an evidence-backed v1-v4 scorecard without expanding the default tool surface.

**Architecture:** Keep this sprint as stabilization and evidence hygiene only. Tests guard the public current-status blocks, the machine-readable Gate-1 preferred inventory, and the new scorecard so future agents cannot mistake fixture/module evidence for production completion.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, Markdown/JSON evidence files, existing `@deepwhale/code-intel` Gate-1 target inventory, existing `@deepwhale/coding-agent` status hygiene tests.

---

## File Structure

- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: update status drift assertions and add scorecard alignment assertions.
- Modify `packages/code-intel/test/unit/gate1-targets.test.ts`: require blocker text to include the best available LOC and preferred threshold, and require Markdown to state inventory is not a Gate-1 scenario pass.
- Modify `packages/code-intel/src/gate1-targets.ts`: make blocker wording threshold-aware instead of hardcoding `100K+` in generic inventory output.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: update only the current-status blocks to D66 and D63-D65 reality.
- Create `docs/superpowers/v1-v4-evidence-scorecard.json`: machine-readable milestone percentages and blockers.
- Create `docs/superpowers/v1-v4-evidence-scorecard.md`: human-readable scorecard with the same caveats.
- Update `docs/superpowers/gate-1-preferred-targets.json` and `.md`: regenerate from real local `.gate-targets` after blocker wording changes.

## Task 1: Status Hygiene Guard

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`

- [ ] **Step 1: Write the failing status drift test**

Replace the stale D62/D63 pointer test with assertions like:

```ts
expect(block).toContain('Current sprint: D66 status, Gate-1 blocker, and v1-v4 rescore');
expect(block).toContain('D63 Code Intel heuristic metadata');
expect(block).toContain('D64 registry opt-in loading isolation');
expect(block).toContain('D65 Code Intel truthfulness metadata');
expect(block).toContain('Next implementation slice: D67 Gate-1 preferred 100K target or stronger Code Intel rename safety');
expect(block).not.toMatch(/Current sprint: D62/i);
expect(block).not.toMatch(/Next implementation slice: D63/i);
```

- [ ] **Step 2: Run the focused RED command**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because the docs still mention D62/D63.

- [ ] **Step 3: Update current-status blocks only**

Edit the current-status blocks in the three public docs so they name D66 as current, D63-D65 as completed, and D67 as the next implementation slice.

- [ ] **Step 4: Run the focused GREEN command**

Run the same command. Expected: PASS.

## Task 2: Gate-1 Preferred Blocker Hygiene

**Files:**
- Modify: `packages/code-intel/test/unit/gate1-targets.test.ts`
- Modify: `packages/code-intel/src/gate1-targets.ts`
- Update: `docs/superpowers/gate-1-preferred-targets.json`
- Update: `docs/superpowers/gate-1-preferred-targets.md`

- [ ] **Step 1: Write the failing blocker test**

Tighten the minimum-only assertion:

```ts
expect(report.blocker).toContain('best local target is vite with 12 LOC');
expect(report.blocker).toContain('below preferred 20 LOC');
expect(report.blocker).not.toContain('100K+');
const md = renderGate1TargetInventoryMarkdown(report);
expect(md).toContain('This inventory does not itself prove Gate-1 pass on a target');
expect(md).toContain('Preferred targets: 0');
```

- [ ] **Step 2: Run the focused RED command**

Run:

```bash
pnpm.cmd exec vitest run packages/code-intel/test/unit/gate1-targets.test.ts --reporter=verbose
```

Expected: FAIL because the generic blocker still says `100K+`.

- [ ] **Step 3: Implement threshold-aware blocker wording**

Change `blockerForStatus()` so it says `preferred ${preferredLoc} LOC` and includes best target LOC. Keep the real 100K status visible through `preferredLoc: 100000` and the public docs' `preferred-100k` wording.

- [ ] **Step 4: Regenerate real Gate-1 preferred inventory**

Run:

```bash
pnpm.cmd -F @deepwhale/code-intel exec tsx scripts/gate1-target-inventory.mjs
```

Expected: status remains `minimum-only`; best local target remains Vite at 86,216 LOC.

- [ ] **Step 5: Run the focused GREEN command**

Run the same focused test. Expected: PASS.

## Task 3: V1-V4 Evidence Scorecard

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Create: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Create: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`

- [ ] **Step 1: Write the failing scorecard test**

Add assertions that the JSON scorecard exists, has six milestones, carries `aggregatePercent: 48`, and repeats the Gate caveats:

```ts
const scorecard = JSON.parse(readRepoFile('docs/superpowers/v1-v4-evidence-scorecard.json')) as {
  aggregatePercent: number;
  milestones: Array<{ id: string; percent: number; status: string }>;
  caveats: string[];
};

expect(scorecard.aggregatePercent).toBe(48);
expect(scorecard.milestones.map((m) => m.id)).toEqual(['v1.0', 'v1.5', 'v2.0', 'v2.5', 'v3.0', 'v4.0']);
expect(scorecard.caveats).toContain('Gate-2 default-profile fixture pass is not v1-v4 production completion.');
expect(scorecard.caveats).toContain('Gate-1 minimum-50k evidence is not preferred-100k evidence.');
```

- [ ] **Step 2: Run the focused RED command**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because the scorecard files do not exist.

- [ ] **Step 3: Create scorecard JSON and Markdown**

Use evidence from the current files:

```json
{
  "aggregatePercent": 48,
  "milestones": [
    { "id": "v1.0", "percent": 70, "status": "mostly implemented coding baseline; release/version hygiene remains noisy" },
    { "id": "v1.5", "percent": 65, "status": "Code Intel foundation exists and is labeled heuristic; preferred 100K Gate-1 evidence is blocked" },
    { "id": "v2.0", "percent": 40, "status": "memory, Browser, and MCP foundations exist as opt-in or early pieces; Gate-1.5/live integration incomplete" },
    { "id": "v2.5", "percent": 40, "status": "planner/DAG/cache modules exist; main-loop integration remains limited" },
    { "id": "v3.0", "percent": 50, "status": "Reviewer and Gate-2 runner exist; current Gate-2 live fixture passes under default profile" },
    { "id": "v4.0", "percent": 25, "status": "Researcher, TaskGraph, memory, and channel foundations exist; Agent OS/Desktop/channels are not production-complete" }
  ]
}
```

- [ ] **Step 4: Link the scorecard in current-status blocks**

Add `Current v1-v4 scorecard: docs/superpowers/v1-v4-evidence-scorecard.json` to each current-status block.

- [ ] **Step 5: Run the focused GREEN command**

Run the same status hygiene test. Expected: PASS.

## Task 4: Verification And Commit

**Files:**
- All D66 files above.

- [ ] **Step 1: Run focused verification**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/code-intel/test/unit/gate1-targets.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 2: Run broader verification**

Run:

```bash
pnpm.cmd exec tsc -b
pnpm.cmd exec eslint . --max-warnings 0
git diff --check
```

Expected: all exit 0.

- [ ] **Step 3: Try full test suite**

Run:

```bash
pnpm.cmd test -- --reporter=verbose
```

Expected: exit 0. If the sandbox reports network `fetch failed` or Vitest hangs, use systematic debugging to capture the exact blocker and rerun with approved escalation when required.

- [ ] **Step 4: Commit and push**

Run narrow staging only:

```bash
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1-preferred-targets.json docs/superpowers/gate-1-preferred-targets.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d66-status-gate1-v1v4-rescore.md packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/code-intel/src/gate1-targets.ts packages/code-intel/test/unit/gate1-targets.test.ts
git commit -m "fix(D-66): align status and gate evidence"
git push origin feature/d36-gate2-live
```

Expected: commit and push succeed.

## Self-Review

- Spec coverage: covers status drift, Gate-1 preferred blocker, v1-v4 progress scoring, no default tool expansion, verification, commit, and push.
- Placeholder scan: no placeholder tasks are left; every implementation task names files, commands, and expected results.
- Type consistency: tests use existing helper functions and existing evidence file paths.

## Execution Notes

- RED status hygiene check: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose` failed as expected because public docs still said `Current sprint: D62` and the scorecard files did not exist.
- RED Gate-1 target check: `pnpm.cmd exec vitest run packages/code-intel/test/unit/gate1-targets.test.ts --reporter=verbose` failed as expected because blocker wording still hardcoded `100K+` and omitted the `LOC` unit in the preferred threshold.
- GREEN focused check: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/code-intel/test/unit/gate1-targets.test.ts --reporter=verbose` passed with 2 files and 8 tests.
- TypeScript check: `pnpm.cmd exec tsc -b` exited 0.
- Lint check: `pnpm.cmd exec eslint . --max-warnings 0` exited 0.
- Whitespace check: `git diff --check` exited 0.
- Full suite: `pnpm.cmd test -- --reporter=verbose` passed with 197 test files total, 196 passed, 1 skipped; 1192 tests total, 1188 passed, 4 skipped.
- Sandbox note: sandboxed `pnpm.cmd exec` hit `[ERROR] fetch failed` before tests ran; the same focused and full commands were rerun with approved escalation and completed normally.
