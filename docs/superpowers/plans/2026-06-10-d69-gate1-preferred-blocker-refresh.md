# D69 Gate1 Preferred Blocker Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh Gate-1 preferred-target evidence from the current local `.gate-targets` state, preserve the Vite minimum-50k pass, and keep preferred-100k explicitly blocked unless a real 100K+ target exists.

**Architecture:** This sprint is evidence hygiene and gate verification only. It reuses the existing Gate-1 target inventory and Gate-1 runner scripts, then updates public status and scorecard documents so future agents cannot confuse a minimum-50k pass with preferred-100k maturity.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, existing `@deepwhale/code-intel` Gate-1 scripts, Markdown/JSON evidence files.

---

## File Structure

- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require D69 status pointers, fresh Gate-1 inventory wording, and D70 next action.
- Modify `packages/code-intel/test/unit/gate1-targets.test.ts`: require blocker Markdown/JSON wording that explicitly says `minimum-only`, `preferredTargets: 0`, and "inventory is not a scenario pass."
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: update current-status blocks from D68 to D69 and keep preferred-100k blocked.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: record D69 evidence refresh and point next actions to D70.
- Regenerate `docs/superpowers/gate-1-preferred-targets.{json,md}` from `.gate-targets`.
- Regenerate `docs/superpowers/gate-1-vite-result.{json,md}` by running the formal Vite Gate-1 scenario.
- Create `docs/superpowers/plans/2026-06-10-d69-gate1-preferred-blocker-refresh.md`: this plan and execution notes.

## Task 1: RED Tests For D69 Status And Gate-1 Blocker

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `packages/code-intel/test/unit/gate1-targets.test.ts`

- [ ] **Step 1: Add D69 status assertions**

Update the status hygiene test to require:

```ts
expect(block).toContain('Current sprint: D69 Gate-1 preferred blocker refresh');
expect(block).toContain('D68 status and v5/v6 planning preview');
expect(block).toContain('D69 Gate-1 preferred blocker refresh');
expect(block).toContain('Next implementation slice: D70 Gate-1.5 evidence refresh and Browser branch decision');
expect(block).not.toMatch(/Current sprint: D68/i);
expect(block).not.toMatch(/Next implementation slice: D69/i);
```

Update scorecard assertions to require:

```ts
expect(scorecard.nextActions).toContain(
  'D70: refresh Gate-1.5 evidence and decide whether Browser remains frozen, minimal, or eligible for continued opt-in work.',
);
expect(scorecard.nextActions.join('\n')).not.toMatch(/^D69:/m);
```

- [ ] **Step 2: Add Gate-1 blocker rendering assertions**

In `packages/code-intel/test/unit/gate1-targets.test.ts`, extend the minimum-only test:

```ts
expect(report.preferredTargets).toHaveLength(0);
expect(report.minimumTargets).toHaveLength(1);
expect(md).toContain('Status: minimum-only');
expect(md).toContain('Preferred targets: 0');
expect(md).toContain('`preferred-100k` is required before claiming preferred Code Intel maturity.');
expect(md).toContain('This inventory does not itself prove Gate-1 pass on a target');
```

- [ ] **Step 3: Run RED**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/code-intel/test/unit/gate1-targets.test.ts --reporter=verbose
```

Expected: FAIL because current public docs still name D68/D69 next work and Gate-1 target inventory may not include the new stricter wording.

## Task 2: Regenerate Gate-1 Evidence

**Files:**
- Modify: `docs/superpowers/gate-1-preferred-targets.json`
- Modify: `docs/superpowers/gate-1-preferred-targets.md`
- Modify: `docs/superpowers/gate-1-vite-result.json`
- Modify: `docs/superpowers/gate-1-vite-result.md`

- [ ] **Step 1: Refresh target inventory**

Run:

```bash
pnpm.cmd -F @deepwhale/code-intel exec tsx scripts/gate1-target-inventory.mjs --targets-root .gate-targets --json docs/superpowers/gate-1-preferred-targets.json --md docs/superpowers/gate-1-preferred-targets.md
```

Expected: exit 0 and output includes `status=minimum-only preferredTargets=0`.

- [ ] **Step 2: Refresh Vite Gate-1 scenario**

Run:

```bash
pnpm.cmd -F @deepwhale/code-intel exec tsx scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --entry-file packages/vite/src/node/server/index.ts --caller createServer --caller-file packages/vite/src/node/server/index.ts --callee _createServer --callee-file packages/vite/src/node/server/index.ts --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md
```

Expected: exit 0, JSON contains `"passed": true`, `"locQualification": "minimum-50k"`, and LOC remains below preferred 100000.

## Task 3: Update Public Status And Scorecard

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update current-status blocks**

For each current-status block:

- Change `Current sprint` to `D69 Gate-1 preferred blocker refresh`.
- Add completed slice `D68 status and v5/v6 planning preview: public status blocks now link planning-preview-only v5/v6 evidence.`
- Add completed slice `D69 Gate-1 preferred blocker refresh: refreshed local target inventory keeps Vite at minimum-50k and preferred-100k blocked.`
- Change next work to `Next implementation slice: D70 Gate-1.5 evidence refresh and Browser branch decision`.
- Keep `Gate-1 preferred status: minimum-only`.
- Keep `Gate-1 preferred-100k is blocked by missing local 100K+ target evidence.`

- [ ] **Step 2: Update scorecard**

Keep `aggregatePercent: 48`. Add D69 evidence to v1.5:

```json
"D69 refreshed Gate-1 target inventory and Vite minimum-50k Gate-1 scenario evidence"
```

Update next actions to:

```json
[
  "D70: refresh Gate-1.5 evidence and decide whether Browser remains frozen, minimal, or eligible for continued opt-in work.",
  "D71: deepen Code Intel import/reference graph correctness without claiming IDE-grade semantics.",
  "D72: refresh release/version hygiene after Gate-1.5 decision."
]
```

## Task 4: GREEN And Verification

**Files:**
- All files above

- [ ] **Step 1: Run focused GREEN**

Run:

```bash
pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/code-intel/test/unit/gate1-targets.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 2: Run Gate-1 evidence checks**

Run:

```bash
pnpm.cmd -F @deepwhale/code-intel exec tsx scripts/gate1-target-inventory.mjs --targets-root .gate-targets --json docs/superpowers/gate-1-preferred-targets.json --md docs/superpowers/gate-1-preferred-targets.md
pnpm.cmd -F @deepwhale/code-intel exec tsx scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --entry-file packages/vite/src/node/server/index.ts --caller createServer --caller-file packages/vite/src/node/server/index.ts --callee _createServer --callee-file packages/vite/src/node/server/index.ts --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md
```

Expected: inventory reports `minimum-only`; Vite Gate-1 scenario passes with `locQualification: minimum-50k`.

- [ ] **Step 3: Run broad verification**

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
  - `docs/superpowers/gate-1-preferred-targets.json`
  - `docs/superpowers/gate-1-preferred-targets.md`
  - `docs/superpowers/gate-1-vite-result.json`
  - `docs/superpowers/gate-1-vite-result.md`
  - `docs/superpowers/v1-v4-evidence-scorecard.json`
  - `docs/superpowers/v1-v4-evidence-scorecard.md`
  - `docs/superpowers/plans/2026-06-10-d69-gate1-preferred-blocker-refresh.md`
  - `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
  - `packages/code-intel/test/unit/gate1-targets.test.ts`

- [ ] **Step 1: Commit**

```bash
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1-preferred-targets.json docs/superpowers/gate-1-preferred-targets.md docs/superpowers/gate-1-vite-result.json docs/superpowers/gate-1-vite-result.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d69-gate1-preferred-blocker-refresh.md packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/code-intel/test/unit/gate1-targets.test.ts
git commit -m "docs(D-69): refresh gate1 preferred blocker"
```

- [ ] **Step 2: Push**

```bash
git push origin feature/d36-gate2-live
```

## Self-Review

- Spec coverage: refreshes current Gate-1 preferred evidence/blocker, preserves Vite minimum Gate-1 pass, and moves v1-v4 next work to Gate-1.5 evidence.
- Placeholder scan: no placeholders; all commands and touched files are explicit.
- Type consistency: status strings match test assertions and public docs.
- Truthfulness: does not claim preferred-100k pass; keeps default non-coding expansion frozen.
