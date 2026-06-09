# D52 Gate-2 Drift Expected-File Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Gate-2 goal-drift detection so workspace access plus a review-gate command cannot bypass the expected-file/goal-alignment requirement.

**Architecture:** Keep the existing four-signal drift detector and Gate-2 hard pass rules. Add one stricter guard when `expectedFile` is configured: if the transcript never touches the expected file and assistant text does not mention the goal, the workflow is drift even if it referenced the workspace and ran the review gate. This preserves D40's weighted signal model while closing the known weak pair.

**Tech Stack:** TypeScript, Vitest, existing Gate-2 live runner utilities, PowerShell on Windows.

---

## Current Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked plan files.
- Do not alter Gate-2 pass thresholds: source live, review approve, final pass, no liveError, 30-50 calls, drift false.
- Do not weaken drift detection or add heuristic overrides to `passed_live`.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or other non-coding default capabilities.
- Use TDD: write failing test, verify RED, implement, verify GREEN.

## Files

- Modify: `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`
  - Add a regression test proving workspace scope + review gate alone is drift when `expectedFile` is configured and no assistant goal text is present.
- Modify: `packages/coding-agent/scripts/gate2-runner-live.ts`
  - Split the four drift signals into named booleans.
  - Add the expected-file hardening guard before returning the weighted result.
  - Update comments to document the stricter rule.
- Create: `docs/superpowers/plans/2026-06-10-d52-gate2-drift-expected-file-hardening.md`

## Task 1: RED Test For Weak Pair

- [x] **Step 1: Add the regression test**

Add this test inside `describe('gate2-runner-live: detectGoalDrift (D-40 stricter)', ...)` in `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`:

```ts
it('workspace scope + review gate without expectedFile or goal text => DRIFT (D-52)', async () => {
  const { detectGoalDrift } = await import('../../scripts/gate2-runner-live.js');
  const goal = 'Fix the bugs in src/pricing.ts so the invoice test suite passes';
  const drift = detectGoalDrift({
    goal,
    expectedFile: 'src/pricing.ts',
    workspacePath: 'C:/tmp/gate2-fixt-abc',
    toolCalls: [
      { toolName: 'bash', args: { command: 'ls C:/tmp/gate2-fixt-abc' } },
      { toolName: 'bash', args: { command: 'node --test test/invoice.test.ts' } },
    ],
    assistantContent: ['I will run the verification command now.'],
    reviewCommands: ['node --test test/invoice.test.ts'],
  });
  expect(drift).toBe(true);
});
```

- [x] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

Expected before implementation: fail because the current detector counts workspace scope + review gate as 2 positives and returns `false`.

Execution note: RED verified. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts` failed with 1 assertion failure because the detector returned `false` for workspace scope + review gate without expected-file touch or goal text.

## Task 2: Implement Expected-File Hardening

- [x] **Step 1: Name the four positive signals**

In `packages/coding-agent/scripts/gate2-runner-live.ts`, replace the repeated inline `if` checks with:

```ts
const hasWorkspaceScope = input.toolCalls.some((tc) => argsReferenceWorkspace(tc.args, workspaceNorm, expectedFile));
const hasExpectedFileTouch = expectedFile !== undefined && input.toolCalls.some((tc) => argsReferenceFile(tc.args, expectedFile));
const assistantMentionsGoal = input.assistantContent.some((msg) => {
  const msgLower = msg.toLowerCase();
  return goalKeywords.some((kw) => kw.length > 3 && msgLower.includes(kw));
});
const reviewGateInvoked = input.toolCalls.some((tc) => {
  if (tc.toolName !== 'bash') return false;
  const cmd = extractBashCommand(tc.args);
  if (cmd === undefined) return false;
  return input.reviewCommands.some((gate) => {
    const firstToken = gate.split(' ')[0]!;
    return cmd.includes(firstToken) || cmd.includes(gate);
  });
});
```

Then increment `positives` from those booleans.

- [x] **Step 2: Add the hardening guard**

After the outside-workspace hard fail and before `return positives < 2`, add:

```ts
if (expectedFile !== undefined && !hasExpectedFileTouch && !assistantMentionsGoal) {
  return true;
}
```

- [x] **Step 3: Update comments**

Update the detector comment so it explicitly says:

```ts
 * D-52 hardening: when expectedFile is configured, workspace scope plus
 * review gate is not enough. The transcript must either touch expectedFile
 * or assistant text must mention the goal.
```

- [x] **Step 4: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

Expected: pass.

Execution note: GREEN verified. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts` passed with 1 file and 39 tests.

## Task 3: Wider Verification

- [x] **Step 1: Run Gate-2 related tests**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/test/unit/gate2-long-horizon.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
```

Expected: pass.

Execution note: Passed. `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/test/unit/gate2-long-horizon.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts` passed with 3 files and 47 tests.

- [x] **Step 2: Run repository verification**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
git status --short --branch
```

Expected: typecheck, lint, tests, and diff check pass. If `pnpm.cmd test` fails in sandbox with a fetch/network error, rerun the same command with approval and record both outputs.

Execution note:

- `.\node_modules\.bin\tsc.cmd -b`: passed.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: passed.
- `git diff --check`: clean.
- `pnpm.cmd test`: sandbox run failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of `pnpm.cmd test`: passed with 194 test files (193 passed, 1 skipped) and 1159 tests (1155 passed, 4 skipped).

## Task 4: Commit And Push

- [x] **Step 1: Update this plan with execution notes**

Record RED/GREEN and verification results in this file before committing.

- [ ] **Step 2: Stage only D52 files**

Run:

```powershell
git add docs/superpowers/plans/2026-06-10-d52-gate2-drift-expected-file-hardening.md packages/coding-agent/scripts/gate2-runner-live.ts packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "fix(D-52): harden Gate-2 drift expected-file signal"
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- This plan does not change Gate-2 pass thresholds.
- This plan does not reinterpret existing Gate-2 evidence.
- This plan only makes drift detection stricter for configured expected-file tasks.
- D46's persisted report remains historical evidence; new live runs will use the stricter detector.
