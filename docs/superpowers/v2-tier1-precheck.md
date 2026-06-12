# V2 Tier-1 Precheck Evidence

Generated: 2026-06-12

Slice: D128

Milestone: v2.0

Tier: Tier-1

Passed: false

Summary: v2.0 Tier-1 helper evidence is present, but v2.0 is not release-ready.

## Checks

| Check | Status | Evidence | Caveat |
| --- | --- | --- | --- |
| Browser Tier-1 helper foundation | pass | D126 observation/planner sources and unit tests | Helper-layer evidence only; not live production automation. |
| Explainable Memory Ranking | pass | D127 ranking/store sources and unit tests | Deterministic local ranking evidence; not a full long-term memory system. |
| Code Intel semantic fallback | pass | D127 semantic-index and smart_search sources/tests | Heuristic lexical fallback; not embedding or LSP-grade semantics. |
| Default registry exposure invariant | pass | registry source + default-registry invariant test | Narrow default must remain coding plus Code Intel essentials. |
| Production Browser automation proof | blocked | none | production Browser automation proof is still missing |
| Visual grounding proof | blocked | none | visual grounding proof is still missing |
| v2.0 Tier-2 blockers | blocked | tracked separately | Tier-2 v2.0 blockers remain tracked separately |

## Default Exposure

- Default registry tool count: 21.
- `browser_action` and `browser_js` are coding-surface helpers in the default registry.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- This precheck does not unlock production Browser automation.

## Next Actions

1. D129: prove production Browser automation and visual-grounding behavior without expanding default exposure.
2. Keep Tier-2 v2.0 blockers separate from helper-layer evidence.
3. Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.
