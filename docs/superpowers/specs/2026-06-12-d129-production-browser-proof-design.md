# D129 Production Browser Proof Design

## Goal

Move the v2.0 Tier-1 gate forward by proving a production Browser automation contract and
visual-grounding evidence path without adding Browser, Desktop, Channel, media, or productivity
tools to default exposure.

## Context

D128 added `evaluateV2Tier1Precheck()` and proved helper-layer evidence for Browser Tier-1,
Memory Ranking, Code Intel semantic fallback, and narrow default exposure. The precheck still
blocks v2.0 on:

- production Browser automation proof
- visual grounding proof
- Tier-2 v2.0 blockers

D129 addresses only the first two blockers. Tier-2 remains blocked and v1-v4 remain incomplete.

## Approach

Add a pure TypeScript proof recorder in `packages/coding-agent/src/browser/production-proof.ts`.
The recorder will execute a caller-provided adapter over an ordered scenario:

1. navigate to a URL
2. perform at least one user interaction (`click` or `type`)
3. observe page content
4. capture a visual snapshot with dimensions, hash, non-blank ratio, and target rectangles

The adapter is injected, so this module does not depend on Playwright, Puppeteer, Browser MCP, or
the Codex desktop browser. That keeps the proof deterministic and testable while defining the
production contract that a real browser adapter must satisfy.

## Proof Criteria

`recordProductionBrowserProof()` returns a result with:

- `automationStatus: "pass"` when navigation, at least one interaction, observation, and all
  required steps succeed.
- `visualGroundingStatus: "pass"` when at least one successful visual snapshot has positive
  dimensions, a `sha256:` hash, a non-blank ratio above zero, and at least one target rectangle.
- `passed: true` only when both statuses pass and no step failed.
- `passed: false` with explicit blockers when opt-in is missing, the adapter is missing, a step
  fails, automation coverage is incomplete, or visual evidence is invalid.

The returned transcript records command kind, target, URL/title after each step, timing, and
summaries. The module stores no raw screenshot bytes; it records metadata suitable for gate
evidence.

## Release Precheck Integration

Update `evaluateV2Tier1Precheck()` so D129 evidence paths satisfy:

- `production-browser-automation`
- `visual-grounding`

The overall precheck remains `passed: false` because `tier2-blockers` remains blocked. The summary
must say Tier-1 production/visual evidence is present but v2.0 still is not release-ready.

## Documentation Evidence

Add:

- `docs/superpowers/v2-production-browser-proof.json`
- `docs/superpowers/v2-production-browser-proof.md`

Update README, ROADMAP, ROADMAP_DECISIONS, and the v1-v4 scorecard to record D129 honestly:

- v2.0 progress advances modestly.
- production Browser proof and visual grounding are no longer listed as missing Tier-1 blockers.
- Tier-2 v2.0 blockers remain explicit.
- default non-coding exposure remains frozen.

## Non-Goals

- Do not add Browser, Desktop, Channel, media, or productivity tools to the default registry.
- Do not add a runtime browser dependency.
- Do not claim v2.0 or v1-v4 completion.
- Do not store raw screenshot bytes in repository evidence.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Scope check: focused on one Browser proof recorder plus release-precheck/doc alignment.
- Ambiguity check: proof is an adapter-contract proof, not a live external-browser run.
