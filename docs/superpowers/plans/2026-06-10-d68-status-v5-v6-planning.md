# D68 Status V5 V6 Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align public status after D67, publish an evidence-caveated v5/v6 planning preview, and keep v1-v4 completion gated by current evidence.

**Architecture:** This is a stabilization/docs-and-tests sprint only. The status hygiene test guards README, ROADMAP, ROADMAP_DECISIONS, the v1-v4 scorecard, and the new v5/v6 preview so future agents cannot treat v5/v6 planning as permission to start new default tools or overclaim v1-v4 completion.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON evidence files, pnpm workspaces.

---

## File Structure

- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require D68 status pointers, D67 completed slice, D68 next implementation slice, and a machine-readable v5/v6 planning preview.
- Modify `README.md`: update the current-status block from D66/D67 to D68 and link the v5/v6 planning preview.
- Modify `ROADMAP.md`: update the current-status block and v5/v6 policy lines.
- Modify `docs/ROADMAP_DECISIONS.md`: update the current-status block and v5/v6 policy lines.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json`: keep aggregate percent at 48, update D67/D68 evidence and next actions.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.md`: mirror the JSON scorecard updates.
- Create `docs/superpowers/v5-v6-planning-preview.json`: machine-readable preview only, gated on v1-v4 evidence.
- Create `docs/superpowers/v5-v6-planning-preview.md`: human-readable preview only, no implementation claim.
- Create `docs/superpowers/plans/2026-06-10-d68-status-v5-v6-planning.md`: this plan and execution notes.

## Task 1: RED Status Hygiene Test

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Add failing assertions**

Update the status hygiene tests so they require:

```ts
expect(block).toContain('Current sprint: D68 post-D67 status and v5/v6 planning preview');
expect(block).toContain('D67 rename edit hunks');
expect(block).toContain('Next implementation slice: D69 Gate-1 preferred 100K evidence or explicit blocker refresh');
expect(block).toContain('v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json');
expect(block).not.toMatch(/Current sprint: D66/i);
expect(block).not.toMatch(/Next implementation slice: D67/i);
```

Add a new test that parses `docs/superpowers/v5-v6-planning-preview.json`:

```ts
it('keeps v5/v6 planning preview gated and machine-readable', () => {
  const preview = JSON.parse(readRepoFile('docs/superpowers/v5-v6-planning-preview.json')) as {
    status: string;
    gates: string[];
    phases: Array<{ id: string; implementationAllowed: boolean; themes: string[] }>;
  };
  const previewMd = readRepoFile('docs/superpowers/v5-v6-planning-preview.md');

  expect(preview.status).toBe('planning-preview-only');
  expect(preview.gates).toContain('v1-v4 evidence gaps must remain explicit before v5/v6 implementation starts');
  expect(preview.phases.map((phase) => phase.id)).toEqual(['v5.0', 'v6.0']);
  expect(preview.phases.every((phase) => phase.implementationAllowed === false)).toBe(true);
  expect(preview.phases[0]?.themes).toContain('production hardening');
  expect(preview.phases[1]?.themes).toContain('collaborative multi-agent operations');
  expect(previewMd).toContain('Planning preview only');
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL because D68 strings and v5/v6 preview files are not present yet.

## Task 2: Update Status Blocks And Scorecard

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update current-status blocks**

For each current-status block:

- Change `Current sprint` to `D68 post-D67 status and v5/v6 planning preview`.
- Add completed slice `D67 rename edit hunks: rename_symbol dry-run/apply now exposes hashline edit hunks and heuristic confidence metadata.`
- Change `Next implementation slice` to `D69 Gate-1 preferred 100K evidence or explicit blocker refresh`.
- Add reading guide line `v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json`.
- Preserve the policy that v5/v6 planning is allowed, but v1-v4 remains the active gate-driven objective.

- [ ] **Step 2: Update v1-v4 scorecard without changing aggregate percent**

Keep `aggregatePercent: 48`. Add D67 to v1.5 evidence and keep blocker text honest:

```json
"D67 rename_symbol exposes hashline edit hunks and heuristic confidence metadata"
```

Update `nextActions` to:

```json
[
  "D68: publish post-D67 status hygiene and v5/v6 planning preview without starting v5/v6 implementation.",
  "D69: obtain or prepare a real local 100K+ Gate-1 target and run the Gate-1 scenario, or keep the blocker explicit.",
  "D70: refresh Gate-1.5 evidence and decide whether Browser remains frozen, minimal, or eligible for continued opt-in work."
]
```

## Task 3: Add V5/V6 Planning Preview

**Files:**
- Create: `docs/superpowers/v5-v6-planning-preview.json`
- Create: `docs/superpowers/v5-v6-planning-preview.md`

- [ ] **Step 1: Create machine-readable preview**

Create JSON with:

```json
{
  "generatedAt": "2026-06-10T00:00:00.000Z",
  "status": "planning-preview-only",
  "implementationAllowed": false,
  "basis": {
    "v1v4Scorecard": "docs/superpowers/v1-v4-evidence-scorecard.json",
    "masterPlan": "docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md"
  },
  "gates": [
    "v1-v4 evidence gaps must remain explicit before v5/v6 implementation starts",
    "default registry must remain coding plus Code Intel essentials unless a later explicit release gate changes it",
    "Gate-1 preferred-100k, Gate-1.5, and production long-horizon evidence must not be inferred from fixture/module existence"
  ],
  "phases": [
    {
      "id": "v5.0",
      "name": "Production Hardening And Distribution",
      "implementationAllowed": false,
      "themes": [
        "production hardening",
        "plugin governance",
        "distribution and upgrade flow",
        "observability and auditability"
      ],
      "entryCriteria": [
        "v1-v4 scorecard has explicit evidence for remaining gate gaps",
        "Gate-1 preferred or blocker is freshly documented",
        "Gate-1.5 and Gate-2 interpretations remain honest"
      ]
    },
    {
      "id": "v6.0",
      "name": "Collaborative Agent Operations",
      "implementationAllowed": false,
      "themes": [
        "collaborative multi-agent operations",
        "enterprise controls",
        "hosted service mode",
        "ecosystem scaling"
      ],
      "entryCriteria": [
        "v5 production hardening has shipped with verification evidence",
        "multi-agent safety, audit, and rollback policies are tested",
        "hosted or enterprise surfaces have explicit opt-in and policy gates"
      ]
    }
  ]
}
```

- [ ] **Step 2: Create human-readable preview**

Create Markdown that states:

- `Planning preview only`
- v5/v6 implementation is not started.
- v1-v4 remains the active objective.
- v5 themes are production hardening, plugin governance, distribution, observability.
- v6 themes are collaborative multi-agent operations, enterprise controls, hosted service mode, ecosystem scaling.

## Task 4: GREEN And Verification

**Files:**
- All files above

- [ ] **Step 1: Run focused GREEN**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 2: Run broad verification**

Run:

```bash
pnpm.cmd exec tsc -b
pnpm.cmd exec eslint . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
```

Expected: all exit 0. If sandboxed `pnpm.cmd exec` fails with `[ERROR] fetch failed`, rerun with approved escalation and record the reason.

## Task 5: Commit And Push

**Files:**
- Stage only:
  - `README.md`
  - `ROADMAP.md`
  - `docs/ROADMAP_DECISIONS.md`
  - `docs/superpowers/v1-v4-evidence-scorecard.json`
  - `docs/superpowers/v1-v4-evidence-scorecard.md`
  - `docs/superpowers/v5-v6-planning-preview.json`
  - `docs/superpowers/v5-v6-planning-preview.md`
  - `docs/superpowers/plans/2026-06-10-d68-status-v5-v6-planning.md`
  - `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Commit**

```bash
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/v5-v6-planning-preview.json docs/superpowers/v5-v6-planning-preview.md docs/superpowers/plans/2026-06-10-d68-status-v5-v6-planning.md packages/coding-agent/test/unit/status-doc-hygiene.test.ts
git commit -m "docs(D-68): align status and v5 v6 planning"
```

- [ ] **Step 2: Push**

```bash
git push origin feature/d36-gate2-live
```

## Self-Review

- Spec coverage: addresses post-D67 status, v1-v4 progress truthfulness, and v5/v6 planning without starting v5/v6 implementation.
- Placeholder scan: no placeholders; all expected strings, files, and commands are explicit.
- Type consistency: tests and JSON fields use the same `status`, `gates`, `phases`, `implementationAllowed`, and `themes` names.
- Truthfulness: D67 is listed as heuristic improvement only; v1-v4 remains incomplete; v5/v6 are planning preview only.

## Execution Notes

- RED verified: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose` failed as expected because scorecard next actions still referenced D67, `docs/superpowers/v5-v6-planning-preview.json` did not exist, and public current-status blocks still named D66/D67.
- Implementation: updated README, ROADMAP, and ROADMAP_DECISIONS current-status blocks to D68; recorded D67 rename edit hunks as completed; changed next implementation slice to D69 Gate-1 preferred 100K evidence or explicit blocker refresh; added v5/v6 planning preview JSON/MD.
- Scorecard: kept aggregate evidence-backed progress at 48%; added D67 rename_symbol hashline edit-hunk evidence to v1.5; updated next actions to D68/D69/D70 without claiming v1-v4 completion.
- Focused GREEN: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose` passed: 1 test file, 6 tests.
- Broad verification:
  - `pnpm.cmd exec tsc -b`: exit 0.
  - `pnpm.cmd exec eslint . --max-warnings 0`: exit 0.
  - `git diff --check`: clean.
  - `pnpm.cmd test -- --reporter=verbose`: passed; 197 test files total, 196 passed, 1 skipped; 1194 tests total, 1190 passed, 4 skipped.
- Environment note: sandboxed `pnpm.cmd exec ...` continued to fail with `[ERROR] fetch failed`; verification commands using pnpm were rerun with approved escalation.
- Scope note: D68 is documentation and status hygiene only. It does not start v5/v6 implementation, does not unlock new default tools, and does not change Gate-1/Gate-2 thresholds.
