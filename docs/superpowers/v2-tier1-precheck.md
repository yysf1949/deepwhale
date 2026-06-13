# V2 Tier-1 Precheck Evidence

Generated: 2026-06-12

Slice: D129

Milestone: v2.0

Tier: Tier-1

Passed: false

Summary: v2.0 Tier-1 production and helper evidence is present, but v2.0 is not release-ready.

## Checks

| Check | Status | Evidence | Caveat |
| --- | --- | --- | --- |
| Browser Tier-1 helper foundation | pass | D126 observation/planner sources and unit tests | Helper-layer evidence only; not live production automation. |
| Explainable Memory Ranking | pass | D127 ranking/store sources and unit tests | Deterministic local ranking evidence; not a full long-term memory system. |
| Code Intel semantic fallback | pass | D127 semantic-index and smart_search sources/tests | Heuristic lexical fallback; not embedding or LSP-grade semantics. |
| Default registry exposure invariant | pass | registry source + default-registry invariant test | Narrow default must remain coding plus Code Intel essentials. |
| Production Browser automation proof | pass | D129 production-proof source, unit tests, and evidence snapshot | Adapter-contract proof with transcript evidence; not default Browser exposure. |
| Visual grounding proof | pass | D129 visual snapshot metadata validation and evidence snapshot | Visual snapshot metadata proof; raw screenshot bytes are not stored. |
| v2.0 Tier-2 blockers | blocked | tracked separately | Tier-2 v2.0 blockers remain tracked separately |

## Default Exposure

- Default registry tool count: 21.
- `browser_action` and `browser_js` are coding-surface helpers in the default registry.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- This precheck does not unlock default Browser automation.
- Production Browser proof is adapter-contract evidence, not a live external Browser run.

## Next Actions

1. D130: close the next v2.0 Tier-2 blocker without expanding default exposure.
2. Keep Tier-2 v2.0 blockers separate from helper-layer evidence.
3. Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.
