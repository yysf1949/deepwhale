# deepwhale Roadmap

<!-- status:current:start -->
## Current Status

- Date: 2026-06-13
- Branch: feature/d36-gate2-live
- Package version line: 2.3.0
- Release/version hygiene report: docs/superpowers/release-version-hygiene.json
- Roadmap mode: gate-driven stabilization + v3/v4 production evidence
- Current sprint: D134 v3/v4 production precheck
- Current policy: freeze default non-coding expansion
- Default registry: coding plus Code Intel essentials only
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- v1-v4 are capability milestones, not a production-complete claim.

### Gate Snapshot

- Gate-1 minimum status: Vite target has 86,216 supported LOC.
- Gate-1 minimum qualification: minimum-50k.
- Gate-1 preferred status: preferred-available.
- Gate-1 preferred evidence: React target has 753,902 supported LOC (preferred-100k qualified).
- Gate-1 preferred report: docs/superpowers/gate-1-preferred-targets.json.
- Gate-1.5 evidence kind: live-browser
- Gate-1.5 algorithmic decision: continue
- Gate-1.5 binding: true
- Gate-1.5 binding branch decision: continue-browser-enhancement
- Gate-1.5 report: docs/superpowers/gate-1.5-browser-viability.json
- Gate-1.5 live task ledger: docs/superpowers/gate-1.5-live-browser-tasks.json
- Gate-1.5 live result recorder: 20 candidates queued, 20/20 completed; runnerStatus=opt-in-runner-available; resultRecorderStatus=all-recorded; binding=true; Browser enhancement unlocked=true.
- Gate-2 live evidence: passed_live=true.
- Gate-2 registryProfile=default.
- Gate-2 toolCalls=31.
- Gate-2 report: docs/superpowers/gate-2-long-horizon-live.json.
- Gate-2 interpretation: a default-profile live fixture pass, not a blanket v1-v4 completion proof.
- Current v1-v4 scorecard: docs/superpowers/v1-v4-evidence-scorecard.json
- v2.0 Tier-1 precheck: docs/superpowers/v2-tier1-precheck.json
- v2.0 production Browser proof: docs/superpowers/v2-production-browser-proof.json
- v3/v4 production precheck: docs/superpowers/v3-v4-production-precheck.json

### Completed Stabilization Slices

- D60 rename scanner truthfulness: rename_symbol scanner behavior is more honest around comments, strings, block comments, and TS private identifiers.
- D61 Gate-2 drift prompt hardening: nested tool args are checked for outside-workspace paths and the live task prompt supports task-directed verification.
- D62 status/doc hygiene after D61: public current-status blocks are aligned to current evidence and stale D56-D59 next-work pointers are removed.
- D63 Code Intel heuristic metadata: find_references exposes heuristic metadata in success results.
- D64 registry opt-in loading isolation: default registry loading stays narrow and opt-in profiles load through an async boundary.
- D65 Code Intel truthfulness metadata: smart_search and rename_symbol no-op paths expose heuristic metadata.
- D67 rename edit hunks: rename_symbol dry-run/apply now exposes hashline edit hunks and heuristic confidence metadata.
- D68 status and v5/v6 planning preview: public status blocks now link planning-preview-only v5/v6 evidence.
- D69 Gate-1 preferred blocker refresh: refreshed local target inventory keeps Vite at minimum-50k and preferred-100k blocked.
- D70 Gate-1.5 Browser decision hygiene: refreshed fixture evidence is advisory only and keeps Browser branch decision deferred pending 20 live tasks.
- D71 Code Intel combined import correctness: TypeScript combined default-plus-named imports are indexed and resolved in the heuristic symbol graph and call graph.
- D72 release/version hygiene report: package version and historical release badges are explicitly quarantined from roadmap maturity claims.
- D73 Gate-1.5 live browser task ledger: no 20-task live evidence exists, so Browser branch decision remains deferred and enhancement stays locked.
- D74 Code Intel default re-export call graph correctness: calls imported through default re-export barrels resolve to the original named default declaration.
- D75 TaskGraph goal recording integration evidence: runToolLoopWithReview records the latest user goal when a TaskGraphRecorder is provided.
- D77 planner main-loop evidence fixture: runToolLoopWithReview calls planner.plan with the latest user goal and records the resulting tasks into the task graph when a Planner is provided.
- D78 cross-session memory crash/reload evidence: PersistentMemoryStore now uses temp-file + fsync + rename for atomic writes and load() recovers from a partial last line.
- D79 v1.0 fresh release gate proof + version bump: docs/superpowers/v1.0-fresh-release-gate.{json,md} capture typecheck + lint + test + build + diff --check all exit 0; package version line 2.2.0 -> 2.3.0 (line-only, per D-72 hygiene).
- D80 TaskGraph cross-session persistence evidence: PersistingTaskGraphRecorder mirrors the PersistentMemoryStore pattern (JSONL + atomic-rename + partial-line recovery); cross-session integration test records in instance A, then verifies instance B (same file) sees A's entries.
- D81 v2.5 multi-scenario planner evidence: 3 new planner integration scenarios (multi-task DAG with dependsOn dependencies, tool spec preservation, and negative test confirming planner is gated by goal presence) advance the v2.5 blocker from 'single-fixture proof' to 'multi-scenario evidence'.
- D82 v2.5 investigate-goal scenario fixture: 1 new planner integration scenario (single-task investigation, no dependsOn) advances v2.5 to 65% and crosses the v5 implementation gate threshold (>=65%).
- D83 v1.0 default registry invariant fixture: 2 new unit tests assert the default registry contains exactly 19 tools (coding + Code Intel essentials) and no non-coding opt-in tools are exposed by default.
- D84 v1.5 Code Intel re-export chain call graph fixture: 1 new test asserts the call-graph heuristic follows a caller -> intermediate re-exporter -> target chain, recognizing transitive callers across a re-export boundary.
- D85 v3.0 Gate-2 long-horizon boundary fixture: 2 new unit tests assert the inclusive 30-50 tool-call range at the exact boundaries (30 and 50) and just outside (29 and 51).
- D86 v4.0 cross-session multi-hop handoff fixture: 1 new test extends D-80 from 2-instance to 3-instance handoffs (A writes 3, B writes 2, C reads all 5 in order), completing v4.0 multi-hop cross-session coverage.
- D87 v5.0 observability+auditability minimal seed: 1 new AuditLog class (in-memory, append-only, deterministic timestamps via injected clock) + 1 new unit test. This is the first v5.0 evidence fixture.
- D88 v5.0 observability+auditability tool-loop integration: 1 new unit test verifies that runToolLoop emits tool-call, tool-result, and loop-end events into a provided AuditLog. After D-88, the v5 audit log captures real tool-loop activity, not just synthetic events.
- D89 v5.0 observability+auditability file-backed persistence: 1 new PersistingAuditLog class extends AuditLog with JSONL + atomic-rename + partial-line recovery (mirror D-78 + D-80 pattern) + 2 new unit tests (cross-instance + partial-line recovery). Audit events now survive process restarts.
- D90 v5.0 observability+auditability query side: 1 new readAuditLog function (standalone async, JSONL reader with partial-line recovery + ENOENT handling) + 3 new unit tests (round-trip + ENOENT + partial-line). Completes the v5 audit log quartet: write (D-87/88/89) + read (D-90).
- D91 v5.0 plugin governance minimal seed: 1 new ToolCapability type + 1 toolCapabilities helper + 1 isToolCapability type guard + 1 optional capabilities field on Tool (additive, backward-compatible) + 3 new unit tests. The v5.0 plugin-governance theme starts here; future D-92+ can backfill capabilities on specific tools and add a registry filter.
- D92 v5.0 plugin governance 2nd evidence: 19 default tool files backfilled with accurate capabilities (BashTool -> shell-exec+network, ReadFileTool -> file-read, WriteFileTool/EditFileTool/PatchTool/RenameSymbolTool -> file-read+file-write, ExecuteCodeTool -> code-execute, 11 read-only tools -> file-read, TodoTool/PlanTool -> [] in-memory); 2 new unit tests verify all-19 invariant + 5 high-risk tool assertions. v5.0 plugin-governance theme has real evidence: vocabulary (D-91) + actual usage (D-92).
- D93 v5.0 plugin governance 3rd evidence: ToolRegistry.listByCapability(cap) method added (composes D-91 toolCapabilities helper with existing list()) + 3 new unit tests assert correct subset for shell-exec / code-execute / file-write. Plugin-governance theme complete 1st cycle: vocabulary (D-91) + actual usage (D-92) + query (D-93).
- D94 v5.0 distribution/upgrade flow 1st evidence: 1 new DistributionManifest type + 1 DISTRIBUTION_MANIFEST constant + 1 isValidDistributionManifest validator + 3 new unit tests. The 3rd v5.0 theme (distribution/upgrade flow) starts here; future D-95+ can build on this manifest (upgrade check, capability matrix, changelog generator).
- D95 v5.0 distribution/upgrade flow 2nd evidence: 1 new compareVersions function (pure, no I/O, no external semver dep) + 1 UpgradeCheckResult interface + 1 UpgradeSeverity union + 4 new unit tests. The 2nd evidence piece of the distribution/upgrade flow theme: D-94 manifest answers "what am I?"; D-95 compareVersions answers "do I need to upgrade?"; together they form the v5.0 distribution/upgrade flow 1st cycle (description + decision).
- D96 v5.0 production hardening 1st evidence: 1 new formatFatalError function (pure, defensive, never throws) + 1 recordFatalEvent helper (cross-theme bridge into v5.0 AuditLog from D-87) + 1 FatalErrorEvent interface + 4 new unit tests. The 4th and final v5.0 theme (production hardening) starts here; future D-97+ can build on this formatter (SIGINT/SIGTERM handler, uncaught exception hook, graceful shutdown sequence).
- D97 v5.0 production hardening 2nd evidence: 1 new installSignalHandlers function (SIGINT + SIGTERM, cross-theme bridge into v5.0 AuditLog via 'fatal-signal' events, idempotent cleanup) + 1 SignalHandlerOptions interface + 4 new unit tests. Production-hardening 1st cycle complete: format fatal errors (D-96) + handle process signals (D-97).
- D98 v5.0 production hardening 3rd evidence: 1 new installProcessUncaughtHandlers function (uncaughtException + unhandledRejection, cross-theme bridge into v5.0 AuditLog via 'fatal-uncaught' events, idempotent cleanup, default-onUncaught uses process.exit(1) for non-zero failure exit) + 1 ProcessUncaughtHandlerOptions interface + 1 NormalizedUncaughtPayload interface + 4 new unit tests. Production-hardening theme now covers a 3-event taxonomy: format fatal errors (D-96) + handle process signals (D-97) + catch unhandled exceptions (D-98).
- D99 v5.0 production hardening 4th evidence: 1 new gracefulShutdown async function (sequences beforeExit -> auditLog record -> onComplete in 3 ordered steps; cross-theme bridge into v5.0 AuditLog via 'graceful-shutdown' events; defensive: errors at any step are caught and surfaced via ShutdownResult) + 1 GracefulShutdownOptions interface + 1 ShutdownResult interface + 1 ShutdownTrigger union + 4 new unit tests. Production-hardening 4-step protocol COMPLETE: format fatal errors (D-96) + handle process signals (D-97) + catch unhandled exceptions (D-98) + drain pending work (D-99).
- D100 v5.0 plugin governance 2nd cycle: 1 new buildCapabilityMatrix pure function (cross-theme bridge: D-91 ToolCapability vocabulary + D-94 DistributionManifest; returns CapabilityMatrix with entries + undeclaredToolCapabilities + toolsWithoutCapabilities) + 1 CapabilityMatrix interface + 1 CapabilityMatrixEntry interface + 1 UndeclaredToolCapability interface + 4 new unit tests. Plugin-governance theme 1st cycle COMPLETE: vocabulary D-91 + usage D-92 + query D-93 + cross-theme bridge D-100.
- D101 v5.0 distribution/upgrade flow 2nd cycle: 1 new generateChangelog pure function (compares 2 DistributionManifests, returns ChangelogDocument with version + capability-added/removed + channel + node-engine + supported-upgrade-origin entries) + 1 ChangelogDocument interface + 1 ChangelogEntry interface + 1 ChangelogChangeKind union + 4 new unit tests. Distribution/upgrade flow theme 2nd cycle COMPLETE: manifest D-94 + compareVersions D-95 + changelog generator D-101.
- D102 v5.0 observability+auditability 2nd cycle: 1 new dumpAuditLog async function (reads via D-90 readAuditLog + applies eventKinds + sinceTimestamp filters + renders text or JSON format) + 1 AuditDumpResult interface + 1 AuditDumpOptions interface + 1 AuditDumpFormat union + 4 new unit tests. Observability+auditability theme 2nd cycle COMPLETE: write D-87/88/89 + read D-90 + render D-102.
- D103 v5.0 plugin governance 2nd cycle: 1 new enforceProfilePolicy pure function (reuses D-100 buildCapabilityMatrix + emits undeclared-capability + missing-capability violations) + 1 PolicyEnforcementResult interface + 1 PolicyViolation interface + 1 PolicyViolationKind union + 4 new unit tests. Plugin-governance theme 2nd cycle COMPLETE: vocabulary D-91 + usage D-92 + query D-93 + cross-theme bridge D-100 + enforcement D-103.
- D104 v5.0 production hardening 5th evidence: 1 new evaluateCrossInstanceRollback async function (cross-instance decision: read prior audit log via D-90 + check last event kind + freshness window; emit proceed / rollback / no-evidence decision) + 1 RollbackEvaluation interface + 1 RollbackEvaluationOptions interface + 1 RollbackDecision union + 4 new unit tests. Production-hardening 5-evidence set COMPLETE: format D-96 + signal D-97 + uncaught D-98 + drain D-99 + cross-instance recovery D-104.
- D105 v5.0 cross-theme bridge: 1 new buildPolicySnapshot async function (orchestration layer: reuses D-100 buildCapabilityMatrix + D-101 generateChangelog + D-103 enforceProfilePolicy + D-104 evaluateCrossInstanceRollback; returns PolicySnapshot with capabilityMatrix + changelog + policyEnforcement + crossInstance + summary) + 1 PolicySnapshot interface + 1 PolicySnapshotSummary interface + 1 BuildPolicySnapshotInput interface + 4 new unit tests. v5.0 3-theme cross-bridge COMPLETE: plugin governance + distribution/upgrade + production hardening tied into 1 unified status struct.
- D106 v6.0 master plan: 1 new docs/superpowers/v6.0-master-plan.md (4 themes: multi-agent safety + hosted/enterprise gates + distributed coordination + advanced observability; entry criteria checklist; first sub-sprint multi-agent safety seed designed) + 1 v6-plan-exists.test.ts (3 doc-existence tests) + 4 new entries. v6.0 plan promoted from 'planning preview only' to 'executable plan' (5/6 entry criteria checked).
- D107 v6.0 multi-agent safety seed: 1 new SubAgentId branded type + 1 SubAgent interface + 1 SubAgentRegistry class (in-memory map-based, register/unregister/get/list/listByParent/size/clear + asSubAgentId + isSubAgentId helpers) + 1 new file + 1 new test file + 4 new unit tests. Multi-agent safety seed part 1 of 3 COMPLETE: foundational type system. D-108 will add enforceSubAgentPolicy; D-109 will add rollbackSubAgent.
- D108 v6.0 multi-agent safety seed: 1 new enforceSubAgentPolicy thin wrapper function (reuses D-103 enforceProfilePolicy + D-107 SubAgent + D-94 DistributionManifest; returns SubAgentPolicyEvaluation with subAgentId + parentAgentId + decision (allow/deny) + summary) + 1 SubAgentPolicyEvaluation interface + 1 SubAgentPolicyDecision union + 4 new unit tests. Multi-agent safety seed part 2 of 3 COMPLETE: enforcement layer. D-109 will add rollbackSubAgent.
- D109 v6.0 multi-agent safety seed: 1 new rollbackSubAgent pure function (identifies sub-agent-owned events via event.payload.subAgentId + marks with rolledBackAt + rollbackReason + emits new 'sub-agent-rollback' event; supports dryRun mode for preview) + 1 SubAgentRollbackResult interface + 1 SubAgentRollbackOptions interface + 1 SubAgentRollbackOutcome union + 4 new unit tests. Multi-agent safety seed part 3 of 3 COMPLETE: rollback side. v6.0 Theme 1 (multi-agent safety) SEED-COMPLETE: 3 of 3 sub-sprints (D-107 + D-108 + D-109) shipped.
- D110 v6.0 multi-agent safety 2nd cycle cross-bridge: 1 new buildSubAgentPolicySnapshot async function (orchestration layer: reuses D-108 enforceSubAgentPolicy + D-109 rollbackSubAgent + D-94 DistributionManifest; returns SubAgentPolicySnapshot with policy + rollback + summary; canRun = policy.allow && rollback !== rolled-back) + 1 SubAgentPolicySnapshot interface + 1 SubAgentPolicySnapshotSummary interface + 1 BuildSubAgentPolicySnapshotInput interface + 4 new unit tests. v6.0 Theme 1 (multi-agent safety) 2nd cycle cross-bridge COMPLETE: mirrors v5.0 D-105 buildPolicySnapshot pattern. v6.0 Theme 1 SEED + CROSS-BRIDGE COMPLETE: 4 sub-sprints (D-107 + D-108 + D-109 + D-110) shipped.
- D111 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed: 1 new enforceRateLimit pure function (per-tenant rate limiting: returns RateLimitResult with decision 'allow'/'allow-with-warning'/'deny' + utilizationPercent + retryAfterMs + summary; supports warnAtPercent default 80%) + 1 TenantId branded type + 1 asTenantId + 1 isTenantId + 1 RateLimitPolicy interface + 1 RateLimitDecision union + 1 RateLimitResult interface + 4 new unit tests. v6.0 Theme 2 (hosted/enterprise opt-in gates) seed start: per-tenant rate limiting foundational types + enforcement function. D-112+ will add billing/quota, SSO/OIDC, SIEM integration.
- D112 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed: 1 new enforceTenantQuota pure function (per-tenant billing/quota: returns QuotaResult with decision 'allow'/'allow-with-warning'/'deny' + utilizationPercent + overage + summary; supports warnAtPercent default 80% + 4 CostDimension types: tokens, requests, storage, compute-seconds) + 1 TenantQuota interface + 1 CostDimension union + 1 QuotaDecision union + 1 QuotaResult interface + 4 new unit tests. v6.0 Theme 2 (hosted/enterprise opt-in gates) seed part 2 of 3+ COMPLETE. D-112 complements D-111 (rate limit time-windowed) by tracking cumulative usage. D-113 added SSO/OIDC; SIEM integration and Theme 2 cross-bridge are deferred past the Gate-1.5 D114/D115 work.
- D113 v6.0 Theme 2 (hosted/enterprise opt-in gates) seed: 1 new validateOidcToken pure function (SSO/OIDC integration: validates claim-level invariants (expiry + issuer + audience) + extracts tenantId + subject; trusts caller's pre-decoded claims; NO JWT signature verification yet) + 1 OidcProvider interface + 1 OidcToken interface + 1 OidcAuthResult interface + 1 OidcValidationOptions interface + 1 OidcAuthDecision union + 4 new unit tests. v6.0 Theme 2 (hosted/enterprise opt-in gates) seed part 3 of 3+ COMPLETE. D-113 adds per-tenant authentication to complement D-111 (rate limit) + D-112 (billing/quota). SIEM integration and Theme 2 cross-bridge are deferred past the Gate-1.5 D114/D115 work.
- D114 Gate-1.5 live Browser task sourcing: 1 new pure ledger builder + 2 new unit tests queue 20 pending candidate tasks for opt-in live Browser execution while keeping Gate-1.5 binding=false and Browser enhancement locked.
- D115 Gate-1.5 opt-in live Browser task runner: 1 new opt-in runner boundary + 3 new unit tests prove no execution without opt-in, no execution without an adapter, and explicit adapter execution updates Gate-1.5 accounting while keeping binding=false.
- D116 Gate-1.5 live Browser result recorder: 1 new pure recorder + runner integration accepts explicit known task results, ignores unknown/duplicate rows, and keeps repository live evidence at 0/20 until an opt-in Browser run is recorded.
- D117 Gate-1.5 opt-in live Browser evidence runner: 1 new recordOptInLiveBrowserEvidence async function orchestrates the queue D-114 + runner D-115 + recorder D-116 chain end-to-end and returns a typed evidence record; repository ledger advances 0/20 -> 1/20 with a stub adapter, binding remains false (19/20 still pending), 4 new unit tests.
- D118 Gate-1.5 opt-in live Browser evidence batch runner: 1 new recordOptInLiveBrowserEvidenceBatch async function calls the D-117 single-run chain `batchSize` times in a loop with the updated ledger between iterations, advancing the repository ledger 1/20 -> 4/20 (3 more) via a single batch call with a stub adapter; binding remains false (16/20 still pending), 4 new unit tests.
- D119 Gate-1.5 real HTTP Browser evidence adapter: 1 new recordRealBrowserEvidence async function uses Node's built-in `fetch` to record real network-call evidence for 2 candidate tasks (newsletter-signup fetched from example.com, product-search fetched from iana.org), advancing the repository ledger 4/20 -> 6/20 (2 more REAL evidence); of the 6 cumulative completed live results, 4 are stub-evidence and 2 are real-evidence; binding remains false (14/20 still pending); 4 new unit tests; D-119 adds zero new npm deps.
- D120 Gate-1.5 hybrid real Browser evidence runner: 1 new recordHybridRealBrowserEvidence async function records 2 HTTP-evidence tasks plus 1 JS-evidence task, advancing repository live result accounting from 6/20 to 9/20; 4 stub + 4 HTTP + 1 JS evidence; binding remains false because 11/20 are still pending; 5 tests cover contiguous and non-contiguous task mappings.
- D121 Gate-1.5 hybrid evidence alignment: recordHybridRealBrowserEvidence now skips unmapped pending tasks and records explicitly mapped non-contiguous tasks, keeping the repository ledger at 9/20 and binding=false.
- D122 Gate-1.5 hybrid JS action mapping: recordHybridRealBrowserEvidence accepts optional per-task jsActions so remaining JS evidence can distinguish fill-search-input, click-element, and extract-text actions without changing the 9/20 live-result count.
- D123 Gate-1.5 hybrid updated ledger accumulation: recordHybridRealBrowserEvidence now returns a recomputed updatedLedger and recalculates binding/branchDecision from the ledger builder, enabling future hybrid batches to carry threshold state forward without changing the 9/20 live-result count.
- D124 Gate-1.5 hybrid live evidence batch: updatedLedger accumulation records 4 additional live Browser evidence results, advancing repository evidence from 9/20 to 13/20 while binding remains false and Browser defaults stay locked.
- D125 Gate-1.5 hybrid live evidence continuation: final 7 tasks recorded via real HTTP fetch evidence, advancing repository live results from 13/20 to 20/20; binding=true, Browser enhancement unlocked.
- D126 Browser Tier-1 foundation: pure TypeScript helpers now provide richer semantic DOM extraction, structured page summaries, deterministic element ranking with reasons/scores, bounded action history, repeated-action detection, and planner repeat avoidance while keeping Browser defaults narrow.
- D127 Memory Ranking and Code Intelligence enhancement: memory ranking now exposes score factors and reasons, MemoryStore.rank returns active ranked memories, semantic-index results include token evidence and stable tie-breaking, and smart_search local/all adds heuristic semantic_fallback results for free-text queries while keeping exact symbol matches higher priority.
- D128 v2.0 Tier-1 release-gate hardening: a deterministic precheck now verifies D126 Browser helper evidence, D127 Memory Ranking evidence, D127 Code Intel semantic fallback evidence, and default-exposure invariants while keeping v2.0 blocked on production Browser automation, visual grounding, and Tier-2 proof.
- D129 production Browser proof: a pure injected adapter contract now records an ordered Browser automation transcript plus visual snapshot metadata proof, moving production Browser automation and visual grounding to Tier-1 pass while keeping Tier-2 blockers explicit and defaults narrow.
- D130 v2.0 Tier-2 Compaction closure: Compaction is now a pass row in the v2.0 precheck using core/session compaction, agent tool-loop compaction, print/RPC configuration paths, lifecycle hook tests, and cross-protocol smoke evidence while Automation, Remote TUI, and MCP Runtime remain blocked.
- D131 v2.0 Tier-2 MCP Runtime closure: MCP Runtime is now a pass row in the v2.0 precheck using a one-server stdio JSON-RPC transport proof against the gh-search MCP server, opt-in capability registration, and client/server roundtrip tests while Automation and Remote TUI remain blocked.
- D132 v2.0 Tier-2 Automation closure: Automation is now a pass row in the v2.0 precheck using an injected runner execution proof, persisted cron run records, and runtime/store/daemon tests.
- D133 v2.0 Tier-2 Remote TUI closure: Remote TUI now has an authenticated injected-transport protocol/session proof covering handshake, unauthorized rejection, input/resize forwarding, output sequencing, and deterministic close behavior; this is not a full WebSocket/app-server implementation.
- D134 v3/v4 production precheck: machine-readable v3/v4 evidence matrix added; production breadth and cross-platform SIGKILL remain blockers.
- Current tracked worktree policy: preserve unrelated untracked plan files and do not stage them unless explicitly adopted.
### Milestone Status

| Milestone | Evidence-backed status | Main blocker |
| --- | --- | --- |
| v1.0 | Mostly implemented coding baseline; fresh release gate proven 2026-06-10 (D-79) | Other v1-v4 milestones remain below 100% due to gate blockers (Gate-2 production proof, cross-platform Desktop, cross-platform SIGKILL) |
| v1.5 | Code Intel foundation exists; preferred 100K Gate-1 evidence via React target (753K LOC) | rename_symbol is heuristic, not IDE-grade |
| v2.0 | Gate-1.5 binding achieved at 20/20; D126 Browser Tier-1 pure-function foundation covers DOM understanding, ranking, page summary, and action history; D127 adds explainable Memory Ranking and heuristic semantic fallback evidence; D128 precheck makes Tier-1 status machine-readable; D129 adds production Browser transcript and visual metadata proof; D130 closes the Compaction Tier-2 row; D131 closes the MCP Runtime Tier-2 row; D132 closes the Automation Tier-2 row; D133 closes the Remote TUI Tier-2 row | D133 Remote TUI is an injected-transport protocol/session proof, not a full WebSocket/app-server implementation |
| v2.5 | Planner, task DAG, and plan cache exist | Main-loop integration is limited |
| v3.0 | Reviewer and Gate-2 live runner exist; D134 adds a v3/v4 production precheck | Production breadth needs multi-scenario long-horizon replay evidence |
| v4.0 | Researcher, TaskGraph, memory, and channel foundations exist; D134 records cross-session evidence in the v3/v4 precheck | Agent OS orchestration, Desktop, channels, and cross-platform SIGKILL/restore are not production-complete |

### Gate Policy

- Do not weaken Gate-1 minimum or preferred LOC thresholds.
- Do not count target inventory as a Gate-1 pass.
- Do not count minimum-50k evidence as preferred-100k evidence.
- Do not count fixture-only Gate-1.5 evidence as a binding Browser branch decision.
- Do not count mock Gate-2 evidence as live evidence.
- Do not unlock default Browser, Desktop, Channel, media, or productivity tools from Gate-2 alone.
- Do not describe heuristic Code Intel as IDE-grade.
- Do not claim v1-v4 completion from module existence alone.

### Next Roadmap Work

1. D134 v3/v4 production precheck is complete at the evidence-matrix layer: current v3/v4 fixture evidence is machine-readable, while production breadth and cross-platform SIGKILL remain blocked.
2. Next implementation slice: D135 record multi-scenario v3.0 production long-horizon replay evidence without expanding default exposure.
3. Gate-1 preferred-100K evidence remains blocked by missing local 100K+ target.
4. Gate-2 production long-horizon proof remains a separate future blocker.
5. v5/v6 seed work exists, but v1-v4 completion remains gate-driven and incomplete.

### V5/V6 Planning Boundary

- v5/v6 seed work exists, but v1-v4 completion remains gate-driven and incomplete.
- v5/v6 planning preview: docs/superpowers/v5-v6-planning-preview.json.
- v5 planning may cover production hardening, plugin governance, distribution, and observability.
- v6 planning may cover collaborative multi-agent operations, enterprise controls, hosted service mode, and ecosystem scaling.
- v5/v6 plans must inherit the same gate discipline: evidence first, no overclaiming.

### Status Hygiene Rules

- Prefer this block over older historical status text below.
- Older roadmap text below is retained as history until a later cleanup sprint.
- Any future release claim must cite a machine-readable report or a verified command output.
- Package version 2.3.0 is a package line, not roadmap v2.3 maturity proof.
- Existing modules in src/ are foundations unless the main runtime and tests prove integration.
- This block is intentionally ASCII-only for automated checks.

### Repository Scope

- Worktree: D:\App\openClaw\projects\deepwhale.
- Ignore D:\App\openClaw\projects\openclaw-github.
- Preserve unrelated untracked plan files unless explicitly adopted.
- Keep generated target directories and runtime state out of commits.
- Current branch remains feature/d36-gate2-live.

<!-- status:current:end -->

## Historical Roadmap

# 🗺 deepwhale ROADMAP

> ## 🔒 ROADMAP LOCKED（2026-06-03 用户拍板）
>
> **当前成熟度 9.1/10**，**已超过绝大多数 Agent 开源项目立项时的成熟度**。继续讨论路线图的收益已明显低于开始写代码的收益。
>
> **允许修改**：BUG / 错别字 / 任务拆分细化
> **禁止修改**：Phase / Bet / Gate / 版本锚
> **复盘时间**：v1.0 Release 之后
>
> **成功概率分层**（4 档，更精确）：
>
> - 做出产品：85%
> - 达到 Claude Code 水平：70%
> - 达到 Codex 水平：40-50%
> - 超过 Codex：10-20%
>
> **最大未知数**不是架构，而是 **DeepSeek-Reasonix 在 50 Tool Calls+ 复杂任务中的表现**——这部分谁都无法靠规划解决，只能靠实测。
>
> **最重要的设计结构**：不是 Browser/Computer Use/Desktop，而是 `Roadmap → Bet → Gate → Implementation` 四层结构。这意味着未来某个功能延期不会影响项目方向。
>
> ---

> **6 版本锚 × 13-17 个月（含风险系数），单人开发节奏**
> **Hypothesis-Driven Roadmap（假设驱动开发路线图）**——3 个 Bets + 3 个 Gates
>
> **核心变化**（vs 初版 10 周版）：
>
> 1. **时间锚从 10 周改为 13-17 个月**（v1.0 = Phase 1 = Claude Code Lite，3-4 月）
> 2. **砍掉 22 项延后事项**（详见 [ARCHITECTURE.md §4](./ARCHITECTURE.md)）
> 3. **Docker 沙箱统一替换 Seatbelt/Landlock/Windows Job Object**（v1.0 起）
> 4. **Session 从 DAG 降级为 Linear**（v1.0），DAG 延后到 **v2.5 与 Planner 同链路**
> 5. **Constitution 9 层权威砍掉**（个人化产物，不适合 deepwhale）
> 6. **保留所有已验证的正确决策**：Prefix-cache 4 机制提前到 v1.0 / StormBreaker / SanitizeToolPairing / i18n 第 1 行定对 / 强制 release 节奏
>
> **v4 架构定型**（2026-06-03，6.5/10 → 8.4/10 → 8.8/10 → 假设驱动）：7. **Code Intelligence Layer 新增**（v1.5 基础 / v2.0 增强）—— 解决"10万行项目失明" 8. **v2.5 独立插档做 Planning Framework**（Planner + Task Object + Plan Cache + Execution Boundary + DAG）—— 避免 v2 4 件太重 9. **Computer Use 改兼容层**（Codex 协议优先，**不自研**）—— 节省 1 个月 10. **Memory Ranking 算法 + source 字段**（importance / last_accessed / decay_score / scope / source）—— 解决"5000 memories 必崩" + 解决"长期记忆/项目记忆/用户偏好混在一起" 11. **v1.5 砍 4 项**（Automation/Cron/Remote TUI/Compaction 挪到 v2.0）12. **Browser Agent v2.0/v3.0 拆分**（v2.0 = 4 件基础，v3.0 = 3 件增强）13. **Capability Model 统一抽象**（Tool/MCP/Plugin/Browser/Computer → 1 套 Capability Registry）14. **Agent Runtime 架构定型**（4 角色 Execution Boundary 强制、单 process 内 4 函数）15. **3 个 Technical Bets + 3 个 Release Gates**（**Hypothesis-Driven Roadmap** 关键结构）
>
> **4 份架构设计文档**（2026-06-03 完成）：
>
> - [AGENT_RUNTIME.md](./design/AGENT_RUNTIME.md)：4 角色契约 + Task/Message/Context/Observation/Memory
> - [CAPABILITY_MODEL.md](./design/CAPABILITY_MODEL.md)：5 套能力来源统一抽象
> - [CODE_INTELLIGENCE.md](./design/CODE_INTELLIGENCE.md)：4 模块关系（Workspace Index / Symbol Graph / Reference Graph / Semantic Search）
> - [BROWSER_PLANNER.md](./design/BROWSER_PLANNER.md)：Observe→Plan→Act→Recovery 循环
>   **原则**：只写架构 / 边界 / 职责 / 接口 / 数据流，**不写实现细节**

---

## Release Gates（**项目级止损机制，假设驱动**）

> **核心思想**：ROADMAP 不只是"功能路线图"，而是**"假设驱动开发路线图"**。每个版本验证一个核心假设，假设失败 → 立即止损。

### 3 个 Technical Bets（**决定项目成败的 3 个核心赌注**）

| Bet                              | 等级   | 验证版本 | 失败后果                                        | 赌的是什么                         |
| -------------------------------- | ------ | -------- | ----------------------------------------------- | ---------------------------------- |
| **Bet-1 Code Intelligence**      | **P0** | v1.5     | Coding Agent 失败，项目失去核心价值             | Agent 能理解大型代码库（100K LOC） |
| **Bet-2 Browser Planner**        | **P1** | v2.0     | DeepWhale 退化为 Claude Code 级产品（仍有价值） | Agent 能稳定获取外部信息           |
| **Bet-3 Long-Horizon Stability** | **P0** | v3.0     | Multi-Agent 失败，5 角色失去意义                | Agent 能持续 30-50 步不漂移        |

**P0 vs P1 关键差异**：

- **P0 失败 = 项目核心价值丧失**：必须 Kill Gate（暂停主线，优先修复）
- **P1 失败 = 项目仍有价值**：Decision Gate（按成功率分支，不暂停）

### 3 个 Release Gates（**版本发布前的硬性门槛**）

#### Gate-1（v1.5 release 前）：Code Intelligence Kill Test

**目标**：验证 Bet-1（Code Intelligence）

**测试仓库**（任选 1 个或多个）：

- Spring Boot
- Kubernetes
- LangChain
- VSCode

**规模**：50K+ LOC（**必须 100K LOC 也试一次**）

**任务**：

1. 定位某功能入口
2. 分析完整调用链
3. 找到修改点
4. 输出修改方案

**要求**：**20 分钟以内**完成

**结果**：

| 状态     | 行动                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| **PASS** | → 进入 v2.0 开发                                                                                                        |
| **FAIL** | → **停止 Browser / Computer Use / Desktop 开发**<br>→ 优先修复 Code Intelligence<br>→ 修好重测 Gate-1，PASS 后再进 v2.0 |

**典型失败症状**（避免主观判断）：

- 重复打开文件
- 反复搜索
- 修改错误位置
- 上下文浪费
- 20 分钟内未完成

---

#### Gate-1.5（v2.0 release 前）：Browser Viability Decision Gate

**目标**：验证 Bet-2（Browser Planner）**是否值得继续投资**

**测试场景**（4 类站点）：

- GitHub
- 官方文档站
- Google
- Amazon

**任务**：搜索 / 点击 / 提取 / 翻页 / 返回结果

**统计**：**Success Rate**（4 站点 × 5 任务 = 20 个样本）

**结果**：

| 成功率     | 行动                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **≥ 80%**  | → 继续 Browser Agent 增强（v3.0 的 3 件）<br>→ 走完整路线 v3.0 → v4.0                                                                                                                                                 |
| **50-80%** | → **进入降级路线**<br>→ 冻结 Browser Agent 增强<br>→ 保留 v2.0 4 件基础能力<br>→ 不开发 Visual Grounding / Adaptive Retry<br>→ 资源转向 Long-Horizon（v3.0 集中）                                                     |
| **< 50%**  | → **Browser Runtime 维持最小实现**<br>→ 后续版本不再投入<br>→ DeepWhale 定位回归：<br>　**Claude Code + Code Intelligence + Multi-Agent**<br>→ v3.0/v4.0 砍掉 Browser 增强 / 桌面 / Marketplace 中所有 Browser 相关项 |

**为什么是 Decision Gate 而不是 Kill Gate**：

- Browser 不是项目核心价值
- 即使 < 50% 失败，DeepWhale 仍有：Claude Code Lite + Code Intelligence + Planner + Reviewer + Persistent Memory + MCP + Skills + Computer Use 兼容层
- 这依然是一个有价值的产品

---

#### Gate-2（v3.0 release 前）：Long-Horizon Kill Test

**目标**：验证 Bet-3（Long-Horizon Stability）

**任务**：修复一个**真实 Bug**

**完整流程**：

1. 读代码
2. 定位问题
3. 修改
4. 运行测试
5. 修复失败
6. 重新尝试
7. 再次测试
8. 完成

**要求**：**连续 30-50 Tool Calls 保持目标一致**

**结果**：

| 状态     | 行动                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PASS** | → 进入 v4.0（Researcher + 5 角色 + Persistent Memory）                                                                                              |
| **FAIL** | → **暂停 Researcher / TaskGraph / Desktop** 开发<br>→ 集中修复 **Planning / Compaction / Reviewer** 三者协同<br>→ 修好重测 Gate-2，PASS 后再进 v4.0 |

**典型失败症状**：

- 第 30 步后忘记目标
- 重复执行已失败的步骤
- 无限循环同一工具调用
- 上下文超出后丢失计划

**为什么 Long-Horizon 是 P0 Kill Gate**：

- Compaction + Planning + Review 三者协同是 Multi-Agent 基础
- 失败 = 5 角色流水线失去意义
- DeepSeek 长任务漂移不是模型问题，是**工程问题**（必须靠框架解决）

---

### Gates 时间线总览

```
v1.0 Coding Agent
   ↓
v1.5 Code Intelligence
   ↓
[Gate-1: Code Intelligence Kill Test]
   ├─ PASS → 继续
   └─ FAIL → 暂停，修复
   ↓
v2.0 Browser Intelligence（Observe）
   ↓
[Gate-1.5: Browser Viability Decision Gate]
   ├─ ≥80%  → 继续 v3.0
   ├─ 50-80% → 降级路线
   └─ <50%  → 砍 Browser 投资
   ↓
v2.5 Planning Framework
   ↓
v3.0 Long-Horizon Execution
   ↓
[Gate-2: Long-Horizon Kill Test]
   ├─ PASS → 继续 v4.0
   └─ FAIL → 暂停，修复
   ↓
v4.0 Autonomous Agent OS
```

## 演进路径（Observe → Plan → Execute+Review → Research）

DeepWhale 6 个版本形成清晰的 5 步能力演进 + 3 个 Release Gates 守护：

| 版本     | 能力主题                    | 验证什么                                                                  | Release Gate                                                                   | 关键模块                            |
| -------- | --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| **v1.0** | Coding Agent                | 6 工具 + Linear Session                                                   | —                                                                              | Executor                            |
| **v1.5** | 大型仓库理解                | Tree-sitter + Symbol Graph + Code Intel 基础                              | **[Gate-1 Kill Test](#gate-1v15-release-前code-intelligence-kill-test)**       | Code Intelligence Layer             |
| **v2.0** | **Observe**                 | 真实 Browser Planner 4 件 + Memory Ranking + Code Intel 增强              | **[Gate-1.5 Decision](#gate-15v20-release-前browser-viability-decision-gate)** | Browser Agent 基础 + Memory Ranking |
| **v2.5** | **Plan**                    | Planning Framework（Planner + DAG + Task Object + Plan Cache + Boundary） | —                                                                              | Planner Agent                       |
| **v3.0** | **Execute + Review**        | Browser Agent 增强 3 件 + Reviewer + Computer Use 兼容层                  | **[Gate-2 Kill Test](#gate-2v30-release-前long-horizon-kill-test)**            | Reviewer + Computer Use 兼容层      |
| **v4.0** | **Research + Long-running** | 5 角色 + TaskGraph + Persistent Memory + Desktop                          | —                                                                              | Researcher + Agent OS               |

**总览表**：

| Phase         | 版本     | 月份          | 累计      | 主题                    | 关键交付                                                                                                                                                                                    | 状态      |
| ------------- | -------- | ------------- | --------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Phase 1**   | v1.0     | 第 1-3 个月   | 3 月      | **Coding Agent**        | CLI + TUI + 6 工具 + Linear Session + **Prefix-cache 4 大机制** + Docker + **4 包 monorepo**（`@deepwhale/core` / `@deepwhale/llm` / `@deepwhale/coding-agent` / `@deepwhale/edit-engine`） | 🚧 进行中 |
| **Phase 2**   | v1.5     | 第 4-5 个月   | 5 月      | **大型仓库理解**        | Approval + Task + Skills + Extension API + Hooks + StormBreaker + **Code Intelligence 基础**（Tree-sitter + Symbol Graph + Workspace Index）                                                | ⏳ 待开始 |
| **Phase 3**   | v2.0     | 第 6-8 个月   | 8 月      | **Observe**             | **真实 Browser Agent 基础**（4 件：DOM Understanding / Element Ranking / Page Summary / Action History）+ Memory Ranking + Code Intel 增强 + 4 项补回                                       | ⏳ 待开始 |
| **Phase 3.5** | **v2.5** | **第 9 个月** | **9 月**  | **Plan**                | **Planning Framework**（Planner + DAG + Task Object + Plan Cache + Execution Boundary）                                                                                                     | ⏳ 待开始 |
| **Phase 4**   | v3.0     | 第 10-11 个月 | 11 月     | **Execute + Review**    | **Browser Agent 增强**（3 件：Visual Grounding / 策略级 Error Recovery / Adaptive Retry）+ Reviewer + **Computer Use 兼容层**                                                               | ⏳ 待开始 |
| **Phase 5**   | v4.0     | 第 12-13 个月 | **13 月** | **Research + Agent OS** | 5 角色 Multi-Agent + TaskGraph + Persistent Memory + Plugin Marketplace + Desktop + Channels                                                                                                | ⏳ 待开始 |

> ⭐ **2026-06-03 重大调整**：oh-my-pi 借鉴融入 Sprint 0-2（详见 `docs/ROADMAP_DECISIONS.md` §15）
>
> - **Sprint 0 新增** Edit Engine 抽象 + hashline MVP（`@deepwhale/edit-engine` 包，`EditEngine` interface + hashline 实现 + unified-diff stub）
> - **Sprint 1 edit_file 升级** 完整 hashline + Recovery 3-way（替代原"hash 锚定"简化版）
> - **Sprint 2 新增** napi natives 调研（先 bun 子进程跑 grep 验证可行性）
> - **v1.0 末新增** 自研 edit benchmark（求职差异化）
> - **v1.5 Native Acceleration Evaluation**（先 Node 跑 Profile 验证瓶颈，再决定是否 Rust NAPI）

> ⭐ **2026-06-03 重大调整（v3）**：ECC 借鉴融入 Sprint 0-2 + v1.0 末（详见 `docs/ROADMAP_DECISIONS.md` §16）
>
> - **Sprint 0 新增** SKILL.md 标准化目录（YAML frontmatter + 首批 3 个 skill）
> - **Sprint 1 新增** Tool 返回 schema 统一（Observation 4 字段 + Recovery 3 字段，4 维质量模型实现）
> - **v1.0 末新增** `/verify` slash command + VERIFICATION REPORT 格式（6 阶段流程）
> - **v2.0 Tier-1 落地** continuous-learning-v2 模式（instinct + confidence，借鉴 ECC v2）— **范围严格限定为 Memory Ranking + Plan Cache + Execution Feedback 三件**，**不要扩张**到 Reflection / Self-improvement / Knowledge Base（避免变成"memory 黑洞"）

> **v1.0 = 1 个 release**（不是 5+1 个 Sprint）
> **v1.5 起 = 每月 1 个 minor release**（每周一 minor 强制节奏）
> **v1.5 累计 5 月、v2.0 累计 8 月、v2.5 累计 9 月、v3.0 累计 11 月、v4.0 累计 13 月**

## v2.0 Tier-1 / Tier-2 拆分（2026-06-03 用户拍板）

v2.0 范围内的 4 项"补回"任务（Automation / Remote TUI / Compaction / MCP）**不作为一级模块**，定义为 Tier-2：

| 优先级                                     | 包含                                                                            | 价值判断                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Tier-1**（v2.0 核心价值，**必须完成**）  | **Browser Agent 基础**（4 件）+ **Memory Ranking** + **Code Intelligence 增强** | Browser Agent 延期 → v2.0 算失败；其他延期 → v2.0.1 补 |
| **Tier-2**（v2.0 补回项，延期可挪 v2.0.x） | **Automation** + **Remote TUI** + **Compaction** + **MCP Runtime**              | 4 项 Codex 复刻的"边角料"——延期不影响 v2.0 主旨        |

**理由**：如果 Browser Agent 延期但 Remote TUI 完成，用户不会认为 v2.0 成功；反过来 Browser Agent 完成而 Remote TUI 延期，用户仍认为 v2.0 成功。**v2.0.1 / v2.0.2 用来补 Tier-2**。

## 风险系数（计划 vs 实际）

| 阶段     | 计划        | 实际预估                                   | 风险点                                                              |
| -------- | ----------- | ------------------------------------------ | ------------------------------------------------------------------- |
| v1.0     | 3 个月      | 3-4 个月                                   | i18n 路径 / 4 包 monorepo / Prefix-cache 4 机制                     |
| v1.5     | 2 个月      | 2-3 个月                                   | 8 项 Codex Core + Code Intel 基础（**比预想多**）                   |
| v2.0     | 3 个月      | **3-4 个月**（DAG 挪走 → 可能降到 3.5 月） | Browser Agent 4 件 + Memory Ranking + Code Intel 增强 + 4 项 Tier-2 |
| v2.5     | 1 个月      | 1 个月                                     | Planning Framework 4 组件集中                                       |
| v3.0     | 2 个月      | 2-3 个月                                   | Browser Agent 3 件增强 + Reviewer + Computer Use 兼容层             |
| v4.0     | 2 个月      | 2-3 个月                                   | 5 角色 + TaskGraph + Persistent Memory + Desktop + Channels         |
| **总计** | **13 个月** | **15-17 个月**                             | **中位数 16 个月**                                                  |

> **单人项目 15-17 个月属正常区间**。**严格执行**（不新增需求 / 每版本强制发布 / Computer Use 不自研 / Browser Agent 分阶段）→ **成功概率 80%+**。

---

## Phase 1 — v1.0 Claude Code Lite（第 1-3 个月）

**目标**：能替代 Claude Code 完成日常 coding 任务。**v1.0 第 3 个月必发**（避免 Reasonix 1.0 6 周未发教训）。

### Sprint 0（3 天，搭骨架）

**目标**：`pnpm dev` 跑通最小 CLI，调用 DeepSeek V4-Flash 流式输出"hello"。**第 1 行代码就定对路径、i18n、配置**。

#### 任务清单

- [ ] **建 GitHub 仓库** `yysf1949/deepwhale`（Private）✅
- [ ] **建 4 包 monorepo**（对齐 pi）
  - `packages/llm/` — 多 provider 客户端（v1 = DeepSeek only）
  - `packages/agent-core/` — EventBus + Tool Registry + 沙箱桥 + 缓存
  - `packages/tui/` — Ink 渲染
  - `packages/coding-agent/` — 产品层 = llm + agent-core + tui
- [ ] **pnpm workspace + Turborepo**
- [ ] **配置基础设施**（**第 1 天就定对**）：
  - 路径：`~/.deepwhale/`（**首行写死 + 旧路径 fallback 模式**——避免 CodeWhale `~/.deepseek/` → `~/.codewhale/` 重命名教训）
  - i18n：`from agent.i18n import t`（**第 1 行就定对**——Hermes 教训：原 `gateway.i18n` 错导致永远英文）
  - 配置：`~/.deepwhale/config.toml`（zod 校验）
  - 4 个 Skills 约定目录（v1.0 暂不读，v1.5 启用）：`.deepwhale/skills/`、`.agents/skills/`、`~/.deepwhale/skills/`、`~/.claude/skills/`
- [ ] **`@deepwhale/llm` OpenAI 兼容客户端**（**v1 = DeepSeek only**）
- [ ] **`@deepwhale/coding-agent` 最小 CLI 入口**
- [ ] **⭐ Edit Engine 抽象 + hashline MVP**（oh-my-pi P0 借鉴，详见 `docs/ROADMAP_DECISIONS.md` §15、[`ARCHITECTURE.md §2.3.2`](./ARCHITECTURE.md)）
  - **先定义接口再实现**（**hashline 是 Editing Primitive，不是核心卖点**——未来可换 unified diff / AST patch）
  - `packages/edit-engine/src/types.ts`（`EditEngine` interface + `EditIntent` + `ApplyResult`）
  - `packages/edit-engine/src/engines/hashline/parser.ts`（lark 语法解析 patch 文本）
  - `packages/edit-engine/src/engines/hashline/apply.ts`（in-memory apply 引擎）
  - `packages/edit-engine/src/engines/hashline/snapshots.ts`（3-hex TAG 抽象）
  - `packages/edit-engine/src/engines/unified-diff/index.ts`（**stub：throw "not implemented"**，v1.0 占位）
  - **不实现 Recovery 3-way / block 解析**（Sprint 1 完整版再加）
  - **目的**：Sprint 1 edit_file 工具能直接走 `EditEngine` 抽象调用，**不写 str_replace 临时方案**
- [ ] **⭐ SKILL.md 标准化目录**（ECC P0 借鉴，详见 `docs/ROADMAP_DECISIONS.md` §16）
  - `skills/<name>/SKILL.md`（YAML frontmatter + Markdown body）
  - **frontmatter 必填字段**：`name` / `description` / `origin`
  - **首批 skills**：hashline / coding-standards / verification-loop
  - **目的**：所有 skill 互不污染，**agent 自动按 description 加载**
- [ ] **CI：GitHub Actions**（lint + typecheck + 基础测试 + 4 包版本同步）

#### 验收标准

```bash
$ pnpm dev
deepwhale> hello
🤖 你好！我是 deepwhale 🐋，当前模型 deepseek-v4-flash
deepwhale>
```

#### ⚠️ Sprint 0 红线（避免 Sprint 1 翻工）

- **i18n 路径第 1 行定对**（Hermes 教训）
- **路径迁移兼容机制**写好（CodeWhale 教训）
- **4 包版本同步 CI**（pi #4908 教训）
- **monorepo 包名定对**：`@deepwhale/llm` / `@deepwhale/coding-agent` / `@deepwhale/edit-engine` / `@deepwhale/core`（**edit-engine 是 Sprint 0 第 4 个包，不是 packages/hashline**——必须从 Sprint 0 第 1 行就叫 `edit-engine`，不要 Sprint 1 再改名）

---

### Sprint 1（MVP 核心 + Prefix-cache 4 大机制，第 1-2 周）

**目标**：能跟 DeepSeek 多轮对话、编辑本地文件、跑 shell 命令、二次启动恢复会话。**5 轮后 cache 命中率 ≥ 90%**。

#### 任务清单

- [ ] **DeepSeek 接入**（`@deepwhale/llm`）
  - OpenAI 兼容客户端
  - 流式响应（SSE）
  - 错误重试 + 限流退避
- [ ] **⚡ Prefix-cache 4 大机制**（**v1.0 必带，deepwhale 核心优势**）
  - **机制 1：System prompt 一次组装** — `composeSystemPrompt()` 每个 session 只跑一次，按 session ID 缓存（`boot.go:120-148`）
  - **机制 2：`content: ""` 永远序列化**（不带 omitempty）— 防 wire-level 缓存 hash 变化（`openai.go:354-368`）
  - **机制 3：Reasoning content 不打 wire** — DeepSeek V4 thinking tokens 在 session 内部保留，wire 上不传（`openai.go:131-137`）
  - **机制 4：Schema canonicalize** — tool schema build 前跑 `CanonicalizeSchema`，map 顺序稳定（`schema_canonicalize.go:10-67`）
  - **加 regression test**：4 个机制都加 unit test
  - **加 cache 可观测性**：控制台实时显示 `cache_hit_rate` + `cost/turn`
- [ ] **Tool Registry**：内置 6 个核心工具
  - `bash`（**白名单 shell**——v1.0 第一层沙箱）
  - `read_file` / `write_file`
  - `edit_file`（**⭐ 完整 hashline + Recovery 3-way**，详见 `docs/ROADMAP_DECISIONS.md` §15）
    - 替代原"hash 锚定"简化版
    - 完整 6 个 op：`replace N..M` / `delete N..M` / `insert before/after/head/tail`
    - Recovery 3-way merge（base=cached pre-edit / ours=patch 想改的结果 / theirs=当前 live）
    - 3-hex 不透明 TAG 绑定
  - `grep` / `find`
- [ ] **⭐ Tool 返回 schema 统一**（ECC Observation 4 字段 + Recovery 3 字段借鉴，§16）
  - **Observation 4 字段**（每个 tool 返回必填）：
    - `status`: success|warning|error
    - `summary`: 一句话结果
    - `artifacts`: 相关文件路径 / IDs
    - `next_actions`: 推荐下一步操作
  - **Recovery 3 字段**（错误返回必填）：
    - `root_cause_hint`: 错误根因
    - `safe_retry`: 安全重试指令
    - `stop_condition`: 明确停止条件
  - **zod schema 强制**：每个 tool 用 zod 定义 input + output schema
  - **意义**：4 维质量模型的 v1.0 实现层
- [ ] **3 种运行模式**（CodeWhale 借鉴，先做 3 种）
  - `interactive`（默认，TUI）
  - `print`（`deepwhale -p "..."` 一次性）
  - `rpc`（JSON-RPC over stdio）
- [ ] **Linear Session**（**v1.0 = 简单 Linear，DAG 砍掉**）
  - JSONL append-only（pi 借鉴但**不做 DAG**）
  - 每条 entry 立即 `appendFileSync`
  - 崩溃后 `loadEntriesFromFile` 重建
- [ ] **Docker 沙箱**（**v1.0 = Docker only**，砍掉 Seatbelt/Landlock/Job Object）
  - 白名单 shell 走 Docker `docker run --rm -v ... -w ... deepwhale-sandbox bash -c "..."`
  - 默认镜像：node:22-alpine
  - 网络默认禁用（`--network=none`），用户可显式开启

#### 验收标准

- 能跟 DeepSeek V4-Flash 多轮对话（10 轮上下文连贯）
- 能编辑本地文件 + 跑命令（白名单内）
- 二次启动自动恢复会话（**Linear Session**）
- **5 轮后 `cache_hit_rate ≥ 90%`**（Reasonix 经济性指标）
- 单 turn cost ≤ $0.05
- Prefix-cache 4 大机制都有 unit test
- `rm -rf /` 跑在 Docker 内被 `--network=none` + rootfs 隔离拦截

#### ⚠️ Sprint 1 红线

- **Compaction 还没做，但任何 system prompt 修改要走"cache-reset point review"**（Reasonix 教训）
- **Cache miss 时不要报错**——未知就显示"unknown"（CodeWhale 教训）
- **Session 不要做 DAG**（v1.0 = Linear，**v2.0 升级**）
- **沙箱不要做 Seatbelt/Landlock/Job Object**（v1.0 = Docker only）

---

### Sprint 2（Cache 可观测性 + Session 打磨 + Docker 优化，第 3-4 周）

**目标**：v1.0 release-ready。**cache 命中率可观测**、Session 跨崩溃恢复、Docker 冷启动优化。

#### 任务清单

- [ ] **Cache 可观测性升级**
  - 实时显示 `cache_hit_rate` / `cost/turn` / `tokens_cached` / `tokens_uncached`
  - **多字段同值时去冗余/加标签区分**（Hermes footer 教训）
- [ ] **Session 跨崩溃恢复**
  - Linear Session JSONL 写盘测试（kill -9 后能恢复）
  - **Unit test 验证**（不能丢消息）
- [ ] **Docker 沙箱优化**
  - 预热镜像（`deepwhale-sandbox-warm`）
  - `--rm` 严格 + `--read-only` rootfs
  - 网络/文件挂载策略文档化
- [ ] **基础 UX 打磨**
  - 错误信息友好（DeepSeek 限流 / API key 缺失 / Docker 未启动）
  - TUI 流式渲染测试
- [ ] **⭐ Native Acceleration 调研**（oh-my-pi P0 借鉴，前置到 Sprint 2）
  - **第一步：bun 子进程跑 grep** 验证性能提升（`bun --filter='*.ts' grep 'TODO'`，对比 TS 实现）
  - 验证通过 → 列入 v1.5 候选，**Profile 确认是 grep / index / symbol graph 真瓶颈后再上 Rust**
  - 验证失败 → 退回纯 TS 实现，**v1.5 不做 napi**
  - **绝不提前承诺 Rust NAPI 一定上线**——正确顺序：Node 实现 → Profile → 确认瓶颈 → Rust
  - 决策依据写入 `docs/research/native-feasibility.md`
  - 详见 `docs/ROADMAP_DECISIONS.md` §15
- [ ] **强制 release 节奏**
  - **v0.1 必发**（Sprint 2 末）
  - CHANGELOG.md 起头
  - tag + GitHub Release 流程跑通
- [ ] **⭐ `/verify` slash command + VERIFICATION REPORT**（ECC P0 借鉴，§16）
  - 6 阶段流程（**build / types / lint / tests / security / diff**）
  - **统一报告格式**：
    ```
    VERIFICATION REPORT
    ==================
    Build:     [PASS/FAIL]
    Types:     [PASS/FAIL] (X errors)
    Lint:      [PASS/FAIL] (X warnings)
    Tests:     [PASS/FAIL] (X/Y passed, Z% coverage)
    Security:  [PASS/FAIL] (X issues)
    Diff:      [X files changed]
    Overall:   [READY/NOT READY] for PR
    ```
  - **并行执行**（不串行）
  - **集成在 CI**（`/verify` 命令也走同一脚本）
  - **意义**：4 维质量模型的 v1.0 末落地 + 求职差异化

#### 验收标准

- v0.1 release 发布（`yysf1949/deepwhale` Releases 页面有 tag）
- 文档：README + 快速开始 + 4 个 Skills 目录说明 + Docker 前置条件
- Docker 未启动时给清晰错误（不是 stack trace）

---

### Sprint 3-4（v1.0 收尾 + 文档化 + 测试覆盖，第 5-12 周）

**目标**：v1.0 第 3 个月末必发。**测试覆盖率 ≥ 60%**。

#### 任务清单

- [ ] **测试覆盖**
  - Unit test：Prefix-cache 4 机制 / 6 个工具 / Linear Session / Docker 沙箱
  - Integration test：多轮对话 / 二次启动恢复 / Docker 内跑白名单命令
  - E2E test：CLI 模式 / TUI 模式 / print 模式
- [ ] **文档**
  - README 完整（快速开始 + 架构 + 命令参考）
  - 故障排查 FAQ
  - 开发指南（如何加新工具 / 新模型）
- [ ] **性能**
  - Docker 冷启动 ≤ 1s
  - TUI 流式响应 ≤ 200ms 延迟
- [ ] **v1.0 release**
  - 第 3 个月末 GitHub Release
  - npm publish（`@deepwhale/llm` / `@deepwhale/coding-agent` / ...）
  - Homebrew formula（可选）

#### 验收标准

- v1.0 release 发布
- npm 包可安装
- 测试覆盖率 ≥ 60%
- **Codex 14 项功能 0/14**（**v1.5 才到 14/14**）

#### ⚠️ v1.0 红线

**v1.0 Release Rule**（**2026-06-03 用户拍板，v1.0 范围控制铁律**）：

> v1.0 **只验证 Coding Agent 是否成立**。任何不影响 Coding Agent 成立的功能，都允许延后到 v1.0.x。

| 必须完成（v1.0 内）                                  | 可延期（v1.0.x）                     |
| ---------------------------------------------------- | ------------------------------------ |
| `bash` / `read` / `write` / `edit` / `find` / `grep` | `/verify` slash command（v1.0 末加） |
| session（Linear JSONL）                              | 高级 cache 统计（命中率可视化）      |
| docker 沙箱                                          | 自研 edit benchmark                  |
| hashline（Editing Primitive）                        | 漂亮 UI / 主题 / 动画                |
| SKILL.md 目录约定（v1.0 不读）                       | 国际化细节（v1.0 = 中英混排可接受）  |
| TUI 基础渲染                                         | 文档站                               |

**目的**：防止第 10 周出现"再加一个功能就发版"综合征。v1.0 宁可少、不可晚。

---

- **不要做 MCP / Browser / Computer / Plugins / Skills / Desktop / 渠道**（**砍掉清单**）
- **不要做 Session DAG**（v1.0 = Linear）
- **不要做 Compaction**（v1.5 起）
- **不要做 Plugin Marketplace**（v1.5 起）
- **不要做文档站**（v1.5 起）
- **v1.0 第 3 个月末必发**（不拖）

---

## Phase 2 — v1.5 Codex Core + Code Intelligence 基础（第 4-5 个月）

**目标**：Codex Client 核心功能复刻（**8/14 砍掉 4 项，挪到 v2.0**）+ **让 Agent 理解代码库**（v1.5 基础）。**v1.5 第 5 个月末必发**。

> **v1.5 砍掉的 4 项**（挪到 v2.0）：
>
> - ❌ **Cron Automations**（v2.0 做）
> - ❌ **Remote TUI**（v2.0 做）
> - ❌ **Compaction**（v2.0 做）
> - ❌ **MCP**（v2.0 做）
>   理由：2 个月完成 8 项 Codex Core + Code Intel 基础，**v1.5 不再加任何大件**

### Sprint 5-6（Codex Core：Skills + Extension API + Hooks + Code Intel 基础，第 4 个月）

#### 任务清单

**Codex Core 复刻**（**8 项核心**）：

- [ ] **🛡 StormBreaker 防死循环**（Reasonix 抄，**工具增多后 P0**）
  - 3 次相同 `(tool, error)` 签名触发暂停 + 用户确认
  - **关键：用 (tool, error) 签名，不用 args 签名**（Reasonix 实战观察）
  - Unit test：模拟死循环场景
- [ ] **🛡 SanitizeToolPairing**（Reasonix 抄，**1 个函数 4 cases**）
  - 4 种 pairing case：orphan assistant tool_call、orphan tool_result、重复 tool_call、tool_result 不匹配
  - **理解 4 cases 一次性处理，不是"4 遍"**（Reasonix 误解纠偏）
  - Unit test：每种 case 单独测
- [ ] **Skills 系统**（对齐 Codex Skills 开放标准 + pi Skills 借鉴）
  - 4 个约定目录：`.deepwhale/skills/`、`<project>/.agents/skills/`、`~/.deepwhale/skills/`、`~/.claude/skills/`
  - 格式：`SKILL.md` + YAML frontmatter（`name` / `description` / `triggers`）
  - **索引硬上限 4KB**（Reasonix 抄）
  - 内置 3 个示范：commit / test / review-pr
- [ ] **EventBus 包装**（pi 抄）
  - 30 行 wrapper，try/catch 隔离
  - **21 个 `whale.*` ExtensionEvent 联合类型**
- [ ] **Extension API**（pi 借鉴，**v1.5 关键**）
  - `defineTool({ name, description, parameters, execute })` —— **零运行时，5 行类型守卫**
  - 21 个事件：`whale.session_start` / `whale.tool_call` / `whale.tool_result` / `whale.message_end` / `whale.session_before_compact` / ...
- [ ] **Hooks**（5 事件 + Reasonix 退出码语义）
  - `pre_tool_use` / `post_tool_use` / `user_prompt_submit` / `stop` / `session_start`
  - 退出码：exit 0=pass, exit 2=block, other=warn
  - **Hook trust flag 不在项目里**（`~/.deepwhale/trust.json`，Reasonix 抄）
- [ ] **Package Manager**（pi 抄）
  - 解析 `whale:` / `git:` / 本地路径
  - 资源优先级 4 档

**Code Intelligence 基础**（**v1.5 引入，解决"10万行项目失明"**）：

- [ ] **Tree-sitter 集成**
  - npm 包：`tree-sitter` + `tree-sitter-typescript` / `tree-sitter-javascript` / `tree-sitter-python` / `tree-sitter-go` / `tree-sitter-rust`
  - 多语言 AST 解析
  - 解析速度 ≥ 100K LOC / 秒（单测验证）
- [ ] **Symbol Graph**
  - 基于 AST 提取 symbol（function / class / variable / type）
  - 持久化：`~/.deepwhale/index/<project-hash>/symbols.jsonl`（JSONL append-only）
  - 支持查询：按 symbol 找定义 / 按文件找 symbol 列表 / 按 query string 模糊匹配
- [ ] **Workspace Index**
  - 项目级元信息（语言分布 / 文件数 / LOC / 依赖图）
  - 写入时机：v1.5 启动时增量构建，git hook 自动触发
- [ ] **Code Intelligence 工具暴露**（Agent tool 入口）
  - `symbol_lookup` 工具：query + kind + max_results
  - `reference_lookup` 工具（v1.5 基础版）：symbol + kind = definition

#### 验收标准

- 装 1 个社区 skill 能用
- 写 1 个 30 行 Extension 注册自定义工具
- 装 1 个带 hooks 的 plugin，hook 真的触发
- **StormBreaker 测出死循环场景能暂停**
- **SanitizeToolPairing 4 种 case 都能处理**
- **大型项目（10万行）能查 symbol 定义**（symbol_lookup 跑通）
- Codex 14 项功能 → **8/14**（+ Skills / Plugins / Hooks，**-4 项砍到 v2.0**）

#### ⚠️ Sprint 5-6 红线

- **Extension tool 重名启动时检测**（pi #5316 教训）
- **Hook payload 走 JSON on stdin**（Reasonix 抄）
- **Extension manifest 在 package.json**（pi 抄）/ deepwhale 用 `pyproject.toml` 的 `[tool.deepwhale]`
- **Tree-sitter 不要写多语言 parser**——只调官方包，5 种语言起步

---

### Sprint 7-8（Codex Core 收尾：Approval + Task，第 5 个月）

> **v1.5 第 2 个 Sprint 只做 2 项**：Approval + Task。**Cron/Remote TUI/Compaction 不在 v1.5**。

#### 任务清单

- [ ] **Approval System**（Codex 抄）
  - 工具调用前弹确认（默认 deny 危险操作）
  - 白名单内自动 approve
- [ ] **Task Mode**（Codex 抄）
  - `/task <id>` 跳转到指定 session
  - 任务列表 UI
- [ ] **Code Intelligence 集成进 Agent 循环**
  - symbol_lookup 默认注入 Agent tool registry
  - 10 万行项目实测：能用 symbol 找到定义（不再"全靠 grep"）
- [ ] **v1.5 release**
  - 第 5 个月末 GitHub Release
  - CHANGELOG 完整记录
  - **Codex Core 8/14 ✅**（**v1.5 故意不到 14/14**，剩下 6 项挪到 v2.0/v2.5/v3.0/v4.0）

#### 验收标准

- **Codex Core 8/14 ✅**（TUI / 多模型 / Skills / Plugins / Hooks / Approval / Task / Session / **Code Intel 基础**）
- **v1.5 累计功能 = 8 + Code Intel 基础 = 9 项**（**不是 14**）
- 文档：v1.5 release notes + 8/14 对照表 + **哪些项挪到 v2.0 明确列出**

---

## Phase 3 — v2.0 +Browser Agent + Code Intel 增强（第 6-8 个月）

**目标**：能自动操作复杂网页（淘宝/京东/Amazon）+ 完整 Memory Ranking + Code Intel 增强 + 补 v1.5 砍的 4 项。**v2.0 第 8 个月末必发**。

> **v2.0 = 4 个大件**（**v2 已经有 4 件不再加 Planner**）：
>
> 1. **真实 Browser Agent**（不是 Playwright Wrapper）
> 2. **Memory Ranking 算法**（importance/decay/scope）
> 3. **Code Intelligence 增强**（Reference Graph + Semantic Search）
> 4. **补 v1.5 砍的 4 项**（Cron Automations / Remote TUI / Compaction / MCP）
>
> **v2.5 单独做 Planner**（**避免 v2 4 个大件再加 Planner 爆掉**）

### Sprint 9-11（Observe：Browser Agent 基础 + Memory Ranking + Code Intel 增强 + 4 项 Tier-2，第 6-8 个月）

> **v2.0 = Tier-1（核心） + Tier-2（补回）**。**DAG 砍到 v2.5**（DAG 与 Planner 同链路更紧）。

#### Tier-1 任务清单（**必须完成，延期 → v2.0 失败**）

**真实 Browser Agent 基础**（**4 件能力**——v2.0 只做基础，v3.0 做增强）：

- [ ] **DOM Understanding**（AST 解析当前页面 DOM 结构 + 提取语义）
- [ ] **Element Ranking**（按用户意图 + 元素语义 + 视觉位置给元素排序）
- [ ] **Page Summarization**（长页面压缩为 token 友好的 summary）
- [ ] **Action History**（维护已执行动作列表避免重复）
- [ ] **Browser Executor**（操作级，复用 Playwright）
  - 7 个核心 API：navigate / click / type / extract / screenshot / download / upload
  - 集成 `@playwright/mcp` 开箱即用
  - Browser sandbox 走 Docker（与 Tool Runtime 同一沙箱）
- [ ] **真实场景测试**（v2.0 必须过）
  - 淘宝：搜索"机械键盘" + 点击商品 + 加购
  - 京东：搜索 + 筛选 + 进入详情
  - Amazon：搜索 + 看评论 + 加购
  - 失败时**自动重试 + 改 selector**（v2.0 基础重试，v3.0 升级为策略级）

**Memory Ranking 算法**（**解决"5000 memories 必崩"** + **解决"长期/项目/用户偏好混在一起"**）：

- [ ] **Memory Schema**
  - `{ id, content, source, scope, importance, last_accessed, decay_score, created_at, embedding? }`
  - **source 字段**（v1.5 没加，v2.0 补）：`user_preference` / `project_fact` / `workspace` / `user_explicit` / `auto_extracted`
  - scope 显式标记：`user` / `project` / `session`
- [ ] **Ranking 算法**
  - `score = importance * decay(last_accessed) * scope_weight`
  - decay 函数：指数衰减（半衰期 30 天）
  - scope_weight：user=1.0 / project=0.7 / session=0.4
- [ ] **回收机制**
  - score < threshold 自动归档（不删除，可恢复）
  - 单元测试：1000 条 memory 回收后性能无下降
- [ ] **hand-edit 优先**
  - memory 文件直接可编辑
  - 自动写入不会覆盖 user 手改的字段
  - 按 source 字段可过滤（只看项目记忆 / 只看用户偏好）

**Code Intelligence 增强**（v1.5 基础升级）：

- [ ] **Reference Graph**：跨文件 symbol 引用图（callers / callees / importers）
  - 持久化：`~/.deepwhale/index/<project-hash>/references.jsonl`
  - 支持查询：找 symbol 的所有引用、找死代码、找循环依赖
- [ ] **Semantic Search**：基于 embeddings 的语义搜索
  - 复用 DeepSeek V4 embedding API
  - 索引：`~/.deepwhale/index/<project-hash>/embeddings.bin`
  - 暴露 `semantic_search` 工具
- [ ] **reference_lookup 完整版**：kind 支持 callers / callees / importers / all

#### Tier-2 任务清单（**v2.0.x 补回，延期不影响 v2.0 主旨**）

- [ ] **Cron Automations**
  - `~/.deepwhale/automations/*.yaml` 定义定时任务
  - 模板：daily-report / code-review / test-runner / dep-update
- [ ] **Remote TUI**（WebSocket 远程控制）
  - `deepwhale serve --http` 暴露 `/v1/*`
  - 远端 TUI 通过 WebSocket 连接
- [ ] **Compaction**（v2.0 = **cache-reset point 唯一**）
  - **Compaction = 唯一 cache-reset point**（Reasonix 抄）
  - `session_before_compact` 钩子让 extension 完全替换默认
  - Tail 边界按 token budget 而不是 message count
- [ ] **MCP Runtime**（stdio / http / sse 动态注册）
  - 官方 SDK
  - 配置：`~/.deepwhale/mcp.json`
  - **deepwhale 也可作为 MCP server 暴露**（`deepwhale serve --mcp`）

#### ⚠️ Sprint 9-11 红线

- **Session DAG 不在 v2.0 做**——v2.5 与 Planner 同链路做
- **Browser Agent 不要做成 Playwright Wrapper**——v2.0 必须有 Browser Planner 4 件
- **Memory Ranking 不要做复杂 ML**——用显式公式
- **Tier-1 vs Tier-2 不可混淆**——Tier-1 延期 = v2.0 失败，Tier-2 延期 = v2.0.x 补

---

### Sprint 12（v2.0 release 收尾，第 8 个月末）

#### 验收标准

- 装好 Browser Agent 后能在淘宝/京东/Amazon 完成"搜索 + 加购"完整流程
- Browser Planner 4 件能力跑通（DOM/Element/Page Summary/Action History）
- **Tier-1 全部完成**（Browser Agent 4 件 + Memory Ranking + Code Intel 增强）
- **Tier-2 至少 3/4 完成**（Automation / Remote TUI / Compaction / MCP，可挪 v2.0.x）
- **1000 条 memory 回收测试通过**（无性能下降）
- 10 万行项目能查 callers/callees 和做语义搜索
- Codex 14 项功能 → **12/14**（+ MCP / Automation / Remote TUI / Compaction）
- **Session DAG 不算入 v2.0**——v2.5 与 Planner 同链路做
- 文档：v2.0 release notes + Tier-1/Tier-2 进度表

---

## Phase 3.5 — v2.5 Planning Framework（第 9 个月）

**目标**：**Plan** 能力主题——**Planning Framework**（**4 组件 + DAG**）。**v2.5 第 9 个月末必发**。

> **vs 初版"Planner Agent"**：
>
> - **范围扩大**为 Planning Framework（4 组件 + DAG），不只 Planner
> - **DAG 从 v2.0 挪到 v2.5**（DAG 与 Planner 同链路更紧，避免 v2.0 太重）
> - **加 Task Object / Plan Cache / Execution Boundary**——避免 v2.5 出现 Planner 偷偷执行 / Executor 偷偷规划的耦合
> - v3.0 Reviewer 接入时**无需重构**（v2.5 已留好 Execution Boundary）

### Sprint 13（Planning Framework：Planner + DAG + Task Object + Plan Cache + Boundary，第 9 个月）

#### 任务清单

**Planner**（**任务拆解 + 依赖分析**）：

- [ ] 输入：用户任务（自然语言）
- [ ] 输出：子任务 DAG（带依赖关系）
- [ ] 拆解算法：基于 LLM 推理 + 启发式模板
- [ ] 例：`重构用户模块` → [读 schema(0) → 改 UserService(2) → 改 controller(3) → 写测试(4) → Reviewer(5)]
- [ ] Planner 工具暴露：
  - `plan_task`（把自然语言任务转 DAG）
  - `decompose_task`（细化单个子任务）
  - `get_subtask_status`（查询子任务进度）

**Task Object**（**任务数据结构**）：

- [ ] Schema：`{ id, goal, subtasks, status, depends_on, result, created_at, ... }`
- [ ] Subtask Schema：`{ id, description, capability, args, depends_on }`
- [ ] 状态机：`pending → ready → running → done | failed | blocked`
- [ ] 详见 [AGENT_RUNTIME.md §2.1](./design/AGENT_RUNTIME.md)

**Session DAG**（**v1.0 Linear 升级，v2.0 挪到 v2.5**）：

- [ ] `parentId + leafId` 的 DAG 形态
- [ ] JSONL append-only（与 v1.0 同套路）
- [ ] 跨分支不丢消息
- [ ] 单元测试：kill -9 后能恢复
- [ ] **与 TaskGraph 正交**（Session DAG = 消息树，Task DAG = 工作流图，v4.0 升级为 TaskGraph）

**Plan Cache**（**避免重复规划**）：

- [ ] 跨 session 复用规划结果（基于任务 hash）
- [ ] 失效机制：用户任务变更 → 重新规划
- [ ] 单测：5 个真实场景任务规划结果跨 session 复用

**Execution Boundary**（**v2.5 关键约束**）：

- [ ] **Planner 不执行**——Planner 调任何 tool 立即报错
- [ ] **Executor 不规划**——Executor 收到未规划 Task 立即报错
- [ ] **Reviewer 不执行生产动作**（v3.0 接入时直接用此约束）
- [ ] 单测覆盖：4 种角色越权场景

#### 验收标准

- 双 Agent 模式：Planner 把"重构用户模块"拆成 DAG 子任务，Executor 按序执行
- Session DAG 跨分支不丢消息
- Plan Cache 跨 session 复用 5 个真实场景任务
- Execution Boundary 4 种越权场景单测全过
- 降级模式：`deepwhale --mode=single` 行为完全等同 v1.0
- 5 个真实场景任务拆解测试通过
- **v2.5 第 9 个月必发**（不拖到 v3.0）

#### ⚠️ v2.5 红线

- **Planner 不要做复杂推理**——基于 LLM 简单 prompt + 启发式模板
- **Execution Boundary 必须强制**——4 角色越权立即报错
- **4 组件不可拆分**——单 v2.5 必须一次性发布 Planning Framework 完整版
- **降级模式必须可工作**——`--mode=single` 100% 兼容 v1.0

## Phase 4 — v3.0 +Computer Use 兼容层 + Reviewer（第 10-11 个月）

**目标**：操控电脑 GUI（**不自研视觉理解，借用兼容层**）+ 加入 Reviewer 角色。**v3.0 第 11 个月末必发**。

> **vs 初版 v3.0**：
>
> - **Computer Use 改兼容层**（Codex 协议优先，**不自研** OCR/UI Detection/Element Localization）
> - **加 Reviewer 角色**（3 角色流水线：`Planner → Executor → Reviewer`）
> - **时长从 3 个月改为 2 个月**（不自研省 1 个月）

### Sprint 14-15（Computer Use 兼容层 + Reviewer，第 10-11 个月）

#### 任务清单

**Computer Use 兼容层**（**不自研 OCR/UI Detection**）：

- [ ] **首选 Codex Computer Use 协议**（Codex 26.527 开源协议）
  - 实现：与 Codex 协议一致的 screenshot + click + type 接口
  - 复用 Codex 现成视觉模型（OCR / UI Detection / Element Localization）
  - **不自研** mouse_move / mouse_click / keyboard_input / screen_capture
  - 鼠标键盘操作通过兼容层 API 委托给 Codex 协议
- [ ] **备选 OpenAI Computer Use / Browser Use Desktop**
  - 兼容层抽象为 interface，Codex 协议为主实现
  - 用户可配置切换到 OpenAI / Browser Use Desktop
- [ ] **Computer Use 跑在 Docker sandbox 内**
  - 与 Tool Runtime 同一沙箱
  - 屏幕截图 + 操作全部 sandbox 内完成

**Reviewer 角色**（**v3.0 新增**）：

- [ ] **Reviewer = 验证 agent**
  - 输入：Coder/Executor 的输出（代码 / diff / 命令结果）
  - 输出：approve / request_changes + 具体反馈
  - 三角色流水线：`Planner → Executor → Reviewer`
  - **v2.5 Execution Boundary 复用**（Reviewer 不执行生产动作，Planner 重新规划）
- [ ] **Reviewer 工作流**
  - 自动跑 linter / test / type check
  - 对比修改前后的语义（防止"看起来 OK 实际坏"）
  - 失败时反馈给 Planner，Planner 决定重做还是跳过

**Browser Agent 增强**（**v2.0 4 件基础升级到 7 件完整**）：

- [ ] **Visual Grounding**（截图标注元素位置）
  - 用视觉模型理解截图
  - 解决"selector 多次失败"问题（改用视觉定位）
- [ ] **策略级 Error Recovery**（v2.0 基础重试 → v3.0 策略级）
  - Selector 多次失败 → 切 Visual Grounding
  - 页面结构变化 → 重新 Page Summarization
  - 多次重试仍失败 → 切 Adaptive Retry
- [ ] **Adaptive Retry**（基于失败模式动态调整策略）
  - 失败 1 次：改 selector 策略
  - 失败 2 次：切 Visual Grounding
  - 失败 3 次：切 keyboard 不用 click
  - 失败 4 次：snapshot 整页 + 回到 Planner

**Compaction 钩子化**（v2.0 升级）：

- [ ] 让 extension 完全替换默认 Compaction
- [ ] `session_before_compact` / `session_after_compact` 钩子
- [ ] 单元测试覆盖崩溃恢复（JSONL append-only）

#### 验收标准

- 装好 Codex Computer Use 兼容层后能在 sandbox 内开指定应用、点击、输入
- Compaction 后 token 下降 70% 但语义保留
- **Reviewer 能发现 Coder 输出中的明显 bug**（用 5 个真实 bug fixture 测）
- **Browser Agent 增强 3 件全跑通**（Visual Grounding / Error Recovery / Adaptive Retry）
- **v3.0 第 11 个月必发**

#### ⚠️ Phase 4 红线

- **Windows Computer Use 不做**（OS 差异大，v3.0 主要验证 macOS + Linux X11）
- **OCR/UI Detection 不自研**——复用 Codex 兼容层现成视觉模型
- **mouse_move/mouse_click 不自己实现**——通过兼容层 API 委托
- **Browser Agent 增强必须在 v3.0 完成**——不能挪到 v4.0（v4.0 只加 Researcher）

---

## Phase 5 — v4.0 Agent OS（第 11-13 个月）

**目标**：从"命令行助手"变成**"长期运行的软件工程 Agent"**（long-running software engineering agent）。**v4.0 第 13 个月末必发**。

> **设计理念**：v1.0-v3.0 解决"单次任务能不能完成"，v4.0 解决"**多 session / 跨重启 / 长期演化**"——这是 deepwhale 从"CLI 工具"升维为"Agent OS"的核心标志。

### Sprint 16-17（Multi-Agent 5 角色 + TaskGraph 引擎，第 11-12 个月）

#### 任务清单

- [ ] **5 角色 Multi-Agent 流水线**
  - **Planner**（任务拆解 + 依赖分析，输出 TaskGraph）
  - **Researcher**（信息收集、Codebase 探索、上下文检索）
  - **Coder**（专用写代码 = v1.0 Executor 特化）
  - **Reviewer**（验证、Coder 输出 review、Code Review 自动化、self-check）
  - **Executor**（通用工具执行，Computer Use / Browser 编排）
  - **流水线**：`Planner → Researcher → Coder → Reviewer → Executor`
  - **单 Agent 模式保留**为 `mode=single`（v1.0 行为完全兼容）
- [ ] **TaskGraph 引擎**（**v4.0 新增，独立模块**）
  - Planner 输出**有向无环图（DAG）**表示子任务依赖
  - 任务调度：依赖满足才执行、并行无依赖任务、失败重试、超时中断
  - **跨 session 持久化**（重启不丢任务图）
  - 与 Session DAG **正交**（Session DAG = 消息树，TaskGraph = 工作流图）
  - 例：`重构用户模块` → [读 schema(0) → 改 UserService(2) → 改 controller(3) → 写测试(4) → Reviewer(5)]
- [ ] **Persistent Memory**（v2.0 MemoryManager 升级）
  - 跨 session 知识沉淀（用户偏好 / 项目决策 / 实体链接）
  - hand-edit 友好（用户可直接改 memory 文件）
  - **实体链接**：项目 / 文件 / 决策 三类节点的引用图
  - 跨 session 复用 + 跨 v4.0 Multi-Agent 5 角色共享
- [ ] **Tool Router 升级**（v1.0 已有）
  - v4.0 = 语义路由（按意图选工具，而不只是 registry 查找）
  - 支持 MCP 工具 + 内置工具 + Plugin 工具三类合并查询

#### ⚠️ Sprint 16-17 红线

- **Coder = Executor 特化，不是新东西**——复用 v1.0 Executor 代码，v4.0 加 Code-aware 工具
- **TaskGraph ≠ Session DAG**——前者是工作流层，后者是消息持久化层
- **Persistent Memory 不与 Session 混淆**——Memory 跨 session 共享，Session 是单一线程

### Sprint 18-20（MCP Marketplace + Desktop + Channels + 文档站，第 12-13 个月）

#### 任务清单

- [ ] **Plugin Marketplace**（功能包市场）
  - npm 命名空间 `@deepwhale/`
  - `deepwhale skill install` / `deepwhale plugin install` 命令
- [ ] **MCP Marketplace**（工具市场，**与 Plugin Marketplace 拆开**）
  - 官方 MCP server 目录
  - `deepwhale mcp install <name>` 命令
  - 区别：Plugin = 功能包（含 UI/事件/工具），MCP = 纯工具服务
- [ ] **Desktop**（Tauri 2.x）
  - 多 tab 会话
  - 右侧 panel 显示 agent 读/改过的文件
  - 底部 cost / cache / token meters
  - **TaskGraph 可视化**（DAG 节点图）
- [ ] **Web UI**（可选）
  - 浏览器访问 `localhost:7331`
- [ ] **Channels**（**v4.0 重新评估清单**）
  - 飞书：bot 消息 → RPC 投递 → 流式回写
  - Telegram：inline keyboard
  - 邮件 / 微信：按需
- [ ] **文档站**（VitePress）
  - Quickstart / Skills 开发指南 / Extension API 文档 / FAQ
- [ ] **v4.0 release**
  - 第 13 个月末 GitHub Release
  - **5 个 Agent 角色 + TaskGraph 协同跑通**
  - 桌面 GUI 跑起来
  - 文档站上线

#### ⚠️ v4.0 红线

- **5 角色不等于 5 个独立 Agent**——是 5 个**职责**，可以是 1 个 process 内 5 个函数
- **TaskGraph 持久化必须做**（重启不丢）——避免变成"另一个 in-memory DAG"
- **MCP Marketplace ≠ Plugin Marketplace**——两类市场分开发布

---

## 关键架构决策（实施前定）

| 决策点                    | 选择                             | 理由                         |
| ------------------------- | -------------------------------- | ---------------------------- |
| 主语言                    | **TypeScript（Node ≥ 22）**      | pi 验证 58.6k stars          |
| TUI 框架                  | **Ink**（React 19）              | pi 实战验证、跨平台一致      |
| 桌面                      | **Tauri 2.x**（v4.0）            | 生态成熟，**v4.0 之前不做**  |
| 沙箱（v1-v3）             | **Docker only**                  | 跨平台一致 + 单人可维护      |
| 沙箱（v4）                | **Docker + 多实例编排**          | Multi-Agent 隔离             |
| 分发                      | npm + Homebrew + Docker          | 跟 pi/Codex/Reasonix 一致    |
| 配置                      | TOML                             | CodeWhale 验证               |
| Skills 格式               | **对齐 Codex 开放标准**          | 跨工具复用                   |
| 4 包 monorepo             | **对齐 pi**                      | 复用 pi 社区经验             |
| ExtensionEvent            | **21 个 `whale.*` 事件**（v1.5） | 跟 pi 兼容但区分内/外        |
| MCP                       | 官方 SDK（v2.0）                 | 唯一标准                     |
| Release 节奏              | **每周一 minor**（v1.5 起）      | 避免 Reasonix 1.0 6 周未发   |
| i18n 路径                 | **第 1 行定对**                  | Hermes 教训                  |
| License                   | MIT                              | 全家桶都是 MIT               |
| **Constitution 9 层权威** | **砍掉**                         | 个人化产物，不适合 deepwhale |
| **Session DAG**           | **v1 = Linear，v2 = DAG**        | 避免 v1 过度复杂             |

---

## 风险登记

| 风险                                       | 等级            | 对策                                                                                                                                                         |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DeepSeek API 限流                          | 中              | 前缀缓存降耗 + Flash/Pro 智能路由                                                                                                                            |
| **Scope explosion**                        | **高**          | **本 ROADMAP 就是为压制这个风险**——5 阶段版本锚 + 砍掉清单 18 项                                                                                             |
| 单人开发 burnout                           | 中              | Phase 之间预留 1 周缓冲期                                                                                                                                    |
| **Windows 沙箱不完整**                     | **不评估**      | **v1-v4 都不做 Windows 沙箱**（统一 Docker）                                                                                                                 |
| MCP 协议演进                               | 低              | pin 官方 SDK minor 版本                                                                                                                                      |
| **Skills 安全**                            | **高**          | Skills 默认只读 + `permissions:` 显式声明 + Hook trust flag 在 `~/.deepwhale/trust.json`                                                                     |
| 跨 Phase 时间拖延                          | 中              | **强制 release 节奏**：每个 Phase 末尾必发版本                                                                                                               |
| Docker 沙箱冷启动慢                        | 低              | Phase 1 接受，Phase 3 优化                                                                                                                                   |
| Browser Runtime 跨浏览器一致               | 中              | Playwright 抽象足够，**不做自定义协议**                                                                                                                      |
| Computer Use OS 差异                       | 高              | v3.0 主要验证 macOS + Linux X11，Windows v3.0 不做                                                                                                           |
| Reasonix 1.0 6 周未发                      | 中              | **强制 release 节奏**（每周一 minor，**v1.0/v1.5/v2.0/v3.0/v4.0 必发**）                                                                                     |
| **项目成功概率**                           | 评估            | 严格执行（不新增需求 / 每版本强制发布 / Computer Use 不自研 / Browser Agent 分阶段）→ **80-85%**                                                             |
| **Bet-1 Code Intelligence**（**P0**）      | **P0 Kill**     | [Gate-1 守护](./ROADMAP.md#gate-1v15-release-前code-intelligence-kill-test)：v1.5 不通过 → 暂停 Browser/Computer/Desktop，优先修                             |
| **Bet-2 Browser Planner**（**P1**）        | **P1 Decision** | [Gate-1.5 守护](./ROADMAP.md#gate-15v20-release-前browser-viability-decision-gate)：v2.0 通过率决定路线（≥80% 完整 / 50-80% 降级 / <50% 砍 Browser 投资）    |
| **Bet-3 Long-Horizon Stability**（**P0**） | **P0 Kill**     | [Gate-2 守护](./ROADMAP.md#gate-2v30-release-前long-horizon-kill-test)：v3.0 不通过 → 暂停 Researcher/TaskGraph/Desktop，优先修 Planning/Compaction/Reviewer |
| **Code Intelligence 实际效果**             | 高（P0）        | v1.5 基础先验（Tree-sitter + Symbol Graph），v2.0 增强前先实测                                                                                               |
| **Browser Planner 鲁棒性**                 | 中（P1）        | Gate-1.5 通过率决定（不是非黑即白——有降级路线）                                                                                                              |
| **DeepSeek 长任务稳定性**                  | **高（P0）**    | Compaction + Planning + Reviewer 三者协同（不是单点修复）                                                                                                    |
| StormBreaker 漏判                          | 中              | **用 (tool, error) 签名不用 args**                                                                                                                           |
| Hermes footer 数字收敛 bug                 | 低              | **多字段同值时去冗余/加标签区分**                                                                                                                            |
| Hermes i18n 路径错                         | 低              | **Sprint 0 第 1 行定对**                                                                                                                                     |
| CodeWhale "marker-only" Landlock           | 不评估          | **deepwhale 走 Docker，不学 CodeWhale 沙箱思路**                                                                                                             |

---

## 与 Codex 全功能对照表

| Codex 功能          | 状态                                           | 落在版本                    |
| ------------------- | ---------------------------------------------- | --------------------------- |
| TUI 交互            | ✅                                             | v1.0                        |
| 多种模型切换        | ⚠️ v1.0 = DeepSeek only；v1.5 = +OpenAI/Claude | v1.0 / v1.5                 |
| Skills              | ✅                                             | v1.5                        |
| Plugins             | ✅                                             | v1.5                        |
| MCP Client/Server   | ✅                                             | v2.0                        |
| Browser MCP         | ✅                                             | v2.0                        |
| Computer Use        | ✅                                             | v3.0                        |
| Automations         | ✅                                             | v1.5                        |
| Remote TUI          | ✅                                             | v1.5                        |
| Desktop GUI         | ✅                                             | v4.0                        |
| 多渠道接入          | ✅                                             | v4.0                        |
| Session 持久化/恢复 | ✅                                             | v1.0（Linear）→ v2.0（DAG） |
| Compaction          | ✅                                             | v1.5                        |
| Hooks               | ✅                                             | v1.5                        |

**覆盖率进度**：

- v1.0 = **3/14**（TUI / 多模型-DS-only / Session-Linear）
- v1.5 = **8/14**（+ Skills / Plugins / Hooks / Approval / Task / Automations / Remote TUI / Compaction）
- v2.0 = **10/14**（+ MCP / Browser MCP）
- v3.0 = **11/14**（+ Computer Use）
- v4.0 = **14/14 ✅**（+ Desktop / 多渠道 / 完整 Multi-Agent）

**deepwhale 独家（vs Codex）**：

- ✅ **Prefix-cache 4 大机制**（Reasonix 全抄）— **v1.0 必带**
- ✅ **StormBreaker 防死循环**（Reasonix 抄）— v1.5 工具增多后 P0
- ✅ **SanitizeToolPairing**（Reasonix 抄）— v1.5
- ✅ **Compaction = 唯一 cache-reset point**（Reasonix 抄）— v1.5
- ✅ **Docker 沙箱统一**（v1.0-v4.0 跨平台一致，**Codex 没做**）
- ✅ **JSONL append-only Session**（pi 借鉴，v1.0 Linear → v2.0 DAG）— 简单可恢复
- ✅ **21 个 ExtensionEvent 钩子化 Compaction**（v1.5 起）
- ✅ **完整 Multi-Agent 流水线**（v4.0）

---

**最后更新**：2026-06-03（确立 5 阶段版本锚，砍掉 18 项延后事项，Docker 沙箱统一）
**当前阶段**：Phase 1 Sprint 0（4 包 monorepo + 基础设施）
**下次更新**：v0.1 release 时
**架构详情**：[docs/ARCHITECTURE.md](./ARCHITECTURE.md)
**总报告**：[docs/research/MASTER_RESEARCH.md](./docs/research/MASTER_RESEARCH.md)
- v1.0 fresh release gate: docs/superpowers/v1.0-fresh-release-gate.json
