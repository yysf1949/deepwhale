# V5/V6 Planning Preview

Generated: 2026-06-10

Status: In progress (first v5.0 evidence fixture D-87 recorded 2026-06-10)

Implementation is now ACTIVE: v5.0 BOTH gates reached (v1-v4 aggregate 65% AND v2.5 65%); the first v5.0 sub-sprint (D-87, AuditLog minimal seed) has produced 1 evidence fixture.

The v5.0 themes remain the same: production hardening, plugin governance, distribution and upgrade flow, observability and auditability. Future v5.0 sub-sprints (D-88+) will expand each theme with additional evidence fixtures.

## Gates

- v1-v4 evidence gaps must remain explicit before v5/v6 implementation starts.
- The default registry must remain coding plus Code Intel essentials unless a later explicit release gate changes it.
- Gate-1 preferred-100k, Gate-1.5, and production long-horizon evidence must not be inferred from fixture or module existence.
- v5.0 implementation allowed only when v1-v4 scorecard aggregate >= 65% AND v2.5 percent >= 65%.

## Gate Status (2026-06-10, D-86)

- v1-v4 aggregate percent: 65% (gate threshold: 65%, **REACHED 2026-06-10 D-86**)
- v2.5 percent: 65% (gate threshold: 65%, REACHED 2026-06-10 D-82)
- v2.5 implementation gate: reached
- **Aggregate implementation gate: REACHED 2026-06-10 D-86**
- v5.0 implementation is now ACTIVE: 11 evidence items across 4 themes. Theme 1: observability+auditability quartet complete (D-87 seed, D-88 integration, D-89 persistence, D-90 query). Theme 2: plugin governance 1st cycle complete (D-91 vocabulary, D-92 actual usage on 19 default tools, D-93 query via ToolRegistry.listByCapability). Theme 3: distribution/upgrade flow 1st cycle complete (D-94 DistributionManifest typed constant + structural validator, D-95 compareVersions pure upgrade-check function). Theme 4: production hardening 1st cycle complete (D-96 formatFatalError pure defensive formatter + recordFatalEvent cross-theme bridge into v5.0 AuditLog D-87, D-97 installSignalHandlers SIGINT+SIGTERM handler with idempotent cleanup). 5 红线 scope was intentionally modified once (D-88 additive) and is back to empty from D-89 onward.
- D-87 sub-sprint: AuditLog minimal seed (in-memory, append-only, deterministic timestamps). Next v5.0 sub-sprints: file-backed persistence / ToolLoopPolicy integration / CLI dump.

## V5.0 Production Hardening And Distribution

Planning themes:

- production hardening
- plugin governance
- distribution and upgrade flow
- observability and auditability

Entry criteria:

- v1-v4 scorecard has explicit evidence for remaining gate gaps.
- Gate-1 preferred or blocker is freshly documented.
- Gate-1.5 and Gate-2 interpretations remain honest.

## V6.0 Collaborative Agent Operations

Planning themes:

- collaborative multi-agent operations
- enterprise controls
- hosted service mode
- ecosystem scaling

Entry criteria:

- v5 production hardening has shipped with verification evidence.
- Multi-agent safety, audit, and rollback policies are tested.
- Hosted or enterprise surfaces have explicit opt-in and policy gates.
