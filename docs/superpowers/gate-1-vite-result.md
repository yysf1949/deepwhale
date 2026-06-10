# Gate-1 Result

Status: passed
Repo: D:\App\openClaw\projects\deepwhale\.gate-targets\vite

## Metrics

- LOC: 86216 (minimum 50000, preferred 100000)
- LOC qualification: minimum-50k
- Supported files: 1395
- Files indexed: 1395
- Symbols indexed: 7427
- References indexed: 27854
- Call edges: 32526
- Graph build: 1723ms
- Call graph: 504ms
- Elapsed: 2542ms / 1200000ms

## Evidence

- Entry: createServer at packages/vite/src/node/server/index.ts:473:7 (declaration)
- Modification point: _createServer at packages/vite/src/node/server/index.ts:479:7 (declaration)
- Call chain edges: 1
  - packages/vite/src/node/server/index.ts:createServer -> packages/vite/src/node/server/index.ts:_createServer @ packages/vite/src/node/server/index.ts:476
