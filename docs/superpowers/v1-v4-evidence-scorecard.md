# V1-V4 Evidence Scorecard

Generated: 2026-06-10

Aggregate evidence-backed progress: 48%

This scorecard measures current evidence, not ambition. A module existing in `src/` is foundation work unless the main runtime and gates prove integration.

| Milestone | Percent | Evidence-backed status | Main blockers |
| --- | ---: | --- | --- |
| v1.0 | 70% | Mostly implemented coding baseline | Release/version hygiene remains noisy; full release gate is not freshly proven here |
| v1.5 | 65% | Code Intel foundation exists and is labeled heuristic | Preferred 100K Gate-1 evidence is blocked; rename is not IDE-grade AST/edit-engine rename |
| v2.0 | 40% | Memory, Browser, and MCP foundations exist as opt-in or early pieces | Gate-1.5 live evidence and integration are incomplete |
| v2.5 | 40% | Planner/DAG/cache modules exist | Main-loop integration remains limited |
| v3.0 | 50% | Reviewer and Gate-2 runner exist; default-profile Gate-2 fixture passes | Gate-2 is fixture-scoped, not broad production proof |
| v4.0 | 25% | Researcher, TaskGraph, memory, and channel foundations exist | Agent OS orchestration, Desktop, channels, and crash-recovery evidence are incomplete |

## Caveats

- Gate-2 default-profile fixture pass is not v1-v4 production completion.
- Gate-1 minimum-50k evidence is not preferred-100k evidence.
- Module existence is not production integration.
- Code Intel rename, reference, call graph, and smart search behavior remains heuristic unless a specific test proves stronger semantics.
- Default registry exposure remains coding plus Code Intel essentials; non-coding surfaces require explicit opt-in.

## Next Actions

1. D67: obtain or prepare a real local 100K+ Gate-1 target and run the scenario, or keep the blocker explicit.
2. D67 alternative: deepen Code Intel rename safety with AST/edit-engine-backed edits before stronger release claims.
3. After D67, re-run full verification and update this scorecard from current evidence.
