# D-77 Planner Main-Loop Evidence Fixture Sub-Sprint

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development (RED → GREEN → REFACTOR) and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax.

**Parent plan:** `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md` § "Stage 4: v2.5" and `docs/superpowers/plans/2026-06-10-v5-long-horizon.md` § V5.1.

**Branch:** `feature/d36-gate2-live` (current). This sub-sprint is committed on top of D-75 (`bc0b1e6`).

**Goal:** Convert the v2.5 planner integration gap into a main-loop evidence fixture. Prove that `runToolLoopWithReview` calls `planner.plan({ goal })` with the latest user goal when both `planner` and `taskGraph` are provided, and that the resulting tasks are recorded into the task graph before any tool call.

---

## 拍板 (Pre-resolved decisions, no further input needed)

1. **Scope:** Only `tool-loop-policy.ts` (wrapper) + 1 new integration test. Do NOT touch `runToolLoop`, `repl/*.ts`, `modes/tui.ts`, or `src/planner/*` (planner is the consumer's responsibility, not the wrapper's).
2. **Extension model:** Add `planner?: Planner` to `RunCommandWithReviewOptions`. Extend `TaskGraphRecorder` with an optional `recordPlan?(input: { tasks: ReadonlyArray<{ id: string; goal: string }> }): Promise<void>`. Both are optional; existing callers are unaffected.
3. **Order:** `recordGoal(goal)` → `planner.plan({ goal })` (only if planner present) → `recordPlan(...)` (only if taskGraph has the method) → `runToolLoop(...)`. The plan runs BEFORE the loop so the plan is observable.
4. **5 红线 0 改:** This sub-sprint does NOT touch `runToolLoop`, `repl/*.ts`, or `modes/tui.ts`. Verify with `git diff main..HEAD -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts packages/coding-agent/src/agent/tool-loop.ts` showing no changes to those paths.
5. **Default registry unchanged:** This sub-sprint does not register, expose, or remove any tools.
6. **No new dependencies, no formatting changes outside edited lines, no scratch / 0 /tmp.**
7. **No package version bump** (D-77 is a scorecard-evidence slice, not a release).
8. **Status block advance:** current sprint D-75 → D-77, next slice → D-78. (D-76 stays deferred per D-73 live ledger.)

---

## Repository State Baseline

```bash
git rev-parse HEAD            # bc0b1e6 (D-75 ship marker)
git status --short --branch   # 12 untracked plan md, 0 modified
pnpm test 2>&1 | grep "Tests" # baseline: 1196 pass / 1 fail (D-11) / 4 skip
```

The 1 pre-existing fail is `verify-runner.test.ts` (D-11, accepted as pre-existing).

---

## Task 1: Write the RED Integration Test

**Files:**
- Modify: `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

**Step 1: Append the failing test**

Add to the `describe('tool-loop-policy integration', ...)` block (after the D-75 test):

```ts
  it('calls planner.plan with the latest user goal and records the resulting tasks into the task graph (D-77)', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const plannedGoals: string[] = [];
    const planner: Planner = {
      async plan({ goal }) {
        plannedGoals.push(goal);
        return { tasks: [{ id: 'p-0', goal, dependsOn: [] }] };
      },
      async callTool() {
        throw new Error('planner cannot call tools');
      },
    };
    const recordedPlans: Array<{ id: string; goal: string }> = [];
    const taskGraph: TaskGraphRecorder & {
      recordPlan: (input: { tasks: ReadonlyArray<{ id: string; goal: string }> }) => Promise<void>;
    } = {
      async recordToolCall() {
        /* noop */
      },
      async recordGoal() {
        /* noop */
      },
      async recordPlan(input) {
        recordedPlans.push(...input.tasks);
      },
    };

    await runToolLoopWithReview({
      client: llm,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'ship D77 planner evidence' },
      ],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      planner,
      taskGraph,
    });

    expect(plannedGoals).toEqual(['ship D77 planner evidence']);
    expect(recordedPlans).toEqual([{ id: 'p-0', goal: 'ship D77 planner evidence' }]);
  });
```

**Step 2: Update imports at the top of the file**

Add to the existing import line:

```ts
import { runToolLoopWithReview, type Planner, type Reviewer, type TaskGraphRecorder } from '../../src/agent/tool-loop-policy.js';
```

**Step 3: Run the test in isolation (expect RED, "Planner is not exported")**

```bash
pnpm vitest run packages/coding-agent/test/integration/tool-loop-policy.test.ts -t "D-77" --reporter=verbose
```

**Expected BEFORE impl:** import error (TypeScript fails to find `Planner` export from `tool-loop-policy.js`).

---

## Task 2: Implement the Minimal Wrapper Extension

**Files:**
- Modify: `packages/coding-agent/src/agent/tool-loop-policy.ts`

**Step 1: Add the `Planner` import and re-export**

```ts
import type { Planner } from '../planner/planner.js';
```

Re-export so test files can import it from the wrapper:

```ts
export type { Planner };
```

**Step 2: Extend `TaskGraphRecorder` with optional `recordPlan`**

```ts
export interface TaskGraphRecorder {
  recordToolCall(input: { toolName: string; argsDigest: string; success: boolean; durationMs: number }): Promise<void>;
  recordGoal(goal: string): Promise<void>;
  recordPlan?(input: { tasks: ReadonlyArray<{ id: string; goal: string }> }): Promise<void>;
}
```

**Step 3: Add `planner?` to `RunCommandWithReviewOptions`**

```ts
export interface RunCommandWithReviewOptions extends Omit<ToolLoopOptions, 'registry' | 'maxSteps'> {
  readonly client: LLMClient;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly registry?: ToolLoopOptions['registry'];
  readonly maxSteps?: number;
  readonly reviewer?: Reviewer;
  readonly reviewGates?: ReadonlyArray<string>;
  readonly taskGraph?: TaskGraphRecorder;
  readonly planner?: Planner;
}
```

**Step 4: Add plan-orchestration block after the recordGoal block**

In `runToolLoopWithReview`, after the existing `if (taskGraph) { ... recordGoal(goal); }` block, add:

```ts
  if (planner) {
    const goal = latestUserGoal(messages);
    if (goal) {
      const plan = await planner.plan({ goal });
      if (taskGraph && typeof taskGraph.recordPlan === 'function') {
        await taskGraph.recordPlan({
          tasks: plan.tasks.map((t) => ({ id: t.id, goal: t.goal })),
        });
      }
    }
  }
```

**Step 5: Run the test in isolation (expect GREEN)**

```bash
pnpm vitest run packages/coding-agent/test/integration/tool-loop-policy.test.ts -t "D-77" --reporter=verbose
```

**Expected:** PASS.

---

## Task 3: Verify RED → GREEN Cycle Properly

**Step 1: Confirm the test catches the regression**

Stash the impl changes, rerun the test, expect FAIL, restore.

```bash
git stash push --keep-index -- packages/coding-agent/src/agent/tool-loop-policy.ts
pnpm vitest run packages/coding-agent/test/integration/tool-loop-policy.test.ts -t "D-77" --reporter=verbose
# Expected: FAIL (plannedGoals is empty OR recordedPlans is empty)
git stash pop
pnpm vitest run packages/coding-agent/test/integration/tool-loop-policy.test.ts -t "D-77" --reporter=verbose
# Expected: PASS
```

---

## Task 4: Update Status Documents

**Files:**
- Modify: `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md` (status blocks only)
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` (advance to D-77 expectations)
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json` (D-77 evidence, nextActions advance)
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md` (mirror)

**Step 1: status-doc-hygiene test changes**

- `Current sprint: D75 ...` → `Current sprint: D77 planner main-loop evidence fixture`
- Add `D77 planner main-loop evidence fixture` to the completed-slices list
- Add `D76 Gate-1.5 live Browser task sourcing` to the completed-slices list only if D-76 is already done (it is NOT — keep D-76 in next-actions instead and update the next-implementation-slice)
- `Next implementation slice: D76 ...` → `Next implementation slice: D78 cross-session memory crash/reload evidence`
- scorecard nextActions: remove D-77, remove D-76 (D-76 stays in the live browser ledger doc, not in scorecard nextActions), keep D-78
- Add D-77 to the negative-match list (`not.toMatch(/Current sprint: D75/i)` etc.)
- Add D-77 to the v2.5 evidence list in the scorecard
- Aggregate percent: 48 → 50 (v2.5 moves 40 → 50 because the planner main-loop evidence fixture exists)

**Step 2: README/ROADMAP/ROADMAP_DECISIONS status block changes**

- `Current sprint: D75 ...` → `Current sprint: D77 planner main-loop evidence fixture`
- Add `D77 planner main-loop evidence fixture: ...` to completed-slices
- `Next implementation slice: D76 ...` → `Next implementation slice: D78 cross-session memory crash/reload evidence`
- `Last status hygiene sprint: D75.` → `Last status hygiene sprint: D77.`
- Add `D77 plan: docs/superpowers/plans/2026-06-10-d77-planner-main-loop-evidence.md` to the reading guide

**Step 3: Scorecard JSON changes**

- aggregatePercent: 48 → 50
- v2.5 percent: 40 → 50
- v2.5 evidence: add `"D77 records planner.plan invocation in the main loop with the latest user goal when a Planner is provided"`
- nextActions: replace with `["D78: harden cross-session memory crash/reload evidence before any v4.0 rescore."]`

**Step 4: Scorecard MD changes**

- mirror JSON changes
- add D-77 to evidence updates list

**Step 5: Run status-doc-hygiene test**

```bash
pnpm vitest run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

**Expected:** 8/8 pass.

---

## Task 5: Full Verification

```bash
cd D:/App/openClaw/projects/deepwhale
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
git status --short --branch
```

**Expected:**
- typecheck: exit 0
- lint: exit 0, zero warnings
- test: 1197 pass / 1 pre-existing D-11 fail / 4 skip (delta = +1 from the D-77 test)
- build: exit 0
- diff --check: exit 0
- status: only 12 untracked plan md files + 1 modified impl + 1 modified test + 1 modified hygiene test + 3 status docs + 2 scorecard files

---

## Task 6: 5 红线 Verification

```bash
git diff main..HEAD -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts packages/coding-agent/src/agent/tool-loop.ts 2>&1 | head -10
```

**Expected:** empty diff (this sub-sprint only touches `tool-loop-policy.ts` + tests + docs + scorecard).

---

## Task 7: Stage and Commit

**Step 1: Stage D-77 files only (do not use `git add .`)**

```bash
git add \
  packages/coding-agent/src/agent/tool-loop-policy.ts \
  packages/coding-agent/test/integration/tool-loop-policy.test.ts \
  packages/coding-agent/test/unit/status-doc-hygiene.test.ts \
  README.md ROADMAP.md docs/ROADMAP_DECISIONS.md \
  docs/superpowers/v1-v4-evidence-scorecard.json \
  docs/superpowers/v1-v4-evidence-scorecard.md \
  docs/superpowers/plans/2026-06-10-d77-planner-main-loop-evidence.md
```

**Step 2: Commit**

```bash
git commit -m "feat(D-77): wire planner.plan into tool-loop wrapper

- runToolLoopWithReview now calls planner.plan({ goal }) with the
  latest user goal when a planner is provided.
- TaskGraphRecorder extended with optional recordPlan method.
- Added 1 RED→GREEN→RED→GREEN verified integration test.
- Status blocks advanced to current sprint D-77.
- Scorecard aggregate 48→50, v2.5 40→50, nextActions advanced to D-78.
- 1196→1197 pass / 1 pre-existing D-11 fail / 4 skip.
- typecheck, lint, build, diff --check all exit 0.
- 5 红线 preserved: this sub-sprint does not touch runToolLoop or repl/*."
```

**Step 3: Ship marker**

```bash
git commit --allow-empty -m "ship(coding-agent): D-77 收口 (1 task, 1 commit + 1 ship marker, planner main-loop evidence fixture + scorecard 48→50, 1196→1197 pass, typecheck/lint/build/diff-check 0, 5 红线 0 改)"
```

**Step 4: Push**

```bash
git push origin feature/d36-gate2-live
```

---

## Acceptance Criteria Summary

- 1 feat commit + 1 ship marker commit on `feature/d36-gate2-live`
- Test count: 1196 → 1197 (delta = +1 new test)
- Scorecard: aggregate 48 → 50, v2.5 40 → 50
- 5 红线 preserved
- Default registry unchanged
- typecheck/lint/build/diff --check all exit 0
- Branch pushed to `feature/d36-gate2-live`

---

## STOP Conditions

Stop and report to parent (do NOT improvise beyond these):

- 3 failed test runs in a row on the same task
- A 5 红线 line was inadvertently touched
- The test passes without the impl (test theater)
- `pnpm test` shows a NEW fail (delta > 0 in fail count)
- Default registry exposure needs to change
