# Gate-1 Result

Status: failed
Repo: D:\App\openClaw\projects\deepwhale

## Metrics

- LOC: 43041 (minimum 50000, preferred 100000)
- Supported files: 336
- Files indexed: 336
- Symbols indexed: 2596
- References indexed: 15133
- Call edges: 2606
- Graph build: 1039ms
- Call graph: 99ms
- Elapsed: 1219ms / 1200000ms

## Evidence

- Entry: createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7 (declaration)
- Modification point: createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7 (declaration)
- Call chain edges: 2
  - packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:122
  - packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:139

## Failure Reasons

- loc-below-minimum: 43041 < 50000
