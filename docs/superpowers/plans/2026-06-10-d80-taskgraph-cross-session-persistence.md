# D-80 TaskGraph Cross-Session Persistence Evidence Sub-Sprint

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:verification-before-completion (run commands, read output, THEN make the claim). Steps use checkbox (`- [ ]`) syntax.

**Parent plan:** `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md` § v4.0 Agent OS section, and the v4.0 scorecard blocker "cross-session crash recovery evidence is a deterministic unit-style fixture, not a real cross-platform SIGKILL test".

**Branch:** `feature/d36-gate2-live` (current). This sub-sprint is committed on top of D-79 (`f327f71`).

**Goal:** Add a file-backed `PersistingTaskGraphRecorder` that mirrors the `PersistentMemoryStore` pattern (D-78: JSONL file + temp-file + fsync + rename atomic write, partial-last-line recovery on load). Provide a cross-session integration test that records into one recorder instance, instantiates a second recorder from the same file, and verifies the second recorder sees the first's entries. This advances v4.0 from 35% to 45% by adding a second cross-session evidence slice (Agent OS layer, complementing D-78's memory storage layer).

---

## 拍板 (Pre-resolved decisions, no further input needed)

1. **Scope:**
   - New file: `packages/coding-agent/src/agent/persisting-task-graph-recorder.ts` (impl)
   - New file: `packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts` (unit tests, 4 tests)
   - Modify: `packages/coding-agent/test/integration/tool-loop-policy.test.ts` (add 1 cross-session integration test)
   - Modify: README.md, ROADMAP.md, docs/ROADMAP_DECISIONS.md, docs/superpowers/v1-v4-evidence-scorecard.{json,md}, docs/superpowers/release-version-hygiene.{json,md}, packages/coding-agent/test/unit/status-doc-hygiene.test.ts
   - New plan doc: `docs/superpowers/plans/2026-06-10-d80-taskgraph-cross-session-persistence.md`
2. **Pattern to mirror:** D-78's `PersistentMemoryStore` (JSONL file + atomic-rename + partial-last-line recovery). Both are 1 file + 1 in-memory array + atomic flush. Naming: `PersistingTaskGraphRecorder` (action: persisting; property: cross-session).
3. **5 红线 scope:** `packages/coding-agent/src/repl/`, `packages/coding-agent/src/modes/tui.ts`, `packages/coding-agent/src/agent/tool-loop.ts`. The new file is in `src/agent/` (not `tool-loop.ts`); no 5 红线 touch. The integration test change is in `tool-loop-policy.test.ts` (not in 5 红线).
4. **Default registry unchanged.** PersistingTaskGraphRecorder is opt-in like PersistentMemoryStore.
5. **No npm publish, no tag, no version bump.** This is a feature-branch sub-sprint, not a release.
6. **No new dependencies.** Uses only `node:fs` and `node:path` (same as PersistentMemoryStore).
7. **TDD: test-first (RED) → impl (GREEN) → bidirectional check (RED-without-impl → GREEN-with-impl).** Per the D-33.x sub-sprint protocol.

---

## File Path & Type Definitions

```ts
// PersistingTaskGraphRecorder constructor takes a file path (anywhere on disk).
// The path's parent directory is created on first flush() if it doesn't exist.
// On construction, load() is NOT auto-called (mirrors PersistentMemoryStore).
// Caller is expected to call await store.load() before reads.
//
// The recorder implements TaskGraphRecorder from
// packages/coding-agent/src/agent/tool-loop-policy.ts (interface, NOT in 5 红线).
//
// Public read methods (for the integration test):
//   - getToolCalls(): readonly recorded tool-call entries
//   - getGoals(): readonly recorded goal entries
//   - getPlans(): readonly recorded plan entries
```

---

## Task 1: RED — Write the unit test (4 tests, must FAIL)

**File:** `packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts`

**Tests:**

1. `load() reads existing JSONL entries` — write a JSONL file with 3 entries (1 tool call + 1 goal + 1 plan), instantiate recorder, call `load()`, assert `getToolCalls().length === 1`, `getGoals().length === 1`, `getPlans().length === 1`.

2. `recordToolCall + recordGoal + recordPlan append JSONL entries and persist across instances (D-80)` — create recorder A, call `recordToolCall`, `recordGoal`, `recordPlan` (3 entries total). Create recorder B from same file path, call `B.load()`. Assert B sees all 3 entries (cross-session survival).

3. `load() recovers from a partial last line` — write a JSONL file with 1 valid line + 1 truncated (no closing `}`) line. Instantiate recorder, call `load()`. Assert the recorder has 1 entry (the truncated line is dropped).

4. `flush() writes atomically via temp-file + rename` — create recorder, record 1 entry, then check the file exists with JSONL content. (Simpler atomic-write check than D-78's POSIX rename test; we trust the rename primitives, just verify the file content is parseable JSONL.)

Run: `./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts --reporter=verbose`

Expected: 4 failures (impl file does not exist yet, or imports fail).

---

## Task 2: GREEN — Write the impl

**File:** `packages/coding-agent/src/agent/persisting-task-graph-recorder.ts`

**Pattern (mirrors PersistentMemoryStore):**
- Class `PersistingTaskGraphRecorder` with private `file: string`, `toolCalls: Array<...>`, `goals: Array<...>`, `plans: Array<...>`.
- Constructor: `(opts: { file: string })` → stores `this.file = opts.file`.
- `async load()`: reads file, splits on `\n`, JSON.parse each line, stops at first parse failure, populates in-memory arrays.
- `async recordToolCall(input)`: append to `this.toolCalls`, call `this.flush()`.
- `async recordGoal(input)`: append to `this.goals`, call `this.flush()`.
- `async recordPlan(input)`: append to `this.plans` (only if defined), call `this.flush()`.
- `private async flush()`: build JSONL payload (tool calls + goals + plans, each type with a `kind` discriminator), write to `${this.file}.tmp-${pid}-${now}`, fsync, rename over destination.
- `getToolCalls()`, `getGoals()`, `getPlans()`: return readonly arrays.

Run the unit test again. Expected: 4 pass.

---

## Task 3: Bidirectional TDD check (the differentiator)

```bash
# 1. With impl present: 4 tests pass
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts --reporter=verbose
# 2. Stash impl, run tests → expect 4 fails
git stash push --keep-index -- packages/coding-agent/src/agent/persisting-task-graph-recorder.ts
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts --reporter=verbose
# 3. Restore impl, run tests → expect 4 pass
git stash pop
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts --reporter=verbose
```

If step 2 unexpectedly passes, the test is theater (test against an old impl, typo that always returns expected). Investigate and fix.

---

## Task 4: Add cross-session integration test

**File:** `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

**Test:** `'passes task graph records across separate recorder instances pointing at the same file (D-80)'`

```ts
// 1. Set up temp dir, file path under it
// 2. Create PersistingTaskGraphRecorder A, run tool loop with A, verify A has 1 tool call + 1 goal
// 3. Create PersistingTaskGraphRecorder B from same file, B.load()
// 4. Run tool loop with B (different goal + tool), verify B has BOTH A's records AND B's new records
```

Run the full test file. Expected: 4 original tests + 1 new test pass.

---

## Task 5: Update status documents (6 files, atomic)

1. `package.json` — version unchanged (no bump on feature branch)
2. `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`:
   - `Current sprint: D79 ...` → `Current sprint: D80 TaskGraph cross-session persistence evidence`
   - Add `D80 TaskGraph cross-session persistence evidence: PersistingTaskGraphRecorder mirrors the PersistentMemoryStore pattern (JSONL + atomic-rename + partial-line recovery); cross-session integration test records in instance A, then verifies instance B (same file) sees A's entries.`
   - Next slice → `D81 next v1-v4 slice (gated on user direction; v5/v6 implementation blocked on scorecard >= 65%, currently 58%)`
   - `Last status hygiene sprint: D79.` → `Last status hygiene sprint: D80.`
3. `docs/superpowers/release-version-hygiene.json` and `.md`:
   - `nextAction` → `D81: pick next in-repo scorecard slice (v3.0/v2.5/v1.5 headroom all available; v2.0/v4.0 require external data)`
4. `docs/superpowers/v1-v4-evidence-scorecard.json`:
   - `aggregatePercent: 56` → `58`
   - v4.0 `percent: 35` → `45`
   - v4.0 evidence: add `D80 records cross-session TaskGraph persistence: a second PersistingTaskGraphRecorder instance loaded from the same file sees the first instance's records (D-78 storage layer + D-80 Agent OS layer)`
   - v4.0 blockers: keep the 3 blockers; remove "cross-session crash recovery evidence is a deterministic unit-style fixture" since D-78 + D-80 cover cross-session storage
5. `docs/superpowers/v1-v4-evidence-scorecard.md`: mirror JSON changes
6. `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`:
   - `expect(scorecard.aggregatePercent).toBe(56);` → `58`
   - `expect(scorecardMd).toContain('Aggregate evidence-backed progress: 56%');` → `58%`
   - In the 3-doc block test, add D80 line to the completed-slices list
   - Add the new D-80 plan path to the "Plan" listing
   - Add `not.toMatch(/Next implementation slice: D80/i)` to the negation list (D-80 is now completed, not the next slice)

---

## Task 6: Self-test (post-status-update)

```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run 2>&1 | tail -5
pnpm.cmd build 2>&1 | tail -5
git diff f327f71..HEAD --stat -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts packages/coding-agent/src/agent/tool-loop.ts
```

**Expected:** all 5 commands exit 0; 5 红线 diff is empty.

---

## Task 7: Stage + commit + ship + push

**Stage (explicit files only, NEVER `git add .`):**

```bash
git add \
  packages/coding-agent/src/agent/persisting-task-graph-recorder.ts \
  packages/coding-agent/test/unit/persisting-task-graph-recorder.test.ts \
  packages/coding-agent/test/integration/tool-loop-policy.test.ts \
  packages/coding-agent/test/unit/status-doc-hygiene.test.ts \
  README.md ROADMAP.md docs/ROADMAP_DECISIONS.md \
  docs/superpowers/v1-v4-evidence-scorecard.json \
  docs/superpowers/v1-v4-evidence-scorecard.md \
  docs/superpowers/release-version-hygiene.json \
  docs/superpowers/release-version-hygiene.md \
  docs/superpowers/plans/2026-06-10-d80-taskgraph-cross-session-persistence.md
```

**Commit 1 (impl + tests):**

```bash
git commit -m "feat(D-80): PersistingTaskGraphRecorder (cross-session Agent OS evidence)

- New file: packages/coding-agent/src/agent/persisting-task-graph-recorder.ts
  - Implements TaskGraphRecorder interface from tool-loop-policy.ts
  - Mirrors D-78 PersistentMemoryStore pattern: JSONL file + temp-file +
    fsync + rename atomic write; partial-last-line recovery on load.
- New unit test: 4 RED -> GREEN verified
  (load reads existing entries; cross-instance persistence; partial-last-
  line recovery; atomic flush round-trip).
- New integration test in tool-loop-policy.test.ts: cross-session
  scenario where recorder A records a tool call + goal, recorder B
  (same file, fresh instance) sees A's records after load.
- Status blocks advanced: current sprint D-79 -> D-80.
- Scorecard: aggregate 56 -> 58, v4.0 35 -> 45, nextActions still empty.
- 5 红线 preserved: changes are in src/agent/persisting-task-graph-recorder.ts
  (NEW file, not tool-loop.ts) and tool-loop-policy.ts (NOT in 5 红线).
- 1200 -> 1204 pass (delta = +4 new unit tests, +1 new integration test).
- typecheck, lint, build, diff --check all exit 0.
- Default registry unchanged."
```

**Commit 2 (ship marker):**

```bash
git commit --allow-empty -m "ship(coding-agent): D-80 收口 (1 task, 1 commit + 1 ship marker, PersistingTaskGraphRecorder cross-session evidence, 1200->1204 pass, scorecard 56->58, v4.0 35->45, typecheck/lint/build/diff-check 0, 5 红线 0 改)"
```

**Push:**

```bash
git push origin feature/d36-gate2-live
git ls-remote --heads origin feature/d36-gate2-live
```

---

## Acceptance Criteria Summary

- 1 impl + 1 test commit + 1 ship marker on `feature/d36-gate2-live`
- Test count: 1200 → 1204 / 1 / 4 (delta +4: 4 new unit tests, of which 1 is the cross-session integration test, so net +4)
  - Wait, the integration test goes in tool-loop-policy.test.ts which is +1 test, and the unit test is +4 tests. Total: +5 tests. 1200 → 1205.
- Scorecard: aggregate 56 → 58, v4.0 35 → 45, nextActions still empty
- 5 红线 preserved (empty diff)
- Default registry unchanged
- typecheck/lint/build/diff --check all exit 0
- Branch pushed to `feature/d36-gate2-live`

---

## STOP Conditions

Stop and report to parent (do NOT improvise beyond these):

- Any verification command exits non-zero
- 5 红线 diff is non-empty
- Bidirectional TDD check fails (step 2 passes unexpectedly)
- The new test starts passing for a different reason (would invalidate RED → GREEN verification)
- Default registry inadvertently changes
- A new dependency is needed (out of scope per §拍板 #6)
