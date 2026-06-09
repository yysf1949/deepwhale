# Gate-1 Result

Status: failed
Repo: D:\App\openClaw\projects\deepwhale

## Metrics

- LOC: 43496 (minimum 50000, preferred 100000)
- Supported files: 354
- Files indexed: 354
- Symbols indexed: 2687
- References indexed: 15328
- Call edges: 2743
- Graph build: 766ms
- Call graph: 74ms
- Elapsed: 911ms / 1200000ms

## Evidence

- Entry: createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7 (declaration)
- Modification point: createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7 (declaration)
- Call chain edges: 2
  - packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:122
  - packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:139

## Failure Reasons

- loc-below-minimum: 43496 < 50000
