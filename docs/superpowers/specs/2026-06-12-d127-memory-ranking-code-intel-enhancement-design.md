# D127 Memory Ranking And Code Intel Enhancement Design

## Context

D126 completed the first Browser Tier-1 foundation slice, but v2.0 still has two explicit
Tier-1 gaps: Memory Ranking and Code Intelligence enhancement. Both already have minimal
foundation code:

- `packages/coding-agent/src/memory/ranking.ts` ranks memories by importance, recency
  decay, and scope.
- `packages/code-intel/src/semantic-index.ts` provides deterministic lexical fallback
  search when embeddings are unavailable.
- `packages/coding-agent/src/tools/smart-search.ts` exposes exact symbol-reference search
  but does not yet surface semantic fallback matches for free-text local queries.

D127 should strengthen these existing foundations without claiming production-grade memory
management, embedding search, or IDE-grade Code Intel.

## Scope

D127 implements a narrow v2.0 Tier-1 enhancement:

- Memory Ranking: expose ranked memory evidence with score factors and reasons, including
  importance, last-accessed decay, scope weight, source weight, and optional query overlap.
- Memory Store integration: let the JSON memory store return ranked results without
  changing its persistence format.
- Code Intel enhancement: make deterministic semantic fallback ranking more transparent by
  returning matched tokens, coverage, reason text, and stable tie-breaking.
- Smart Search integration: combine exact symbol-reference results with semantic fallback
  results for local/all searches so free-text queries can find plausible symbols while
  still reporting heuristic metadata.

## Out Of Scope

- No embedding provider, vector database, or ML ranking model.
- No IDE-grade rename, type inference, or full language-server behavior.
- No default exposure expansion outside the existing coding plus Code Intel default
  surface.
- No changes to Gate-1 current-workspace result files; they remain unrelated dirty state.
- No v2.0 completion claim. D127 is evidence toward Tier-1, not a release gate.

## Interfaces

Memory ranking keeps the existing `rankMemories()` API and adds:

- `rankMemoriesWithScores(memories, options): RankedMemory[]`
- `scoreMemory(memory, options): RankedMemory`
- `RankOptions.query?: string`
- `RankOptions.sourceWeights?: Partial<Record<MemorySource, number>>`
- `RankedMemory.factors`: importance, decayScore, scopeWeight, sourceWeight,
  queryMatchScore, ageMs
- `RankedMemory.reason`: short deterministic explanation

Memory sources expand to the roadmap vocabulary:

- `auto_extracted`
- `user_explicit`
- `project_fact`
- `user_preference`
- `workspace`

Semantic index results keep existing fields and add optional evidence:

- `symbolId`
- `matchedTokens`
- `coverage`
- `reason`

`SmartSearchTool` keeps the same schema and adds result metadata:

- `matchMode`: `symbol_reference`, `semantic_fallback`, or `remote`
- `reason`
- top-level `meta.semanticCount`
- top-level `meta.matchModes`

## Data Flow

1. Memory callers can continue using `rankMemories()` for the old return shape or switch to
   `rankMemoriesWithScores()` when they need explainability.
2. `MemoryStore.rank()` loads non-archived memories and delegates to
   `rankMemoriesWithScores()`.
3. `createSemanticIndex()` tokenizes query and chunk content deterministically, scores by
   token overlap and coverage, and returns stable ordered evidence.
4. `smart_search` builds exact symbol-reference results, builds semantic chunks from the
   symbol graph, merges both result modes, de-duplicates by file/line/mode, sorts by score,
   and keeps all output labeled heuristic.

## Error Handling

All enhancements are deterministic and best-effort. Empty inputs return empty ranked lists.
Malformed or unparsable files are still skipped by the existing symbol graph builder.
Semantic fallback cannot make a Code Intel claim stronger than heuristic; result metadata
must preserve `heuristic: true`.

## Testing

Use focused TDD unit tests:

- Memory ranking proves source weights, query overlap, reasons, stable tie-breaking, and
  the backward-compatible `rankMemories()` shape.
- Memory store proves `rank()` excludes archived memories by default and returns score
  evidence.
- Semantic index proves token coverage, stable tie-breaking, and reason fields.
- Smart search proves a free-text query can return a semantic fallback local result with
  heuristic metadata and `semanticCount > 0`.
- Status-doc hygiene proves D127 becomes the next completed slice and D128 becomes the next
  pointer without claiming v2.0 completion.

Full verification remains:

`pnpm.cmd typecheck`

`pnpm.cmd lint`

`pnpm.cmd build`

`pnpm.cmd test`

`git diff --check`

## Status Accounting

If verification passes, D127 may modestly raise v2.0 evidence because Memory Ranking and
Code Intel enhancement now have explainable tests. The scorecard must keep v2.0 incomplete
until remaining Tier-1/Tier-2 release gates and production evidence are separately proven.
