# D130 V2 Tier-2 Compaction Closure Design

## Context

D129 moved production Browser automation and visual grounding to Tier-1 pass using adapter-contract
evidence while keeping v2.0 blocked on Tier-2 proof. The roadmap defines v2.0 Tier-2 as four
deferable catch-up items: Automation, Remote TUI, Compaction, and MCP Runtime. D130 closes only the
Compaction item because the repository already has stronger implementation evidence there than for
the other three items.

## Decision

Represent v2.0 Tier-2 as four separate release-precheck rows:

- Automation remains blocked.
- Remote TUI remains blocked.
- Compaction passes, backed by existing core/session and agent integration evidence.
- MCP Runtime remains blocked.

The overall v2.0 precheck remains `passed=false` because three Tier-2 rows are still blocked. This
slice does not add tools, does not alter the default registry, and does not claim v2.0 or v1-v4
completion.

## Compaction Evidence Boundary

Compaction may pass only from implementation and test evidence that shows runtime integration, not
module existence alone:

- `packages/core/src/session/compaction.ts` implements token estimation, tail selection, summary
  replacement, compaction events, latch behavior, and prefix-cache reset hooks.
- `packages/coding-agent/src/agent/agent-compaction.ts` integrates compaction with the tool loop and
  writes `compaction` / `compaction_paused` session events.
- `packages/coding-agent/src/modes/print.ts` and `packages/coding-agent/src/modes/rpc.ts` can inject
  `AgentCompactionConfig` into their tool-loop paths when a session writer exists.
- Tests cover deterministic core compaction, agent-level compaction, session compaction hooks, and
  cross-protocol compaction smoke evidence.

TUI compaction remains outside the D130 closure because `packages/coding-agent/src/modes/tui.ts`
still documents it as no-op.

## Data Model

`V2Tier1PrecheckCheckId` will replace the generic `tier2-blockers` row with:

- `tier2-automation`
- `tier2-remote-tui`
- `tier2-compaction`
- `tier2-mcp-runtime`

The precheck still includes Tier-1 rows first, then the Tier-2 rows. The result summary should say
Tier-1 evidence and one Tier-2 closure are present, but v2.0 is not release-ready.

## Documentation

Update machine-readable and public status documents to record D130:

- `docs/superpowers/v2-tier1-precheck.{json,md}`
- `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`
- README, ROADMAP, and ROADMAP_DECISIONS current-status blocks

The next action after D130 should be D131: close another v2.0 Tier-2 blocker without expanding
default exposure.

## Risks And Non-Goals

- Do not count Compaction as a full v2.0 release. It is only one of four Tier-2 rows.
- Do not move Automation, Remote TUI, or MCP Runtime to pass.
- Do not change default registry tool names or counts.
- Do not treat TUI no-op compaction as complete.
- Do not stage the existing `docs/superpowers/gate-1-current-workspace-result.*` dirty files.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Internal consistency: the design closes only Compaction and keeps the overall gate blocked.
- Scope check: one release-precheck slice plus evidence docs; no product behavior changes.
- Ambiguity check: Compaction pass requires implementation plus test evidence, not module existence.
