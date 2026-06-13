# V5/V6 Planning Preview

Generated: 2026-06-13

Status: In progress (v5.0 evidence D-87 through D-105 + D-137 + D-139 and v6.0 seed evidence D-106 through D-113 + D-138 recorded)

Implementation is now ACTIVE: v5.0 BOTH gates reached (v1-v4 aggregate 65% AND v2.5 65%); v5.0 has completed its 4-theme seed/bridge set through D-105 with additional observability (D-137 trace spans) and production hardening (D-139 bootstrap) evidence, and v6.0 seed implementation has started through D-113 with distributed coordination seed (D-138). This does not complete v1-v4 or unlock non-coding defaults.

The v5.0 themes remain the same: production hardening, plugin governance, distribution and upgrade flow, observability and auditability. Future v5.0 sub-sprints will expand each theme with additional evidence fixtures.

## Gates

- v1-v4 evidence gaps must remain explicit while v5/v6 seed implementation proceeds.
- The default registry must remain coding plus Code Intel essentials unless a later explicit release gate changes it.
- Gate-1 preferred-100k, Gate-1.5, and production long-horizon evidence must not be inferred from fixture or module existence.
- v5.0 implementation allowed only when v1-v4 scorecard aggregate >= 65% AND v2.5 percent >= 65%.

## Gate Status (2026-06-13, D-139)

- v1-v4 aggregate percent: 77% (gate threshold: 65%, **REACHED 2026-06-10 D-86**)
- v2.5 percent: 65% (gate threshold: 65%, REACHED 2026-06-10 D-82)
- v2.5 implementation gate: reached
- **Aggregate implementation gate: REACHED 2026-06-10 D-86**
- v5.0 implementation is ACTIVE: 21 evidence items across 4 themes + cross-theme bridges. Theme 1: observability+auditability 3rd cycle complete (D-87 seed, D-88 integration, D-89 persistence, D-90 query, D-102 render dumpAuditLog, D-137 trace spans with TraceSpanStore + branded types). Theme 2: plugin governance 2nd cycle complete (D-91 vocabulary, D-92 actual usage on 19 default tools, D-93 query via ToolRegistry.listByCapability, D-100 cross-theme bridge buildCapabilityMatrix between ToolCapability and DistributionManifest, D-103 enforceProfilePolicy runtime policy gate). Theme 3: distribution/upgrade flow 2nd cycle complete (D-94 DistributionManifest typed constant + structural validator, D-95 compareVersions pure upgrade-check function, D-101 generateChangelog pure narrative generator comparing 2 manifests). Theme 4: production hardening 6-evidence set complete (D-96 formatFatalError + D-97 installSignalHandlers + D-98 installProcessUncaughtHandlers + D-99 gracefulShutdown + D-104 evaluateCrossInstanceRollback + D-139 bootstrapHardening wiring into REPL). Cross-theme bridge: D-105 buildPolicySnapshot orchestration layer. 5 红线 scope was intentionally modified once (D-88 additive) and is back to empty from D-89 onward.
- v6.0 seed implementation is active: D-106 wrote the master plan, D-107 through D-110 shipped multi-agent safety seed and bridge work, D-111 through D-113 shipped hosted/enterprise opt-in gate seeds, and D-138 shipped distributed coordination seed (DistributedLockManager + DistributedEventAggregator). Remaining v6 work includes SIEM integration, Theme 2 cross-bridge, and advanced observability.

## V5.0 Production Hardening And Distribution

Active seed themes:

- production hardening (D-96 formatFatalError + D-97 installSignalHandlers + D-98 installProcessUncaughtHandlers + D-99 gracefulShutdown + D-104 evaluateCrossInstanceRollback + D-139 bootstrapHardening wiring into REPL)
- plugin governance (D-91 vocabulary + D-92 usage + D-93 query + D-100 capability matrix bridge + D-103 enforceProfilePolicy)
- distribution and upgrade flow (D-94 DistributionManifest + D-95 compareVersions + D-101 generateChangelog)
- observability and auditability (D-87 AuditLog seed + D-88 tool-loop integration + D-89 file-backed persistence + D-90 readAuditLog + D-102 dumpAuditLog + D-137 TraceSpanStore trace spans)

Entry criteria:

- v1-v4 scorecard has explicit evidence for remaining gate gaps.
- Gate-1 preferred or blocker is freshly documented.
- Gate-1.5 and Gate-2 interpretations remain honest.

## V6.0 Collaborative Agent Operations

Planning themes:

- multi-agent safety (D-107 SubAgentId + D-108 enforceSubAgentPolicy + D-109 rollbackSubAgent + D-110 buildSubAgentPolicySnapshot)
- hosted/enterprise opt-in gates (D-111 enforceRateLimit + D-112 enforceTenantQuota + D-113 validateOidcToken)
- distributed cross-instance coordination (D-138 DistributedLockManager + DistributedEventAggregator)
- advanced observability

Entry criteria:

- v5 production hardening has shipped with verification evidence.
- Multi-agent safety, audit, and rollback policies are tested.
- Hosted or enterprise surfaces have explicit opt-in and policy gates.
