# D126 Browser Tier-1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first evidence-backed v2.0 Browser Tier-1 foundation slice: richer DOM understanding, deterministic element ranking, page summaries, and repeat-action avoidance.

**Architecture:** Keep the implementation as pure TypeScript helpers in the existing Browser module. `observeHtml()` owns semantic extraction and page summaries; `rankElementsForIntent()` owns candidate scoring; `planBrowserAction()` consumes ranking and action history while preserving the existing return shape.

**Tech Stack:** TypeScript strict mode, Vitest, existing `packages/coding-agent/src/browser/*` files, no new npm dependencies.

---

## File Structure

- Modify `packages/coding-agent/src/browser/observation.ts`: extend element/summary types, parse richer semantic HTML, normalize bounded action history, expose ranking helpers.
- Modify `packages/coding-agent/src/browser/planner.ts`: consume ranked elements and avoid repeated actions when alternatives exist.
- Modify `packages/coding-agent/test/unit/browser-observation.test.ts`: add red tests for semantic extraction, page summary, and history normalization.
- Modify `packages/coding-agent/test/unit/browser-planner.test.ts`: add red tests for ranking-driven planning and repeat avoidance.
- Keep `packages/coding-agent/test/unit/browser-runtime-profile.test.ts` unchanged except verification; it protects default registry policy.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json` and `.md`, `README.md`, and `ROADMAP.md` only after implementation is verified enough to justify D126 evidence.

### Task 1: Observation Semantics

**Files:**
- Modify: `packages/coding-agent/test/unit/browser-observation.test.ts`
- Modify: `packages/coding-agent/src/browser/observation.ts`

- [ ] **Step 1: Write failing semantic extraction test**

Add a test proving `observeHtml()` extracts buttons, links, inputs, labels, headings, forms, landmarks, and role-backed interactive elements with DOM order and stable selectors.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts --reporter=verbose`

Expected: FAIL because current `VisibleElement` objects lack semantic fields, labels, forms, headings, and roles.

- [ ] **Step 3: Implement semantic extraction**

Extend `VisibleElement` and parse common tags/attributes with defensive string helpers. Keep existing `tag`, `text`, `ariaLabel`, and `href` behavior intact.

- [ ] **Step 4: Run observation test**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts --reporter=verbose`

Expected: PASS for old and new observation tests.

### Task 2: Page Summary And History

**Files:**
- Modify: `packages/coding-agent/test/unit/browser-observation.test.ts`
- Modify: `packages/coding-agent/src/browser/observation.ts`

- [ ] **Step 1: Write failing summary/history test**

Add a test proving `pageSummary` contains counts, headings, forms, links, primary action, and the most recent five actions, and that repeated action detection works for the latest matching type+target.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts --reporter=verbose`

Expected: FAIL because current observations only expose `domSummary` and raw history.

- [ ] **Step 3: Implement summary/history helpers**

Add `PageSummary`, `normalizeActionHistory()`, `isRepeatedAction()`, and `summarizePage()`. Build `domSummary` from the richer summary while keeping it string-based for callers.

- [ ] **Step 4: Run observation test**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts --reporter=verbose`

Expected: PASS.

### Task 3: Ranking And Planner Repeat Avoidance

**Files:**
- Modify: `packages/coding-agent/test/unit/browser-planner.test.ts`
- Modify: `packages/coding-agent/src/browser/observation.ts`
- Modify: `packages/coding-agent/src/browser/planner.ts`

- [ ] **Step 1: Write failing ranking/planner tests**

Add tests proving a search intent ranks a search input above unrelated inputs, a click intent ranks the matching actionable button/link above disabled or mismatched elements, and planner avoids repeating the same action target when another suitable target exists.

- [ ] **Step 2: Run planner test to verify it fails**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-planner.test.ts --reporter=verbose`

Expected: FAIL because current planner chooses the first text/aria-label match and has no scoring or repeat avoidance.

- [ ] **Step 3: Implement ranking and planner selection**

Add `rankElementsForIntent()` with deterministic scoring and expose top candidates through `BrowserActionPlan.rankedTargets`. Update planner to prefer the highest non-repeated actionable target.

- [ ] **Step 4: Run focused Browser tests**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts packages/coding-agent/test/unit/browser-planner.test.ts packages/coding-agent/test/unit/browser-runtime-profile.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Status Evidence Hygiene

**Files:**
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update docs after code passes focused tests**

Record D126 as Browser Tier-1 foundation evidence. Keep v1-v4 incomplete, Browser default exposure opt-in, and Gate-2 scoped.

- [ ] **Step 2: Run focused Browser tests again**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts packages/coding-agent/test/unit/browser-planner.test.ts packages/coding-agent/test/unit/browser-runtime-profile.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run in order:

`pnpm.cmd typecheck`

`pnpm.cmd lint`

`pnpm.cmd build`

`pnpm.cmd test`

`git diff --check`

Expected: all exit 0.

- [ ] **Step 4: Stage only D126 files**

Stage the Browser source/tests, D126 spec/plan, and status docs. Do not stage `docs/superpowers/gate-1-current-workspace-result.json` or `.md`.

- [ ] **Step 5: Commit and push**

Commit message: `feat(D-126): add Browser Tier-1 foundation`

Push branch: `feature/d36-gate2-live`.

## Self-Review

- Spec coverage: the plan covers DOM Understanding, Element Ranking, Page Summary, Action History, status accounting, and default-registry preservation.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: helper names and file paths match the design document and existing Browser module names.
