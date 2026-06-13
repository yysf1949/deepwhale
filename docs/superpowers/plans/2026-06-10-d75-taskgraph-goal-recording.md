# D75 TaskGraph Goal Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten planner/reviewer/taskgraph main-loop integration evidence by recording the latest user goal through `runToolLoopWithReview` when a `TaskGraphRecorder` is provided.

**Architecture:** Add one regression test to the existing policy-wrapper integration suite proving that the wrapper calls `recordGoal` with the latest user message before/alongside task graph tool-call recording. Implement a small helper that extracts the latest non-empty user string from the messages passed to the wrapper. Keep `runToolLoop` itself unchanged and do not expand the default registry.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON status docs.

---

## File Structure

- Modify `packages/coding-agent/test/integration/tool-loop-policy.test.ts`: add RED coverage for task graph goal recording.
- Modify `packages/coding-agent/src/agent/tool-loop-policy.ts`: record the latest user goal when `taskGraph` is present.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: advance status docs and scorecard expectations to D75/D76-D78.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: add completed D75 slice and next work D76.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`: add D75 v2.5 evidence while preserving the integration caveat and 48% aggregate.

## Task 1: RED TaskGraph Goal Recording

**Files:**
- Modify: `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

- [ ] **Step 1: Add failing regression test**

Add this test after `records tool invocations into the task graph and reports the count`:

```ts
  it('records the latest user goal into the task graph when provided', async () => {
    const llm = new ScriptedLlm([stopResult]);
    const recordedGoals: string[] = [];
    const taskGraph: TaskGraphRecorder = {
      async recordToolCall() {
        /* noop */
      },
      async recordGoal(goal) {
        recordedGoals.push(goal);
      },
    };

    await runToolLoopWithReview({
      client: llm,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'first goal' },
        { role: 'assistant', content: 'ack' },
        { role: 'user', content: 'ship D75 task graph evidence' },
      ],
      registry: createDefaultRegistry(),
      maxSteps: 3,
      taskGraph,
    });

    expect(recordedGoals).toEqual(['ship D75 task graph evidence']);
  });
```

- [ ] **Step 2: Run focused RED**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/integration/tool-loop-policy.test.ts -t "latest user goal" --reporter=verbose
```

Expected: FAIL because `runToolLoopWithReview` currently never calls `recordGoal`.

## Task 2: Minimal Policy Wrapper Fix

**Files:**
- Modify: `packages/coding-agent/src/agent/tool-loop-policy.ts`

- [ ] **Step 1: Add latest user goal helper**

Add near `DEFAULT_REVIEW_GATES`:

```ts
function latestUserGoal(messages: ReadonlyArray<ChatMessage>): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user' || typeof message.content !== 'string') continue;
    const goal = message.content.trim();
    if (goal.length > 0) return goal;
  }
  return undefined;
}
```

- [ ] **Step 2: Record the goal before running the loop**

In `runToolLoopWithReview`, after `loopOptionsClean` is built and before `runToolLoop` is called:

```ts
  if (taskGraph) {
    const goal = latestUserGoal(messages);
    if (goal) await taskGraph.recordGoal(goal);
  }
```

- [ ] **Step 3: Run focused GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/integration/tool-loop-policy.test.ts -t "latest user goal" --reporter=verbose
```

Expected: PASS.

## Task 3: Status Docs RED/GREEN

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`

- [ ] **Step 1: Update status hygiene test**

Change scorecard nextActions expectations to:

```ts
expect(scorecard.nextActions).toContain(
  'D76: collect real Gate-1.5 Browser task runs only after opt-in Browser task sourcing is available.',
);
expect(scorecard.nextActions).toContain(
  'D77: convert the v2.5 planner integration gap into a main-loop evidence fixture before any rescore.',
);
expect(scorecard.nextActions).toContain(
  'D78: harden cross-session memory crash/reload evidence before any v4.0 rescore.',
);
expect(scorecard.nextActions.join('\n')).not.toMatch(/^D75:/m);
```

Change final status assertions:

```ts
expect(block).toContain('Current sprint: D75 TaskGraph goal recording integration evidence');
expect(block).toContain('D75 TaskGraph goal recording integration evidence');
expect(block).toContain('Next implementation slice: D76 Gate-1.5 live Browser task sourcing');
expect(block).not.toMatch(/Current sprint: D74/i);
expect(block).not.toMatch(/Next implementation slice: D75/i);
```

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: FAIL until docs and scorecard are updated.

- [ ] **Step 2: Update public status docs**

In all three public docs:

- Change current sprint to `D75 TaskGraph goal recording integration evidence`.
- Add completed slice `D75 TaskGraph goal recording integration evidence: runToolLoopWithReview records the latest user goal when a TaskGraphRecorder is provided.`
- Change next implementation slice to `D76 Gate-1.5 live Browser task sourcing`.

In README only:

- Add `D75 plan: docs/superpowers/plans/2026-06-10-d75-taskgraph-goal-recording.md`.
- Change `Last status hygiene sprint: D74.` to `Last status hygiene sprint: D75.`

- [ ] **Step 3: Update scorecard**

Keep aggregate `48%` and v2.5 `40%`.

Add v2.5 evidence:

```json
"D75 records latest user goals into TaskGraphRecorder through runToolLoopWithReview"
```

Change next actions to:

```json
[
  "D76: collect real Gate-1.5 Browser task runs only after opt-in Browser task sourcing is available.",
  "D77: convert the v2.5 planner integration gap into a main-loop evidence fixture before any rescore.",
  "D78: harden cross-session memory crash/reload evidence before any v4.0 rescore."
]
```

Mirror those updates in Markdown.

- [ ] **Step 4: Run status GREEN**

Run:

```powershell
./node_modules/.bin/vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
```

Expected: PASS.

## Task 4: Full Verification And Git

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full verification**

Run:

```powershell
./node_modules/.bin/tsc.cmd -b --pretty false
./node_modules/.bin/eslint.cmd . --max-warnings 0
git diff --check
./node_modules/.bin/vitest.cmd run --reporter=verbose
pnpm.cmd build
```

Expected: all commands exit 0. If a live integration test fails from LLM nondeterminism, rerun the specific failing test once to classify it, then rerun full Vitest for fresh evidence.

- [ ] **Step 2: Stage D75 files only**

Run:

```powershell
git add packages/coding-agent/src/agent/tool-loop-policy.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-10-d75-taskgraph-goal-recording.md
```

Expected: unrelated untracked plan files remain unstaged.

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "feat(D-75): record task graph goals in review wrapper"
git push
```

Expected: commit and push succeed on `feature/d36-gate2-live`.

---

## Self-Review

- Spec coverage: D75 strengthens one concrete main-loop integration point without changing `runToolLoop`.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: `recordGoal(goal: string)` already exists on `TaskGraphRecorder`.
- Scope guard: No default registry expansion, no planner execution claim, no v2.5 completion claim, and no Browser unlock.
