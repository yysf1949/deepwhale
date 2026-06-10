# V1-V4 Evidence Scorecard

Generated: 2026-06-10

Aggregate evidence-backed progress: 48%

This scorecard measures current evidence, not ambition. A module existing in `src/` is foundation work unless the main runtime and gates prove integration.

| Milestone | Percent | Evidence-backed status | Main blockers |
| --- | ---: | --- | --- |
| v1.0 | 70% | Mostly implemented coding baseline | Release/version hygiene remains noisy; full release gate is not freshly proven here |
| v1.5 | 65% | Code Intel foundation exists and is labeled heuristic | Preferred 100K Gate-1 evidence is blocked; rename is not IDE-grade AST rename |
| v2.0 | 40% | Memory, Browser, and MCP foundations exist as opt-in or early pieces | Gate-1.5 live evidence and binding branch decision are incomplete |
| v2.5 | 40% | Planner/DAG/cache modules exist | Main-loop integration remains limited |
| v3.0 | 50% | Reviewer and Gate-2 runner exist; default-profile Gate-2 fixture passes | Gate-2 is fixture-scoped, not broad production proof |
| v4.0 | 25% | Researcher, TaskGraph, memory, and channel foundations exist | Agent OS orchestration, Desktop, channels, and crash-recovery evidence are incomplete |

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

## Next Actions

1. D72: refresh release/version hygiene after the Gate-1.5 advisory decision.
2. D73: collect or explicitly defer live Gate-1.5 browser tasks before Browser enhancement work.
3. D74: continue Code Intel correctness hardening only where tests prove specific behavior.
