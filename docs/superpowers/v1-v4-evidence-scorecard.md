# V1-V4 Evidence Scorecard

Generated: 2026-06-10

Aggregate evidence-backed progress: 62%

This scorecard measures current evidence, not ambition. A module existing in `src/` is foundation work unless the main runtime and gates prove integration.

| Milestone | Percent | Evidence-backed status | Main blockers |
| --- | ---: | --- | --- |
| v1.0 | 80% | Mostly implemented coding baseline; fresh release gate proven 2026-06-10 (D-79); default registry invariant asserted (D-83) | No new public code claims; v1.0 ship ritual (tag, npm publish) is gated on user approval |
| v1.5 | 65% | Code Intel foundation exists and is labeled heuristic | Preferred 100K Gate-1 evidence is blocked; rename is not IDE-grade AST rename |
| v2.0 | 40% | Memory, Browser, and MCP foundations exist as opt-in or early pieces | Gate-1.5 live evidence and binding branch decision are incomplete |
| v2.5 | 65% | Planner/DAG/cache modules exist; main-loop integration has multi-scenario planner.plan evidence fixtures (D-77 + 3 D-81 + D-82); v5 implementation gate reached (v2.5 >= 65%) | Integration is 5 fixtures; a real long-horizon multi-step execution run is still not proven in this scorecard; release gate scenarios are not freshly proven |
| v3.0 | 50% | Reviewer and Gate-2 runner exist; default-profile Gate-2 fixture passes | Gate-2 is fixture-scoped, not broad production proof |
| v4.0 | 45% | Researcher, TaskGraph, memory, and channel foundations exist; cross-session memory crash/reload evidence plus cross-session TaskGraph persistence evidence fixtures present | Agent OS orchestration, Desktop, channels, and real cross-platform SIGKILL evidence are still incomplete; cross-session evidence is deterministic unit-style fixtures (D-78 + D-80), not real cross-platform SIGKILL tests |

## Caveats

- Gate-2 default-profile fixture pass is not v1-v4 production completion.
- Gate-1 minimum-50k evidence is not preferred-100k evidence.
- Module existence is not production integration.
- Code Intel rename, reference, call graph, and smart search behavior remains heuristic unless a specific test proves stronger semantics.
- Default registry exposure remains coding plus Code Intel essentials; non-coding surfaces require explicit opt-in.

## Evidence Updates

- D67 rename_symbol exposes hashline edit hunks and heuristic confidence metadata.
- D67 does not make rename_symbol IDE-grade; it remains reference-guided and heuristic.
- D69 refreshed Gate-1 target inventory and Vite minimum-50k Gate-1 scenario evidence.
- D69 keeps preferred-100k blocked because the local inventory still has no 100K+ target.
- D70 refreshed Gate-1.5 fixture evidence: algorithmic decision is continue, but binding is false and branchDecision is defer-live-evidence.
- D70 keeps Browser branch decision deferred until 20 live browser tasks are recorded.
- D71 covers TypeScript combined default-plus-named import references and call edges.
- D72 release/version hygiene report distinguishes package version from roadmap maturity.
- D73 live Browser task ledger records 0/20 live tasks and binding=false.
- D74 resolves TypeScript default re-export barrel call edges to the original named default declaration.
- D75 records latest user goals into TaskGraphRecorder through runToolLoopWithReview without expanding the default registry.
- D77 records planner.plan invocation in the main loop with the latest user goal when a Planner is provided, with the resulting tasks recorded into the task graph.
- D78 records atomic write semantics plus partial-last-line recovery for the persistent memory store; the on-disk file is always either the old contents or the new contents, never partial.
- D79 produces a fresh v1.0 release gate proof: docs/superpowers/v1.0-fresh-release-gate.{json,md} show typecheck + lint + test + build + diff --check all exit 0; package version line 2.2.0 -> 2.3.0 (line-only, per D-72 hygiene).
- D80 records cross-session TaskGraph persistence: a second PersistingTaskGraphRecorder instance loaded from the same file sees the first instance's records (D-78 storage layer + D-80 Agent OS layer).
- D81 adds 3 multi-scenario planner integration tests: multi-task DAG with dependsOn dependencies, tool spec preservation, and negative test confirming planner is gated by goal presence.
- D82 adds 1 investigate-goal scenario (single task, no dependsOn) -- brings v2.5 to 65%, crossing the v5 implementation gate threshold.
- D83 records a v1.0 default-registry invariant: 19-tool narrow default + no non-coding opt-in tools exposed by default (verified by 2 unit tests).

## Next Actions

The scorecard action queue is empty. The remaining v1-v4 gaps are external-data and multi-sprint blockers (preferred-100k Gate-1 target, 20 real browser tasks, Gate-2 production, cross-platform Desktop build) that cannot be cleared from inside this repository alone.
