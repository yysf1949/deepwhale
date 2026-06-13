# D127 Memory Ranking And Code Intel Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explainable v2.0 Tier-1 evidence for Memory Ranking and Code Intel enhancement without expanding default non-coding exposure or overclaiming v2.0 completion.

**Architecture:** Extend the existing pure ranking and semantic-index helpers. Keep backward-compatible APIs, add explainable result shapes beside them, and wire `smart_search` to use semantic fallback as a heuristic local supplement.

**Tech Stack:** TypeScript strict mode, Vitest, existing `@deepwhale/code-intel` and `@deepwhale/coding-agent` packages, no new npm dependencies.

---

## File Structure

- Modify `packages/coding-agent/src/memory/ranking.ts`: add `MemorySource`, `RankedMemory`, `scoreMemory()`, `rankMemoriesWithScores()`, query/source factors, and stable tie-breaking.
- Modify `packages/coding-agent/src/memory/store.ts`: add a `rank(options)` method that delegates to ranking helpers and excludes archived memories by default.
- Modify `packages/coding-agent/src/agent/tool-loop-memory.ts` and `packages/coding-agent/src/memory/persistent-store.ts`: expand `MemorySource` vocabulary to include `user_preference` and `workspace`.
- Modify `packages/coding-agent/test/unit/memory-ranking.test.ts`: add red tests for explainability, source/query factors, and backwards compatibility.
- Modify `packages/coding-agent/test/unit/memory-store.test.ts`: add red test for store-level ranking.
- Modify `packages/code-intel/src/semantic-index.ts`: add deterministic token evidence, coverage, reason, symbolId propagation, and stable tie-breaking.
- Modify `packages/code-intel/test/unit/semantic-index.test.ts`: add red tests for semantic ranking evidence.
- Modify `packages/coding-agent/src/tools/smart-search.ts`: add semantic fallback local results and metadata while keeping exact reference results high priority.
- Modify `packages/coding-agent/test/unit/smart-search.test.ts` and `packages/coding-agent/test/unit/smart-search-semantic.test.ts`: add red tests for free-text semantic fallback and metadata.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`, `docs/superpowers/v1-v4-evidence-scorecard.json`, `docs/superpowers/v1-v4-evidence-scorecard.md`, and `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` after focused verification.

### Task 1: Explainable Memory Ranking

**Files:**
- Modify: `packages/coding-agent/test/unit/memory-ranking.test.ts`
- Modify: `packages/coding-agent/src/memory/ranking.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving `rankMemoriesWithScores()` returns score factors, ranks `user_preference`
and query-overlapping memories above weaker alternatives, keeps stable tie-breaking by id,
and leaves `rankMemories()` returning plain `MemoryItem[]`.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/memory-ranking.test.ts --reporter=verbose`

Expected: FAIL because `rankMemoriesWithScores()` and source/query factors do not exist.

- [ ] **Step 3: Implement ranking helpers**

Add `MemorySource`, source weights, query token overlap, `scoreMemory()`, and
`rankMemoriesWithScores()`. Preserve `rankMemories()` by mapping scored results back to
plain memories.

- [ ] **Step 4: Run GREEN**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/memory-ranking.test.ts --reporter=verbose`

Expected: PASS.

### Task 2: Memory Store Ranking Integration

**Files:**
- Modify: `packages/coding-agent/test/unit/memory-store.test.ts`
- Modify: `packages/coding-agent/src/memory/store.ts`
- Modify: `packages/coding-agent/src/agent/tool-loop-memory.ts`
- Modify: `packages/coding-agent/src/memory/persistent-store.ts`

- [ ] **Step 1: Write failing store test**

Add a test proving `MemoryStore.rank({ now, halfLifeMs, limit, query })` excludes archived
items by default and returns `RankedMemory` evidence.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/memory-store.test.ts --reporter=verbose`

Expected: FAIL because `MemoryStore.rank()` does not exist.

- [ ] **Step 3: Implement store method and source vocabulary**

Add `rank()` to `MemoryStore`. Expand `MemorySource` unions in memory integration files to
include `user_preference` and `workspace`; do not change persisted JSON shape.

- [ ] **Step 4: Run memory tests**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/memory-ranking.test.ts packages/coding-agent/test/unit/memory-store.test.ts packages/coding-agent/test/unit/persistent-memory.test.ts packages/coding-agent/test/integration/tool-loop-memory.test.ts --reporter=verbose`

Expected: PASS.

### Task 3: Semantic Index Evidence

**Files:**
- Modify: `packages/code-intel/test/unit/semantic-index.test.ts`
- Modify: `packages/code-intel/src/semantic-index.ts`

- [ ] **Step 1: Write failing semantic-index tests**

Add tests proving results include `symbolId`, `matchedTokens`, `coverage`, and `reason`, and
that equal scores are tie-broken by id.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/code-intel/test/unit/semantic-index.test.ts --reporter=verbose`

Expected: FAIL because result evidence fields are missing.

- [ ] **Step 3: Implement deterministic evidence**

Tokenize query/content, compute score and coverage, propagate `symbolId`, explain matches,
and sort by score descending then id ascending.

- [ ] **Step 4: Run GREEN**

Run: `pnpm.cmd exec vitest run packages/code-intel/test/unit/semantic-index.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Smart Search Semantic Fallback

**Files:**
- Modify: `packages/coding-agent/test/unit/smart-search.test.ts`
- Modify: `packages/coding-agent/test/unit/smart-search-semantic.test.ts`
- Modify: `packages/coding-agent/src/tools/smart-search.ts`

- [ ] **Step 1: Write failing smart_search tests**

Add a temp-repo test where query `status bar` finds a `StatusBar` or `renderStatusBar`
symbol through semantic fallback even when exact `findReferences()` does not match the
whole query. Assert `meta.semanticCount > 0`, `meta.heuristic === true`, and formatted
content includes `semantic_fallback`.

- [ ] **Step 2: Run RED**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/smart-search.test.ts packages/coding-agent/test/unit/smart-search-semantic.test.ts --reporter=verbose`

Expected: FAIL because `smart_search` only returns exact reference matches today.

- [ ] **Step 3: Implement semantic fallback**

Build semantic chunks from symbol graph file/symbol metadata, run `createSemanticIndex()`,
merge exact reference and semantic fallback results, de-duplicate by file/line/mode, and
add `semanticCount` plus `matchModes` metadata.

- [ ] **Step 4: Run focused Code Intel tests**

Run: `pnpm.cmd exec vitest run packages/code-intel/test/unit/semantic-index.test.ts packages/coding-agent/test/unit/smart-search.test.ts packages/coding-agent/test/unit/smart-search-semantic.test.ts --reporter=verbose`

Expected: PASS.

### Task 5: Status Evidence Hygiene

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`

- [ ] **Step 1: Update status docs after code passes focused tests**

Record D127 as explainable Memory Ranking plus Code Intel semantic fallback evidence.
Keep v2.0 incomplete and point the next implementation slice to D128.

- [ ] **Step 2: Run status hygiene test**

Run: `pnpm.cmd exec vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run in order:

`pnpm.cmd typecheck`

`pnpm.cmd lint`

`pnpm.cmd build`

`pnpm.cmd test`

`git diff --check`

Expected: all exit 0.

- [ ] **Step 4: Stage only D127 files**

Stage D127 code/tests/spec/plan/status docs. Do not stage
`docs/superpowers/gate-1-current-workspace-result.json` or
`docs/superpowers/gate-1-current-workspace-result.md`.

- [ ] **Step 5: Commit and push**

Commit message: `feat(D-127): add explainable memory and code-intel ranking`

Push branch: `feature/d36-gate2-live`.

## Self-Review

- Spec coverage: tasks cover memory ranking, memory store integration, semantic-index
  evidence, smart_search integration, status docs, and default-exposure hygiene.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: `MemorySource`, `RankedMemory`, `semantic_fallback`, and status pointer
  names are consistent across tasks.
