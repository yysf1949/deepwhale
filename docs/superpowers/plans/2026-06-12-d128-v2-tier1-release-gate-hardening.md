# D128 V2 Tier-1 Release-Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic v2.0 Tier-1 precheck that proves current helper-layer evidence is present while honestly keeping v2.0 blocked on production Browser automation, visual grounding, and Tier-2 evidence.

**Architecture:** Create a pure release precheck module in `packages/coding-agent/src/release/`, backed by unit tests and source-controlled JSON/Markdown evidence. The evaluator consumes an evidence catalog and default registry tool names, classifies each check, and returns a stable release-gate result without reading external services or expanding the registry.

**Tech Stack:** TypeScript strict mode, Vitest, existing `@deepwhale/coding-agent` package, no new npm dependencies.

---

## File Structure

- Create `packages/coding-agent/src/release/v2-tier1-precheck.ts`: pure evaluator, default evidence catalog, allowed default tool names, result/check types.
- Create `packages/coding-agent/src/release/index.ts`: exports the D128 precheck API.
- Modify `packages/coding-agent/src/index.ts`: export release helpers.
- Create `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`: red-green tests for current state, blockers, missing evidence, leaked tools, and evidence JSON.
- Create `docs/superpowers/v2-tier1-precheck.json`: deterministic evidence snapshot.
- Create `docs/superpowers/v2-tier1-precheck.md`: human-readable evidence summary.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: advance current sprint to D128 and reference the precheck.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json` and `.md`: add D128 evidence, keep v2.0 incomplete, update next action.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: align current sprint and scorecard assertions after D128.

### Task 1: Precheck Evaluator Tests

**Files:**
- Create: `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`

- [ ] **Step 1: Write the failing current-state test**

Add a test that imports `evaluateV2Tier1Precheck()` and `createDefaultRegistry()`, passes
the current default tool names, and expects:

```ts
const result = evaluateV2Tier1Precheck({
  defaultToolNames: createDefaultRegistry().list().map((tool) => tool.name),
});

expect(result.milestone).toBe('v2.0');
expect(result.tier).toBe('Tier-1');
expect(result.passed).toBe(false);
expect(result.checks.find((check) => check.id === 'browser-tier1-foundation')?.status).toBe('pass');
expect(result.checks.find((check) => check.id === 'memory-ranking')?.status).toBe('pass');
expect(result.checks.find((check) => check.id === 'code-intel-semantic-fallback')?.status).toBe('pass');
expect(result.checks.find((check) => check.id === 'default-exposure')?.status).toBe('pass');
expect(result.checks.find((check) => check.id === 'production-browser-automation')?.status).toBe('blocked');
expect(result.checks.find((check) => check.id === 'visual-grounding')?.status).toBe('blocked');
```

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: FAIL because `../../src/release/v2-tier1-precheck.js` does not exist.

### Task 2: Precheck Evaluator Implementation

**Files:**
- Create: `packages/coding-agent/src/release/v2-tier1-precheck.ts`
- Create: `packages/coding-agent/src/release/index.ts`
- Modify: `packages/coding-agent/src/index.ts`

- [ ] **Step 1: Implement the pure evaluator**

Create result types, default evidence rows for D126/D127, allowed default tool names, and
`evaluateV2Tier1Precheck()`. Required helper evidence passes when every referenced row is
present. Production checks remain blocked through explicit blocker rows.

- [ ] **Step 2: Export the release module**

Add:

```ts
export * from './release/index.js';
```

to `packages/coding-agent/src/index.ts`, and export the precheck API from
`packages/coding-agent/src/release/index.ts`.

- [ ] **Step 3: Run GREEN**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: PASS.

### Task 3: Negative Gate Tests

**Files:**
- Modify: `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`
- Modify: `packages/coding-agent/src/release/v2-tier1-precheck.ts`

- [ ] **Step 1: Add failing negative tests**

Add tests that:

```ts
expect(
  evaluateV2Tier1Precheck({ defaultToolNames: ['read_file', 'desktop_control'] }).checks.find(
    (check) => check.id === 'default-exposure',
  )?.status,
).toBe('fail');

expect(
  evaluateV2Tier1Precheck({
    missingEvidencePaths: ['packages/coding-agent/src/memory/ranking.ts'],
  }).checks.find((check) => check.id === 'memory-ranking')?.status,
).toBe('fail');
```

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: FAIL until leaked tools and missing evidence affect check status.

- [ ] **Step 3: Implement missing-evidence and leaked-tool handling**

Ensure `missingEvidencePaths` marks matching evidence rows absent, and any tool outside
`DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES` fails `default-exposure` with a blocker message.

- [ ] **Step 4: Run GREEN**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Source-Controlled Evidence

**Files:**
- Create: `docs/superpowers/v2-tier1-precheck.json`
- Create: `docs/superpowers/v2-tier1-precheck.md`
- Modify: `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`

- [ ] **Step 1: Add evidence-file test**

Add a test that reads `docs/superpowers/v2-tier1-precheck.json` and checks:

```ts
expect(evidence.slice).toBe('D128');
expect(evidence.milestone).toBe('v2.0');
expect(evidence.tier).toBe('Tier-1');
expect(evidence.passed).toBe(false);
expect(evidence.blockers).toContain('production Browser automation proof is still missing');
```

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: FAIL because the evidence JSON does not exist.

- [ ] **Step 3: Add JSON and Markdown evidence**

Write the D128 precheck result snapshot. Keep `passed: false` and list the remaining
blockers plainly.

- [ ] **Step 4: Run GREEN**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: PASS.

### Task 5: Status Evidence Hygiene

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Update status docs**

Record D128 as v2.0 Tier-1 release-gate hardening evidence. Add
`v2.0 Tier-1 precheck: docs/superpowers/v2-tier1-precheck.json` to current status blocks.
Keep v1-v4 incomplete and keep default exposure caveats.

- [ ] **Step 2: Update scorecard**

Advance v2.0 from 62 to 64 and aggregate from 66 to 67 only if focused tests pass. Add a
D128 evidence line and set next action to:

`D129: prove production Browser automation and visual-grounding behavior without expanding default exposure.`

- [ ] **Step 3: Run status hygiene**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: PASS.

### Task 6: Full Verification, Commit, Push

**Files:**
- Stage only D128 files. Do not stage `docs/superpowers/gate-1-current-workspace-result.json` or `docs/superpowers/gate-1-current-workspace-result.md`.

- [ ] **Step 1: Run full verification**

Run in order:

`pnpm.cmd typecheck`

`pnpm.cmd lint`

`pnpm.cmd build`

`pnpm.cmd test`

`git diff --check`

Expected: all exit 0.

- [ ] **Step 2: Stage D128 files only**

Run a path-specific `git add` for the release module, tests, docs, spec, plan, scorecard,
and status-hygiene test.

- [ ] **Step 3: Commit and push**

Commit message: `feat(D-128): add v2 Tier-1 release-gate precheck`

Push branch: `feature/d36-gate2-live`.

## Self-Review

- Spec coverage: tasks cover evaluator, exports, negative checks, evidence files, status docs, verification, commit, and push.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: check ids, status strings, evidence paths, and next-action text are consistent across tasks.
