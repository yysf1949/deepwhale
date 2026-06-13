# D128 V2 Tier-1 Release-Gate Hardening Design

## Context

D126 and D127 added deterministic helper-layer evidence for the v2.0 Tier-1 themes:
Browser observation/planning, Memory Ranking, and Code Intelligence semantic fallback. The
scorecard still correctly says v2.0 is incomplete because helper evidence is not the same
as production Browser automation, visual grounding, or full release-gate proof.

D128 turns that boundary into a machine-readable precheck. The precheck should make the
current state easier to audit without expanding default tool exposure or claiming that
v2.0 is finished.

## Scope

D128 adds a narrow release-gate precheck:

- Check that Browser Tier-1 helper evidence from D126 is present and categorized as
  helper-layer evidence.
- Check that explainable Memory Ranking evidence from D127 is present.
- Check that Code Intel semantic fallback evidence from D127 is present.
- Check that default registry exposure remains narrow and does not leak non-coding opt-in
  tools.
- Keep the overall precheck failed/blocked until production Browser automation, visual
  grounding, and Tier-2 blockers have separate evidence.
- Record deterministic JSON/Markdown evidence under `docs/superpowers/`.

## Out Of Scope

- No new Browser runtime automation.
- No visual grounding implementation.
- No registry expansion.
- No v2.0 completion claim.
- No changes to unrelated Gate-1 current-workspace result files.

## Interface

Add `packages/coding-agent/src/release/v2-tier1-precheck.ts` with:

- `evaluateV2Tier1Precheck(input?: V2Tier1PrecheckInput): V2Tier1PrecheckResult`
- `DEFAULT_V2_TIER1_PRECHECK_EVIDENCE`
- `DEFAULT_ALLOWED_DEFAULT_TOOL_NAMES`
- typed check ids and status fields

The result includes:

- `milestone: 'v2.0'`
- `tier: 'Tier-1'`
- `passed: false` for the current repository state
- per-check records with `pass`, `blocked`, or `fail`
- evidence references for D126/D127 source and test files
- blockers for production Browser automation, visual grounding, and Tier-2 items
- default-exposure details including the current 21-tool default registry and the fact
  that `browser_action` and `browser_js` are coding-surface helpers, not production Browser
  completion proof

## Data Flow

1. Tests exercise the evaluator with the current default registry tool list.
2. The evaluator classifies evidence as helper-layer, release-gate, or blocker.
3. Required helper checks may pass, but required production checks remain blocked.
4. The final result is serialized into `docs/superpowers/v2-tier1-precheck.json` and
   summarized in `docs/superpowers/v2-tier1-precheck.md`.
5. Public status blocks and the v1-v4 scorecard point at the precheck and keep v2.0
   incomplete.

## Error Handling

The evaluator is pure and deterministic. Missing required evidence rows become `fail`.
Explicit unresolved blockers become `blocked`. Any default tool outside the allowed default
set becomes a failing default-exposure check. The precheck passes only when every required
check is `pass`, which is intentionally not true in D128.

## Testing

Use focused TDD tests:

- Current state returns `passed: false`.
- Browser, Memory Ranking, Code Intel, and default exposure helper checks pass.
- Production Browser automation and visual grounding remain blocked.
- A leaked default tool fails the default-exposure check.
- Removing required evidence fails the corresponding helper check.
- JSON evidence is machine-readable and matches the evaluator's high-level outcome.

Run focused verification before status updates, then full verification in the project order:

`pnpm.cmd typecheck`

`pnpm.cmd lint`

`pnpm.cmd build`

`pnpm.cmd test`

`git diff --check`

## Status Accounting

D128 may modestly raise v2.0 evidence because release-gate hardening becomes
machine-readable. It must still keep v2.0 below completion and point the next slice at
production Browser automation/visual grounding proof rather than v5/v6 expansion.
