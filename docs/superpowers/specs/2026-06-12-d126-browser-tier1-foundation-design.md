# D126 Browser Tier-1 Foundation Design

## Context

Gate-1.5 binding is true after D125: the live Browser task ledger has 20/20 completed
tasks and Browser enhancement is unlocked. That unlocks implementation work; it does not
default-enable Browser tools and it does not make v2.0 complete.

Current Browser foundation code is intentionally thin:

- `packages/coding-agent/src/browser/observation.ts` extracts only buttons, aria-labeled
  inputs, and anchors.
- `packages/coding-agent/src/browser/planner.ts` classifies a user intent and returns the
  first text or aria-label match.
- Default registry policy still keeps Browser tools opt-in.

## Approaches

Recommended: implement a pure TypeScript foundation in the existing Browser module. This
adds deterministic DOM semantics, page summary, element ranking, and action-history
signals without introducing a browser driver dependency or changing registry exposure.

Alternative 1: wire the planner directly to Playwright/Puppeteer selectors now. That would
mix actuation with planning and make Tier-1 harder to test without a live browser.

Alternative 2: wait for v3.0 visual grounding and implement ranking with screenshot
coordinates. That would skip the v2.0 roadmap requirement for DOM/semantic ranking.

## Scope

D126 implements the first Browser Tier-1 foundation slice:

- DOM Understanding: parse semantic elements from HTML strings, including buttons, links,
  inputs, textareas, selects, headings, forms, labels, and role-backed interactive
  elements.
- Element Ranking: expose deterministic ranked candidates for a user intent using action
  type, token overlap, semantic names, hrefs, roles, labels, placeholders, headings/forms,
  actionability, and DOM order.
- Page Summary: produce a token-friendly summary with title, URL, element counts,
  landmarks, headings, forms, links, primary action, and recent action-history state.
- Action History: retain bounded recent actions and detect repeated target/type pairs so
  planner selection can avoid immediate repeats when alternatives exist.

## Out Of Scope

- Browser tools remain opt-in; default registry policy is unchanged.
- No visual grounding, screenshot coordinate model, adaptive retry strategy, or v3.0
  Computer Use reuse.
- No production selector engine and no claim that Browser automation is complete.
- No npm dependency addition.
- No broad cleanup of historical mojibake comments outside files touched by D126.

## Interfaces

`VisibleElement` remains backward compatible and gains optional fields:

- `id`, `role`, `name`, `placeholder`, `value`, `type`, `href`, `formName`
- `selector`: a stable best-effort selector for future actuation
- `semanticKind`: `action`, `input`, `link`, `heading`, `form`, `landmark`, or `text`
- `actionable`: boolean
- `disabled`: boolean
- `domOrder`: number

`Observation` gains:

- `pageSummary`: structured summary with counts, landmarks, headings, forms, links,
  primaryAction, and recentActions
- `rankedElements`: default ranking for page-level primary action discovery

New pure helpers:

- `summarizePage(observation): PageSummary`
- `rankElementsForIntent(input): RankedElement[]`
- `normalizeActionHistory(history, limit?): BrowserActionRecord[]`
- `isRepeatedAction(history, type, target): boolean`

`planBrowserAction()` returns the same public shape plus optional evidence:

- `reason`: short ranking reason
- `rankedTargets`: top ranked candidates
- `repeated`: true when no better non-repeated target exists

## Data Flow

1. `observeHtml()` parses the HTML in DOM order, extracts semantic elements, normalizes
   names, builds a bounded history, summarizes the page, and computes a default ranked
   list.
2. `planBrowserAction()` classifies intent, asks `rankElementsForIntent()` for candidates,
   prefers non-repeated actionable targets, and returns `noop` when no suitable target is
   available.
3. Tests prove the pure functions without launching a browser.

## Error Handling

The parser is best-effort and defensive. Malformed or partial HTML returns an observation
with empty or partial elements, never an exception for ordinary string input. Disabled
elements remain visible in observations but rank below actionable alternatives.

## Testing

Use TDD with focused unit tests:

- Observation recognizes semantic elements and summaries.
- Ranking chooses the best target by intent and semantic kind.
- Action history avoids repeating the same click/type target when an alternative exists.
- Default registry still excludes Browser tools.

Focused verification command:

`pnpm.cmd exec vitest run packages/coding-agent/test/unit/browser-observation.test.ts packages/coding-agent/test/unit/browser-planner.test.ts packages/coding-agent/test/unit/browser-runtime-profile.test.ts --reporter=verbose`

Full verification before commit:

`pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd build`, `pnpm.cmd test`,
`git diff --check`.

## Status Accounting

If D126 passes verification, update status docs honestly:

- Add D126 as Browser Tier-1 foundation evidence.
- Raise v2.0 only modestly if the code and tests prove the four Browser foundation pieces.
- Keep v1-v4 incomplete and keep Browser default exposure locked.
- Preserve the unrelated dirty Gate-1 current-workspace result files unless a separate
  evidence-hygiene task adopts them.
