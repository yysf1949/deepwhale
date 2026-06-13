# D134 V3/V4 Production Precheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-readable v3/v4 production precheck that records current evidence, keeps remaining production blockers explicit, and does not expand default exposure.

**Architecture:** Create a release evaluator in `packages/coding-agent/src/release/v3-v4-production-precheck.ts`. It mirrors the v2 precheck shape but is expected to fail overall because v3 production breadth and v4 cross-platform SIGKILL evidence remain blocked. Update docs and status tests so public status moves from D134 to D135.

**Tech Stack:** TypeScript, Vitest, JSON/Markdown evidence files, pnpm monorepo verification.

---

## File Structure

- Create `packages/coding-agent/src/release/v3-v4-production-precheck.ts`: typed evaluator, evidence refs, blockers, default-exposure check.
- Modify `packages/coding-agent/src/release/index.ts`: export the new evaluator.
- Create `packages/coding-agent/test/unit/v3-v4-production-precheck.test.ts`: RED/GREEN tests for statuses, blockers, default exposure, missing evidence, and JSON snapshot.
- Create `docs/superpowers/v3-v4-production-precheck.json`: machine-readable D134 evidence snapshot.
- Create `docs/superpowers/v3-v4-production-precheck.md`: human-readable mirror.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require the new precheck link and D134/D135 status pointers.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: add D134 evidence update and next action D135.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: current status D134, D134 completed line, D135 next slice.
- Create `docs/superpowers/specs/2026-06-13-d134-v3-v4-production-precheck-design.md`: design record.
- Create `docs/superpowers/plans/2026-06-13-d134-v3-v4-production-precheck.md`: this plan.

### Task 1: RED Test For V3/V4 Production Precheck

- [ ] **Step 1: Create failing test file**

Create `packages/coding-agent/test/unit/v3-v4-production-precheck.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateV3V4ProductionPrecheck } from '../../src/release/v3-v4-production-precheck.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';

function statusOf(result: ReturnType<typeof evaluateV3V4ProductionPrecheck>, id: string): string | undefined {
  return result.checks.find((check) => check.id === id)?.status;
}

describe('v3/v4 production precheck (D134)', () => {
  it('records current v3/v4 evidence and keeps production blockers explicit', () => {
    const result = evaluateV3V4ProductionPrecheck({
      defaultToolNames: createDefaultRegistry().list().map((tool) => tool.name),
    });

    expect(result.slice).toBe('D134');
    expect(result.passed).toBe(false);
    expect(result.completedChecks).toBe(5);
    expect(result.blockingChecks).toBe(2);
    expect(statusOf(result, 'v3-gate2-live-fixture')).toBe('pass');
    expect(statusOf(result, 'v3-reviewer-gate-boundary')).toBe('pass');
    expect(statusOf(result, 'v3-production-breadth')).toBe('blocked');
    expect(statusOf(result, 'v4-cross-session-agent-os')).toBe('pass');
    expect(statusOf(result, 'v4-persistent-memory-recovery')).toBe('pass');
    expect(statusOf(result, 'v4-cross-platform-sigkill')).toBe('blocked');
    expect(statusOf(result, 'default-exposure')).toBe('pass');
    expect(result.blockers).toEqual([
      'v3.0 production breadth needs multi-scenario long-horizon replay evidence',
      'v4.0 cross-platform SIGKILL/restore evidence is missing',
    ]);
    expect(result.defaultExposure.nonCodingDefaultEnabled).toBe(false);
    expect(result.nextActions[0]).toContain('D135');
  });

  it('fails default exposure when a non-coding tool leaks into defaults', () => {
    const result = evaluateV3V4ProductionPrecheck({
      defaultToolNames: ['read_file', 'desktop_control'],
    });

    expect(statusOf(result, 'default-exposure')).toBe('fail');
    expect(result.defaultExposure.nonCodingDefaultEnabled).toBe(true);
    expect(result.blockers).toContain('default registry exposure drift detected');
  });

  it('fails an evidence row when required evidence is missing', () => {
    const result = evaluateV3V4ProductionPrecheck({
      missingEvidencePaths: ['docs/superpowers/gate-2-long-horizon-live.json'],
    });

    expect(statusOf(result, 'v3-gate2-live-fixture')).toBe('fail');
    expect(result.blockers).toContain('missing evidence for v3-gate2-live-fixture');
  });

  it('ships machine-readable D134 evidence snapshot', () => {
    const snapshot = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/superpowers/v3-v4-production-precheck.json'), 'utf8'),
    ) as {
      slice: string;
      passed: boolean;
      blockers: string[];
      checks: Array<{ id: string; status: string }>;
    };

    expect(snapshot.slice).toBe('D134');
    expect(snapshot.passed).toBe(false);
    expect(snapshot.blockers).toEqual([
      'v3.0 production breadth needs multi-scenario long-horizon replay evidence',
      'v4.0 cross-platform SIGKILL/restore evidence is missing',
    ]);
    expect(snapshot.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      'v3-gate2-live-fixture:pass',
      'v3-reviewer-gate-boundary:pass',
      'v3-production-breadth:blocked',
      'v4-cross-session-agent-os:pass',
      'v4-persistent-memory-recovery:pass',
      'v4-cross-platform-sigkill:blocked',
      'default-exposure:pass',
    ]);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v3-v4-production-precheck.test.ts --reporter=verbose
```

Expected: fail because `../../src/release/v3-v4-production-precheck.js` does not exist.

### Task 2: Implement The Precheck Evaluator

- [ ] **Step 1: Create evaluator**

Create `packages/coding-agent/src/release/v3-v4-production-precheck.ts` with:

- check ids: `v3-gate2-live-fixture`, `v3-reviewer-gate-boundary`, `v3-production-breadth`, `v4-cross-session-agent-os`, `v4-persistent-memory-recovery`, `v4-cross-platform-sigkill`, `default-exposure`;
- evidence refs listed in the design;
- blocked checks for production breadth and cross-platform SIGKILL;
- default exposure evaluator using `DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES` from `v2-tier1-precheck.ts`;
- `evaluateV3V4ProductionPrecheck()` returning `slice: 'D134'`, `passed: false`, five pass rows, two blocked rows, and D135/D136 next actions.

- [ ] **Step 2: Export evaluator**

Modify `packages/coding-agent/src/release/index.ts`:

```ts
export * from './v2-tier1-precheck.js';
export * from './v3-v4-production-precheck.js';
```

- [ ] **Step 3: Run GREEN for evaluator**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v3-v4-production-precheck.test.ts --reporter=verbose
```

Expected: implementation tests pass except the snapshot test until docs are created.

### Task 3: Add Evidence Docs And Public Status Alignment

- [ ] **Step 1: Create `docs/superpowers/v3-v4-production-precheck.json`**

The snapshot must include `slice: "D134"`, `passed: false`, five pass rows, two blocked rows, default exposure at 21 tools, and exactly the two blockers in the test.

- [ ] **Step 2: Create `docs/superpowers/v3-v4-production-precheck.md`**

Mirror the JSON with a table and clear caveats:

```text
This precheck is expected to fail overall until v3.0 production breadth and v4.0 cross-platform SIGKILL/restore evidence exist.
```

- [ ] **Step 3: Update public docs and scorecard**

Update README, ROADMAP, docs/ROADMAP_DECISIONS, and scorecard docs:

```text
Current sprint: D134 v3/v4 production precheck
D134 v3/v4 production precheck: machine-readable v3/v4 evidence matrix added; production breadth and cross-platform SIGKILL remain blockers.
Next implementation slice: D135 record multi-scenario v3.0 production long-horizon replay evidence without expanding default exposure.
```

Keep v1-v4 incomplete.

- [ ] **Step 4: Update status hygiene test**

Require all current-status blocks to contain:

- `v3/v4 production precheck: docs/superpowers/v3-v4-production-precheck.json`
- `Current sprint: D134 v3/v4 production precheck`
- `D134 v3/v4 production precheck:`
- `Next implementation slice: D135`

Add negative checks for stale D133/D134 next-work strings.

- [ ] **Step 5: Run docs-focused GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v3-v4-production-precheck.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/coding-agent/test/unit/default-registry-invariant.test.ts --reporter=verbose
```

Expected: all focused tests pass.

### Task 4: Verification, Commit, Push

- [ ] **Step 1: Full verification**

Run:

```powershell
cmd /c "pnpm.cmd build && pnpm.cmd lint && pnpm.cmd typecheck && pnpm.cmd test"
git diff --check
```

Expected: exit 0 for both commands.

- [ ] **Step 2: Stage only D134 files**

Use explicit `git add` paths. Do not stage:

```text
docs/superpowers/gate-1-current-workspace-result.json
docs/superpowers/gate-1-current-workspace-result.md
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "feat(D-134): add v3 v4 production precheck"
git push -u origin feature/d36-gate2-live
```

Expected: branch pushes successfully.

## Plan Self-Review

- Spec coverage: v3/v4 evidence matrix, default exposure invariant, blockers, docs, focused tests, full verification, commit, and push are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: check ids match between tests, docs, and evaluator.
- Scope check: no default exposure, no Desktop/channel implementation, no live runner, and no v3/v4 production-complete claim.
