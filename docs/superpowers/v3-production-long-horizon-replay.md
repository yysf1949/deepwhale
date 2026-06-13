# V3 Production Long-Horizon Replay Evidence

Generated: 2026-06-13

Slice: D135

Scope: v3.0 production long-horizon replay suite

Evidence kind: v3-production-long-horizon-replay

Passed: true

Summary: D135 v3.0 production long-horizon replay suite passed: 3 default-profile scenarios replayed through `evaluateGate2Transcript()` with no mock source, no missing evidence, and no registry profile drift. This is replay evidence, not a new live external Gate-2 run.

## IMPORTANT: This is replay evidence, not a new live external Gate-2 run

D135 replays existing on-disk evidence through the same `evaluateGate2Transcript()` rules that gate live runs. It does not invoke a live LLM runner, does not produce a new `passed_live=true` record, and must never be cited as a new live Gate-2 completion proof.

## Suite overview

- Required scenario count: 3
- Scenario count: 3
- Passed scenarios: 3
- Failed scenarios: 0
- Blockers: (none)

## Scenarios

| Scenario ID | Source | Tool calls | Retries | Registry profile | Status | Caveat |
| --- | --- | ---: | ---: | --- | --- | --- |
| invoice-domain-repair-live-replay | live-llm-trace-redact | 31 | 0 | default | pass | Replay of the D46 redacted live trace; not a new live external Gate-2 run. |
| release-precheck-hardening-replay | precheck-snapshot-replay | 35 | 1 | default | pass | Replay of existing precheck snapshot evidence; v3.0 production breadth and v4.0 cross-platform SIGKILL/restore remain open in the underlying precheck snapshot. |
| cross-package-status-hygiene-replay | status-doc-fixture-replay | 38 | 0 | default | pass | Replay of cross-package status hygiene fixtures; v1-v4 scorecard remains gate-driven and incomplete per D-72 hygiene rules. |

## Evidence paths

- Replay evaluator source: `packages/coding-agent/src/long-horizon/replay.ts`
- Replay evaluator tests: `packages/coding-agent/test/unit/v3-production-replay.test.ts`
- Machine-readable replay snapshot: `docs/superpowers/v3-production-long-horizon-replay.json`
- v3.0 Gate-2 live trace (replay source 1): `docs/superpowers/gate2-live-trace.json`
- v2.0 Tier-1 precheck (replay source 2): `docs/superpowers/v2-tier1-precheck.json`
- v3.0/v4.0 production precheck (replay source 2): `docs/superpowers/v3-v4-production-precheck.json`
- v1-v4 evidence scorecard (replay source 3): `docs/superpowers/v1-v4-evidence-scorecard.json`
- Status-doc hygiene fixture (replay source 3): `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

## Suite rules

- Every scenario must use `registryProfile: 'default'`.
- Every scenario must pass `evaluateGate2Transcript()` (toolCalls in [30, 50], retries <= 5, no goal drift).
- Every scenario's `evidencePaths` must be present on disk.
- No scenario may declare a `mock` or `mock-only` source.
- Scenario ids must be unique across the suite.

## Default exposure boundary

- Default registry tool count: 21.
- D135 does not touch default registry setup.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- This replay evidence does not unlock default Browser, Desktop, Channel, media, or productivity surfaces.

## Non-goals

- D135 is not a new live external Gate-2 run.
- D135 does not claim v3.0, v4.0, or v1-v4 production completion.
- D135 does not expand default registry exposure.
- D135 does not implement Browser, Desktop, Channel, media, productivity, or hosted defaults.

## Next Actions

1. D136: record real cross-platform v4.0 SIGKILL/restore evidence without expanding default exposure.
2. Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.
