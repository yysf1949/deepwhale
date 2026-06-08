# Gate-1 Result

Status: passed
Repo: D:\App\openClaw\projects\deepwhale\.gate-targets\vite

## Metrics

- LOC: 86216 (minimum 50000, preferred 100000)
- Supported files: 1395
- Files indexed: 1395
- Symbols indexed: 7427
- References indexed: 30821
- Call edges: 32830
- Graph build: 2295ms
- Call graph: 890ms
- Elapsed: 3534ms / 1200000ms

## Evidence

- Entry: createServer at packages/vite/src/node/server/index.ts:473:7 (declaration)
- Modification point: _createServer at packages/vite/src/node/server/index.ts:479:7 (declaration)
- Call chain edges: 1
  - packages/vite/src/node/server/index.ts:createServer -> packages/vite/src/node/server/index.ts:_createServer @ packages/vite/src/node/server/index.ts:476
