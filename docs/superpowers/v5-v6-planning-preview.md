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
- v5.0 implementation is now ACTIVE: 19 evidence items across 4 themes + 1 cross-theme bridge. Theme 1: observability+auditability 2nd cycle complete (D-87 seed, D-88 integration, D-89 persistence, D-90 query, D-102 render dumpAuditLog). Theme 2: plugin governance 2nd cycle complete (D-91 vocabulary, D-92 actual usage on 19 default tools, D-93 query via ToolRegistry.listByCapability, D-100 cross-theme bridge buildCapabilityMatrix between ToolCapability and DistributionManifest, D-103 enforceProfilePolicy runtime policy gate). Theme 3: distribution/upgrade flow 2nd cycle complete (D-94 DistributionManifest typed constant + structural validator, D-95 compareVersions pure upgrade-check function, D-101 generateChangelog pure narrative generator comparing 2 manifests). Theme 4: production hardening 5-evidence set complete (D-96 formatFatalError pure defensive formatter + recordFatalEvent cross-theme bridge into v5.0 AuditLog D-87, D-97 installSignalHandlers SIGINT+SIGTERM handler with idempotent cleanup, D-98 installProcessUncaughtHandlers uncaughtException+unhandledRejection handler with defaultOnUncaught process-end, D-99 gracefulShutdown 3-step sequence beforeExit/record/onComplete with full defensive error handling, D-104 evaluateCrossInstanceRollback cross-instance decision function reading prior audit log via D-90 + checking last event kind + freshness window; emits proceed / rollback / no-evidence decision). Cross-theme bridge: D-105 buildPolicySnapshot orchestration layer reusing D-100 + D-101 + D-103 + D-104 into 1 unified PolicySnapshot struct. 5 红线 scope was intentionally modified once (D-88 additive) and is back to empty from D-89 onward. v6.0 master plan written per D-106: 4 themes (multi-agent safety + hosted/enterprise opt-in gates + distributed cross-instance coordination + advanced observability); entry criteria checklist 5/6 prereqs checked. v6.0 implementation STARTED per D-107+D-108+D-109+D-110: 5 evidence items (D-106 master plan + D-107 SubAgentId + SubAgent + SubAgentRegistry foundational type system + D-108 enforceSubAgentPolicy thin wrapper reusing D-103 + D-109 rollbackSubAgent pure function identifying sub-agent-owned events + marking with rolledBackAt + rollbackReason + D-110 buildSubAgentPolicySnapshot async orchestration unifying enforce + rollback); multi-agent safety seed 3 of 3 COMPLETE; v6.0 Theme 1 SEED + CROSS-BRIDGE COMPLETE (4 sub-sprints). v6.0 Theme 2 (hosted/enterprise opt-in gates) seed STARTED per D-111: 1 new enforceRateLimit pure per-tenant rate limiting function (TenantId branded type + RateLimitPolicy + decision allow/warn/deny + utilizationPercent + retryAfterMs); 1 of 3+ sub-sprints (D-111+ planned: billing/quota, SSO/OIDC, SIEM).
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
