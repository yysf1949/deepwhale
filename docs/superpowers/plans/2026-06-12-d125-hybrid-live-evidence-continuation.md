# D125 Hybrid Live Evidence Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the next Gate-1.5 hybrid live Browser evidence continuation through `recordHybridRealBrowserEvidence`, advancing repository evidence from 13/20 to 17/20 while keeping Browser defaults locked.

**Architecture:** Keep the existing opt-in hybrid runner API and D123/D124 `updatedLedger` chaining behavior. Add one regression test proving D125 can continue from a 13-success ledger to 17 completed results without flipping binding, then refresh the machine-readable Gate-1.5 ledger and public status docs to record 4 additional D125 successes. Do not change default registry exposure, Browser binding, or branch decision because 17/20 remains below the 20-task live-evidence threshold.

**Tech Stack:** TypeScript, Vitest, Node built-in fetch evidence, injected JS runner evidence, Markdown/JSON status files, pnpm workspace.

---

### Task 1: RED Test For D125 Updated-Ledger Continuation

**Files:**
- Modify: `packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts`

- [ ] **Step 1: Add a failing D125 continuation test**

Add a test after the D124 chaining test that starts with 13 successful tasks, runs one hybrid batch for `task-14` through `task-17`, and asserts that binding remains deferred at 17/20.

Expected test body:

```ts
  it('continues D125 hybrid accumulation to 17 completed tasks without unlocking Browser defaults', async () => {
    const ledger = buildLiveBrowserTaskLedger({
      generatedAt: '2026-06-12T00:00:00.000Z',
      tasks: makeTwentyTasks().map((task, index) =>
        index < 13 ? { ...task, status: 'success' as const } : task,
      ),
    });

    const evidence = await recordHybridRealBrowserEvidence({
      generatedAt: '2026-06-12T02:00:00.000Z',
      ledger,
      optIn: true,
      taskModes: {
        'task-14': 'http',
        'task-15': 'js',
        'task-16': 'js',
        'task-17': 'http',
      },
      realUrls: {
        'task-14': 'https://example.com/',
        'task-15': 'https://example.com/',
        'task-16': 'https://www.iana.org/',
        'task-17': 'https://www.iana.org/',
      },
      jsActions: {
        'task-15': 'click-element',
        'task-16': 'extract-text',
      },
      fetchFn: okFetch(),
      jsRunnerFn: okJsRunner(),
    });

    expect(evidence.runs.map((run) => run.taskId)).toEqual([
      'task-14',
      'task-15',
      'task-16',
      'task-17',
    ]);
    expect(evidence.totalCompletedBefore).toBe(13);
    expect(evidence.totalCompletedAfter).toBe(17);
    expect(evidence.totalPendingAfter).toBe(3);
    expect(evidence.updatedLedger.completedTasks).toBe(17);
    expect(evidence.updatedLedger.pendingTasks).toBe(3);
    expect(evidence.updatedLedger.successRate).toBe(1);
    expect(evidence.binding).toBe(false);
    expect(evidence.branchDecision).toBe('defer-live-evidence');
    expect(evidence.updatedLedger.browserEnhancementUnlocked).toBe(false);
    expect(evidence.updatedLedger.status).toBe('partial-results');
  });
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: FAIL before the expected D125 test content exists or before continuation expectations are implemented.

### Task 2: GREEN Hybrid Continuation

**Files:**
- Modify only if needed: `packages/coding-agent/src/browser/hybrid-real-browser-evidence-runner.ts`

- [ ] **Step 1: Run focused test after adding the D125 test**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts --reporter=verbose`

Expected: PASS if D123/D124 `updatedLedger` behavior already supports D125 continuation. If it fails, make the smallest change in `recordHybridRealBrowserEvidence` so the call records explicitly mapped pending tasks from a 13-success ledger and recomputes the returned `updatedLedger`.

### Task 3: Record D125 Live Evidence And Refresh Status Hygiene

**Files:**
- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.json`
- Modify: `docs/superpowers/gate-1.5-live-browser-tasks.md`
- Modify: `docs/superpowers/gate-1.5-browser-viability.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.json`
- Modify: `docs/superpowers/v1-v4-evidence-scorecard.md`
- Modify: `docs/superpowers/release-version-hygiene.json`

- [ ] **Step 1: Update status expectations first**

Update `status-doc-hygiene.test.ts` to expect:
- Current sprint: `D125 Gate-1.5 hybrid live evidence continuation (updatedLedger accumulation)`
- Gate-1.5 live result recorder: `17/20 completed`
- Ledger counters: pending `3`, completed `17`, successes `17`, failures `0`, successRate `1`
- Success task IDs add `settings-toggle`, `profile-edit`, `modal-open-close`, and `tabs-switch`
- Next implementation slice: `D126 Gate-1.5 hybrid live evidence completion and binding review`
- Scorecard first next action starts with `D126:`

- [ ] **Step 2: Run status hygiene to verify RED**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: FAIL until docs and evidence JSON are updated.

- [ ] **Step 3: Refresh D125 machine-readable evidence**

Update `docs/superpowers/gate-1.5-live-browser-tasks.json`:
- `generatedAt`: `2026-06-12T02:00:00.000Z`
- `slice`: `D125`
- `pendingTasks`: `3`
- `completedTasks`: `17`
- `successes`: `17`
- `successRate`: `1`
- keep `binding: false`, `branchDecision: defer-live-evidence`, `browserEnhancementUnlocked: false`
- mark `settings-toggle`, `profile-edit`, `modal-open-close`, and `tabs-switch` as `success`
- tag them with `evidenceSubSprint: D-125`
- use `evidenceKind: real-fetch` for `settings-toggle` and `tabs-switch`
- use `evidenceKind: real-js` for `profile-edit` and `modal-open-close`
- update `reason`, `constraints`, and `nextAction` to D126.

Run a transient local probe before editing the ledger. The probe must collect:
- For `settings-toggle`: fetch `https://example.com/` and capture observed `status`, `contentType`, `bodyLen`, `title`, `finalUrl`, and `ms`.
- For `profile-edit`: run JS `click-element` against `https://example.com/` and capture observed `interactedElement`, `pageTitle`, `textSample`, and `ms`.
- For `modal-open-close`: run JS `extract-text` against `https://www.iana.org/` and capture observed `interactedElement`, `pageTitle`, `textSample`, and `ms`.
- For `tabs-switch`: fetch `https://www.iana.org/` and capture observed `status`, `contentType`, `bodyLen`, `title`, `finalUrl`, and `ms`.

Delete any transient probe file before staging. Do not copy estimated timings into evidence JSON; only copy values printed by the probe.

- [ ] **Step 4: Refresh public docs**

Mirror the D125 status in README, ROADMAP, ROADMAP_DECISIONS, Gate-1.5 Markdown, v1-v4 scorecard JSON/Markdown, release-version hygiene JSON, and Gate-1.5 viability JSON. Keep the honest caveat: 17/20 is still partial evidence, not a binding Browser branch decision. Add the D125 plan link and set Last status hygiene sprint to D125.

- [ ] **Step 5: Run status hygiene to verify GREEN**

Run: `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose`

Expected: PASS.

### Task 4: Full Verification, Commit, Push

**Files:**
- All modified files above plus this plan.

- [ ] **Step 1: Run focused verification**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts --reporter=verbose
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd test
git diff --check
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/gate-1.5-browser-viability.json docs/superpowers/gate-1.5-live-browser-tasks.json docs/superpowers/gate-1.5-live-browser-tasks.md docs/superpowers/release-version-hygiene.json docs/superpowers/v1-v4-evidence-scorecard.json docs/superpowers/v1-v4-evidence-scorecard.md docs/superpowers/plans/2026-06-12-d125-hybrid-live-evidence-continuation.md packages/coding-agent/test/unit/hybrid-real-browser-evidence-runner.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts
git commit -m "feat(D-125): continue hybrid live Browser evidence"
```

- [ ] **Step 3: Push**

Run: `git push origin feature/d36-gate2-live`

Expected: remote branch advances with the D125 commit.

### Self-Review

- Spec coverage: D125 advances the Gate-1.5 live-evidence blocker from 13/20 to 17/20 and keeps the binding branch deferred.
- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: D125 does not claim 20/20, does not unlock Browser defaults, and does not claim v1-v4 completion.
