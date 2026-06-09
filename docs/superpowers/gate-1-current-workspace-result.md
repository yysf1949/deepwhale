# Gate-1 Result

Status: failed
Repo: D:\App\openClaw\projects\deepwhale

## Metrics

- LOC: 47203 (minimum 50000, preferred 100000)
- LOC qualification: below-minimum
- Supported files: 412
- Files indexed: 412
- Symbols indexed: 3091
- References indexed: 16564
- Call edges: 3183
- Graph build: 990ms
- Call graph: 108ms
- Elapsed: 1190ms / 1200000ms

## Evidence

- Entry: createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7 (declaration)
- Modification point: createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7 (declaration)
- Call chain edges: 2
  - packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:122
  - packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:139

## Failure Reasons

- loc-below-minimum: 47203 < 50000
