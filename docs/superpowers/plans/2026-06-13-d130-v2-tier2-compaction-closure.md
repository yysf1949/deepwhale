# D130 V2 Tier-2 Compaction Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Compaction item within v2.0 Tier-2 release evidence while keeping v2.0 blocked on Automation, Remote TUI, and MCP Runtime.

**Architecture:** Extend the existing deterministic v2 precheck rather than adding runtime features. Replace the single generic Tier-2 blocker row with four explicit rows, mark Compaction pass from existing implementation/test evidence, and update docs/status hygiene so the current state is machine-readable and not overclaimed.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON evidence files, pnpm monorepo verification.

---

## File Structure

- Modify `packages/coding-agent/src/release/v2-tier1-precheck.ts`: add four Tier-2 check ids, D130 evidence refs for Compaction, updated blocked rows, summary, and next actions.
- Modify `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`: TDD expectations for D130 rows and evidence snapshots.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: public status expectations after D130.
- Modify `docs/superpowers/v2-tier1-precheck.json`: machine-readable D130 precheck evidence.
- Modify `docs/superpowers/v2-tier1-precheck.md`: human-readable D130 precheck evidence.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json`: progress and blocker update.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.md`: scorecard mirror.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: current status blocks.
- Create `docs/superpowers/specs/2026-06-13-d130-v2-tier2-compaction-closure-design.md`: design record.
- Create `docs/superpowers/plans/2026-06-13-d130-v2-tier2-compaction-closure.md`: this plan.

### Task 1: Red Test For D130 Tier-2 Rows

- [ ] **Step 1: Update failing unit expectations**

Change `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts` so it expects:

```ts
expect(result.slice).toBe('D130');
expect(statusOf(result, 'tier2-compaction')).toBe('pass');
expect(statusOf(result, 'tier2-automation')).toBe('blocked');
expect(statusOf(result, 'tier2-remote-tui')).toBe('blocked');
expect(statusOf(result, 'tier2-mcp-runtime')).toBe('blocked');
expect(result.blockers).toEqual([
  'Tier-2 Automation remains blocked',
  'Tier-2 Remote TUI remains blocked',
  'Tier-2 MCP Runtime remains blocked',
]);
expect(result.nextActions[0]).toContain('D131');
```

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: fail because the implementation still reports D129 and the generic `tier2-blockers` row.

### Task 2: Implement D130 Precheck

- [ ] **Step 1: Extend check ids and evidence**

In `v2-tier1-precheck.ts`, replace `tier2-blockers` with the four explicit Tier-2 ids. Add evidence refs for `tier2-compaction`:

```ts
{
  id: 'd130-compaction-core-source',
  checkId: 'tier2-compaction',
  path: 'packages/core/src/session/compaction.ts',
  kind: 'source',
  layer: 'release-gate',
  note: 'D130 core compaction implementation with token-budget tail, summary replacement, and latch.',
}
```

Also add refs for `agent-compaction.ts`, `print.ts`, `rpc.ts`, and the relevant tests.

- [ ] **Step 2: Update blocked checks**

Keep Automation, Remote TUI, and MCP Runtime blocked:

```ts
const BLOCKED_CHECKS = new Map([
  ['tier2-automation', 'Tier-2 Automation remains blocked'],
  ['tier2-remote-tui', 'Tier-2 Remote TUI remains blocked'],
  ['tier2-mcp-runtime', 'Tier-2 MCP Runtime remains blocked'],
]);
```

- [ ] **Step 3: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: all tests in that file pass.

### Task 3: Update Evidence Docs And Status Hygiene

- [ ] **Step 1: Update machine-readable evidence**

Update `docs/superpowers/v2-tier1-precheck.json` to D130 with ten checks: six existing pass rows, one `tier2-compaction:pass`, and three blocked Tier-2 rows.

- [ ] **Step 2: Update Markdown/public docs**

Update the README/ROADMAP/decision current-status blocks:

```text
Current sprint: D130 v2.0 Tier-2 Compaction closure
D130 v2.0 Tier-2 Compaction closure: Compaction is now a pass row...
Next implementation slice: D131 close another v2.0 Tier-2 blocker without expanding default exposure.
```

- [ ] **Step 3: Update status hygiene test**

Change `status-doc-hygiene.test.ts` expectations from D129/D130 to D130/D131 and require a D130 line.

- [ ] **Step 4: Run docs-focused GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: both files pass.

### Task 4: Verification, Commit, Push

- [ ] **Step 1: Full verification**

Run:

```powershell
cmd /c "pnpm.cmd build && pnpm.cmd lint && pnpm.cmd typecheck && pnpm.cmd test"
git diff --check
```

Expected: exit 0 for both commands.

- [ ] **Step 2: Stage only D130 files**

Run explicit `git add` for D130 files only. Do not stage:

```text
docs/superpowers/gate-1-current-workspace-result.json
docs/superpowers/gate-1-current-workspace-result.md
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "feat(D-130): close compaction Tier-2 evidence"
git push -u origin feature/d36-gate2-live
```

Expected: branch pushes successfully.

## Plan Self-Review

- Spec coverage: design, precheck, docs, status hygiene, verification, commit, and push are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: check ids use `tier2-automation`, `tier2-remote-tui`, `tier2-compaction`, and `tier2-mcp-runtime` consistently.
