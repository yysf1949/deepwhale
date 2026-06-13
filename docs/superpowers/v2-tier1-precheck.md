# V2 Tier-1 Precheck Evidence

Generated: 2026-06-13

Slice: D132

Milestone: v2.0

Tier: Tier-1

Passed: false

Summary: v2.0 Tier-1 evidence plus Tier-2 Automation, Compaction, and MCP Runtime evidence are present, but v2.0 is not release-ready.

## Checks

| Check | Status | Evidence | Caveat |
| --- | --- | --- | --- |
| Browser Tier-1 helper foundation | pass | D126 observation/planner sources and unit tests | Helper-layer evidence only; not live production automation. |
| Explainable Memory Ranking | pass | D127 ranking/store sources and unit tests | Deterministic local ranking evidence; not a full long-term memory system. |
| Code Intel semantic fallback | pass | D127 semantic-index and smart_search sources/tests | Heuristic lexical fallback; not embedding or LSP-grade semantics. |
| Default registry exposure invariant | pass | registry source + default-registry invariant test | Narrow default must remain coding plus Code Intel essentials. |
| Production Browser automation proof | pass | D129 production-proof source, unit tests, and evidence snapshot | Adapter-contract proof with transcript evidence; not default Browser exposure. |
| Visual grounding proof | pass | D129 visual snapshot metadata validation and evidence snapshot | Visual snapshot metadata proof; raw screenshot bytes are not stored. |
| Tier-2 Automation | pass | injected runtime, cron store run records, cron daemon, and runtime/store/daemon tests | Injected runner plus persisted run-record proof; not a full hosted/no-agent automation service. |
| Tier-2 Remote TUI | blocked | tracked separately | Remote TUI remains a separate Tier-2 blocker. |
| Tier-2 Compaction | pass | core/session compaction, agent compaction, print/RPC integration, and compaction tests | Compaction has implementation and integration evidence, but this does not complete v2.0. |
| Tier-2 MCP Runtime | pass | stdio JSON-RPC client, opt-in manifest registration, gh-search MCP server, and client/server tests | One-server stdio JSON-RPC transport proof; not a full multiplexed MCP runtime with auth, reconnect, HTTP/SSE, resources, prompts, or subscriptions. |

## Default Exposure

- Default registry tool count: 21.
- `browser_action` and `browser_js` are coding-surface helpers in the default registry.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- This precheck does not unlock default Browser automation.
- Production Browser proof is adapter-contract evidence, not a live external Browser run.

## Next Actions

1. D133: close or explicitly defer the remaining v2.0 Tier-2 Remote TUI blocker without expanding default exposure.
2. Keep the remaining Tier-2 v2.0 Remote TUI blocker separate from Automation, Compaction, and MCP Runtime evidence.
3. Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.
