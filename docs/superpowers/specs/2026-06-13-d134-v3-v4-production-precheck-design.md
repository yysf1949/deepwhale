# D134 V3/V4 Production Precheck Design

## Context

D133 closes the final v2.0 Tier-2 evidence row at a deliberately narrow boundary. The next
scorecard blockers are v3.0 and v4.0 production claims:

- v3.0 has a default-profile Gate-2 live fixture and reviewer gates, but not broad production
  long-horizon replay evidence across multiple scenarios.
- v4.0 has deterministic cross-session memory and TaskGraph fixtures, but not real cross-platform
  SIGKILL/restore evidence, Desktop/channel production wiring, or Agent OS orchestration proof.

The current public docs already warn that v1-v4 are not production-complete. D134 should make the
v3/v4 evidence boundary machine-readable so future work can close specific blockers without
inferring production readiness from module existence.

## Decision

Add a `v3-v4-production-precheck` release evaluator and evidence snapshot. The precheck is not a
release pass. It is a machine-readable status report that:

- passes existing v3.0 fixture evidence for Gate-2 and Reviewer gates,
- passes existing v4.0 deterministic cross-session evidence for memory and TaskGraph,
- blocks v3.0 production breadth until multi-scenario production replay evidence exists,
- blocks v4.0 cross-platform SIGKILL/restore until real platform evidence exists,
- repeats the default-registry invariant so non-coding surfaces stay opt-in,
- updates public status blocks from D134 to D135 without expanding default exposure.

## Evidence Boundary

D134 may count these as pass evidence:

- `packages/coding-agent/src/long-horizon/gate2.ts`
- `packages/coding-agent/test/unit/gate2-long-horizon.test.ts`
- `docs/superpowers/gate-2-long-horizon-live.json`
- `docs/superpowers/gate2-live-trace.json`
- `packages/coding-agent/src/reviewer/gates.ts`
- `packages/coding-agent/test/integration/tool-loop-policy.test.ts`
- `packages/coding-agent/src/agent/persisting-task-graph-recorder.ts`
- `packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts`
- `packages/coding-agent/src/memory/persistent-store.ts`
- `packages/coding-agent/test/unit/persistent-memory.test.ts`
- default registry source and invariant tests

D134 must keep these as blockers:

- broad v3.0 production long-horizon replay evidence,
- real v4.0 cross-platform SIGKILL/restore evidence.

## Non-Goals

- No Browser, Desktop, Channel, media, productivity, or marketplace default exposure.
- No claim that v3.0, v4.0, or v1-v4 are production-complete.
- No new live external automation runner.
- No Desktop/channel implementation.
- No replacing Gate-2 with mock evidence.

## Documentation

Create `docs/superpowers/v3-v4-production-precheck.{json,md}` and link it from README, ROADMAP,
and ROADMAP_DECISIONS current-status blocks. Update the scorecard next action from D134 to D135:

```text
D134 v3/v4 production precheck: machine-readable v3/v4 evidence matrix added; production breadth and cross-platform SIGKILL remain blockers.
Next implementation slice: D135 record multi-scenario v3.0 production long-horizon replay evidence without expanding default exposure.
```

## Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Scope check: one release evaluator, one test file, one evidence snapshot pair, and status docs.
- Overclaiming check: precheck is expected to fail overall because v3/v4 production blockers remain.
- Default exposure check: D134 reuses the narrow default invariant and does not touch registry setup.
