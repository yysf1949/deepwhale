# D129 Production Browser Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add D129 production Browser automation and visual-grounding proof evidence while keeping v2.0 incomplete and default exposure narrow.

**Architecture:** Add a pure `production-proof` Browser module with an injected adapter and deterministic transcript validation. Feed its source/test/evidence paths into the existing v2.0 Tier-1 precheck so production Browser automation and visual grounding pass, while Tier-2 remains blocked.

**Tech Stack:** TypeScript, Vitest, existing Browser module patterns, JSON/Markdown evidence under `docs/superpowers/`.

---

## File Structure

- Create `packages/coding-agent/src/browser/production-proof.ts`: proof recorder, result types, visual evidence validator.
- Create `packages/coding-agent/test/unit/production-browser-proof.test.ts`: RED/GREEN coverage for happy path, opt-in, failed step, and invalid visual snapshot.
- Modify `packages/coding-agent/src/release/v2-tier1-precheck.ts`: add D129 evidence refs, remove production/visual checks from the blocked set, update slice/summary/next action.
- Modify `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`: expect production and visual checks to pass while Tier-2 remains blocked.
- Create `docs/superpowers/v2-production-browser-proof.json` and `.md`: machine-readable and human-readable D129 proof snapshot.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`, `docs/superpowers/v1-v4-evidence-scorecard.json`, `docs/superpowers/v1-v4-evidence-scorecard.md`, and `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: update D129 status and caveats.

## Task 1: RED Test for the Production Proof Recorder

**Files:**
- Create: `packages/coding-agent/test/unit/production-browser-proof.test.ts`
- Create later: `packages/coding-agent/src/browser/production-proof.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  recordProductionBrowserProof,
  type ProductionBrowserAdapter,
  type ProductionBrowserProofScenario,
} from '../../src/browser/production-proof.js';

const scenario: ProductionBrowserProofScenario = {
  id: 'd129-checkout-proof',
  url: 'https://example.test/checkout',
  goal: 'Complete a checkout form with visual grounding',
  steps: [
    { kind: 'navigate', url: 'https://example.test/checkout' },
    { kind: 'type', selector: 'input[name="email"]', value: 'agent@example.test' },
    { kind: 'click', selector: 'button[type="submit"]', label: 'Submit' },
    { kind: 'observe', selector: 'main' },
    { kind: 'visual-snapshot', selector: 'button[type="submit"]' },
  ],
};

function adapter(): ProductionBrowserAdapter {
  return async (command, context) => ({
    status: 'success',
    kind: command.kind,
    target: 'selector' in command ? command.selector : command.url,
    urlAfter: context.currentUrl ?? scenario.url,
    titleAfter: 'Checkout',
    ms: 12,
    summary: `${command.kind} ok`,
    ...(command.kind === 'visual-snapshot'
      ? {
          visual: {
            width: 1280,
            height: 720,
            sha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            nonBlankRatio: 0.42,
            targetRects: [{ selector: 'button[type="submit"]', x: 40, y: 80, width: 120, height: 32 }],
          },
        }
      : {}),
  });
}

describe('production Browser proof recorder (D129)', () => {
  it('records a passing production automation transcript with visual grounding', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: true,
      scenario,
      adapter: adapter(),
    });

    expect(proof.passed).toBe(true);
    expect(proof.automationStatus).toBe('pass');
    expect(proof.visualGroundingStatus).toBe('pass');
    expect(proof.transcript.map((step) => step.kind)).toEqual([
      'navigate',
      'type',
      'click',
      'observe',
      'visual-snapshot',
    ]);
    expect(proof.visualSnapshots).toHaveLength(1);
  });

  it('skips without opt-in', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: false,
      scenario,
      adapter: adapter(),
    });

    expect(proof.passed).toBe(false);
    expect(proof.skipReason).toBe('opt-in-required');
  });

  it('blocks visual grounding when the snapshot metadata is invalid', async () => {
    const proof = await recordProductionBrowserProof({
      generatedAt: '2026-06-12T00:00:00.000Z',
      optIn: true,
      scenario,
      adapter: async (command, context) => ({
        status: 'success',
        kind: command.kind,
        target: 'selector' in command ? command.selector : command.url,
        urlAfter: context.currentUrl ?? scenario.url,
        titleAfter: 'Checkout',
        ms: 12,
        summary: `${command.kind} ok`,
        ...(command.kind === 'visual-snapshot'
          ? { visual: { width: 0, height: 720, sha256: 'bad', nonBlankRatio: 0, targetRects: [] } }
          : {}),
      }),
    });

    expect(proof.passed).toBe(false);
    expect(proof.visualGroundingStatus).toBe('blocked');
    expect(proof.blockers).toContain('valid visual snapshot evidence is missing');
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/production-browser-proof.test.ts --reporter=verbose`

Expected: fail because `../../src/browser/production-proof.js` does not exist.

## Task 2: GREEN Implementation

**Files:**
- Create: `packages/coding-agent/src/browser/production-proof.ts`

- [ ] **Step 1: Implement the proof recorder**

Implement the exported types used by the RED test plus:

- command union: `navigate`, `click`, `type`, `observe`, `visual-snapshot`
- result statuses: `pass`, `blocked`, `fail`
- skip reasons: `opt-in-required`, `adapter-missing`, `empty-scenario`
- transcript rows
- visual snapshot validation helper

- [ ] **Step 2: Run focused test**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/production-browser-proof.test.ts --reporter=verbose`

Expected: 3 tests pass.

## Task 3: Release Precheck Integration

**Files:**
- Modify: `packages/coding-agent/src/release/v2-tier1-precheck.ts`
- Modify: `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`

- [ ] **Step 1: Update the precheck RED expectations**

Change the first test to expect:

```ts
expect(result.slice).toBe('D129');
expect(statusOf(result, 'production-browser-automation')).toBe('pass');
expect(statusOf(result, 'visual-grounding')).toBe('pass');
expect(statusOf(result, 'tier2-blockers')).toBe('blocked');
expect(result.blockers).toEqual(['Tier-2 v2.0 blockers remain tracked separately']);
```

- [ ] **Step 2: Run test to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: fail because the implementation still reports D128 and blocked production/visual checks.

- [ ] **Step 3: Update implementation**

Add D129 evidence refs for:

- `packages/coding-agent/src/browser/production-proof.ts`
- `packages/coding-agent/test/unit/production-browser-proof.test.ts`
- `docs/superpowers/v2-production-browser-proof.json`

Remove `production-browser-automation` and `visual-grounding` from `BLOCKED_CHECKS`. Keep `tier2-blockers` blocked.

- [ ] **Step 4: Run focused precheck tests**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose`

Expected: all precheck tests pass.

## Task 4: Evidence and Status Documentation

**Files:**
- Create: `docs/superpowers/v2-production-browser-proof.json`
- Create: `docs/superpowers/v2-production-browser-proof.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Add proof snapshot**

The JSON must include:

```json
{
  "slice": "D129",
  "proofKind": "production-browser-proof",
  "passed": true,
  "automationStatus": "pass",
  "visualGroundingStatus": "pass"
}
```

- [ ] **Step 2: Update status docs**

Record D129 as the current sprint. Set the next implementation slice to D130. Mention:

- D129 production Browser proof: adapter-contract transcript + visual snapshot metadata.
- v2.0 still blocked by Tier-2 blockers.
- default non-coding expansion remains frozen.

- [ ] **Step 3: Update status-doc hygiene tests**

Update expected aggregate to the new scorecard value and D129 current sprint strings.

- [ ] **Step 4: Run status hygiene tests**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: all status hygiene tests pass.

## Task 5: Final Verification and Commit

**Files:**
- All D129 files only. Do not stage `docs/superpowers/gate-1-current-workspace-result.json` or `.md`.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/production-browser-proof.test.ts --reporter=verbose
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

- [ ] **Step 2: Run full verification**

Run: `cmd /c "pnpm.cmd build && pnpm.cmd lint && pnpm.cmd typecheck && pnpm.cmd test"`

Expected: build, lint, typecheck, and test all exit 0.

- [ ] **Step 3: Check whitespace**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 4: Stage D129 files only**

Use path-specific `git add -- ...`. Exclude the two `gate-1-current-workspace-result.*` dirty files.

- [ ] **Step 5: Commit and push**

Commit message:

```bash
git commit -m "feat(D-129): add production Browser proof"
git push -u origin feature/d36-gate2-live
```

## Self-Review

- Spec coverage: tasks cover production proof module, release precheck, evidence docs, status hygiene, verification, commit, and push.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: exported type/function names match the planned tests and implementation.
