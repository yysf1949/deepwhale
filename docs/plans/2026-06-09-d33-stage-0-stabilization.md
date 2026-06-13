# D-33 Stage 0 Stabilization Sub-Sprint

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development (RED → GREEN → REFACTOR) and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax.

**Parent plan:** `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md` § "Stage 0: Stabilization And Release Hygiene"

**Branch:** create `feature/d33-stage-0-stabilization` from current `release/v2.0` HEAD `afbbe06`.

**Goal:** Lock Gate-0 readiness by adding regression tests for the `undefined/.deepwhale/tui-history` bug, removing the existing generated bad state, and aligning public status to match actual current state. Default capability surface freeze is already done (D-32.3 ship).

---

## 拍板 (Pre-resolved decisions, no further input needed)

1. **Existing `registry-profiles.test.ts` already covers Task 0.1** — DO NOT duplicate. Verify it still passes; commit a marker commit if changes are needed.
2. **`undefined/.deepwhale/tui-history` is already in `.gitignore`** (line 31) — DO NOT remove the gitignore entry; just delete the generated file and add a regression test.
3. **Test signature for `resolveDeepwhaleHome`** stays `resolveDeepwhaleHome(homeOverride?: string)`. The plan's pseudo-code uses `{ cwd, env }` shape, but changing the signature is out of scope. Write the regression test against the current signature: delete all env vars in `beforeEach`, call `resolveDeepwhaleHome()` with no args, assert the result does NOT contain the literal substring `undefined`.
4. **ROADMAP.md / README.md overclaim check** — only edit lines that ACTUALLY overclaim. DO NOT rewrite whole files. DO NOT change phase/gate/version anchors (ROADMAP is locked per its own header).
5. **No new package.json scripts.** No new dependencies. No formatting changes outside the edited lines.
6. **0 scratch / 0 /tmp / 0 verify.mjs in commits.** Use `os.tmpdir()` or `mkdtempSync(join(tmpdir(), ...))` (which `deepwhale-paths.test.ts` already does) for any temp dirs in tests.
7. **5 红线 0 改:** the 5 red lines (1ceef94 try/finally, D-19.5 P2-SIGINT dispose, 6afccc8, D-19.6, no-unsafe-finally) are documented at scattered line ranges in `packages/coding-agent/src/repl/*.ts` and `packages/coding-agent/src/modes/tui.ts`. This sub-sprint does NOT touch any of those line ranges. Use `git diff` on the listed files to verify.
8. **Commit order:** Task 0.2 first (fix + test), then Task 0.3 (docs), then ship marker.

---

## Repository State Baseline (record before starting)

Run from `D:\App\openClaw\projects\deepwhale`:

```bash
git rev-parse HEAD            # should be afbbe06
git status --short --branch   # should be clean except 2 untracked plan md
pnpm test 2>&1 | grep -E "Test Files|Tests"  # baseline: 1046 pass / 1 fail / 5 skip
ls -la undefined/ 2>&1        # should show undefined/.deepwhale/tui-history
```

The 1 pre-existing fail is `verify-runner.test.ts` (D-11 spawn-error status, accepted as pre-existing).

---

## Task 0.2: Fix Generated Undefined State

**Files:**
- Modify: `packages/coding-agent/test/unit/deepwhale-paths.test.ts` (add 1 regression test)
- Modify: `packages/coding-agent/test/util/tui-history.test.ts` (add 1 regression test)
- Modify (only if test fails after first attempt): `packages/coding-agent/src/util/deepwhale-paths.ts` and/or `packages/coding-agent/src/util/tui-history.ts`
- Delete: `undefined/.deepwhale/tui-history` (after `git status` confirms it is untracked, i.e. covered by .gitignore)

**Step 1: Write failing regression tests**

Append these tests to the existing `describe` blocks in each test file:

In `packages/coding-agent/test/unit/deepwhale-paths.test.ts`, append to the `describe('deepwhale-paths (D-30.1δ.1)', ...)` block:

```ts
it('regression: never returns a path containing the literal substring "undefined" (D-33.0.2)', () => {
  // Worst case: all env vars deleted AND no homeOverride.
  // resolveDeepwhaleHome() must fall through to homedir() which never returns the
  // string "undefined". This guards the historical bug where tui-history got
  // written to <cwd>/undefined/.deepwhale/tui-history.
  delete process.env.HOME;
  delete process.env.USERPROFILE;
  delete process.env.DEEPWHALE_HOME;
  const root = deepwhaleRoot();
  expect(root.replaceAll('\\', '/')).not.toContain('/undefined/');
  expect(root.replaceAll('\\', '/')).not.toContain('undefined/.deepwhale');
});
```

In `packages/coding-agent/test/util/tui-history.test.ts`, append to the `describe('tui-history util (D-25 B4)', ...)` block (note: the existing `beforeEach` already sets HOME+USERPROFILE to a tmp dir, so we need to delete them inside the test):

```ts
it('regression: tuiHistoryPath never resolves below a string-typed "undefined" dir (D-33.0.2)', () => {
  delete process.env.HOME;
  delete process.env.USERPROFILE;
  delete process.env.DEEPWHALE_HOME;
  const path = tuiHistoryPath().replaceAll('\\', '/');
  expect(path).not.toContain('/undefined/');
  expect(path).not.toContain('undefined/.deepwhale');
});
```

**Step 2: Run the two regression tests in isolation**

```bash
pnpm vitest run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts
```

- **Expected BEFORE any code change**: BOTH new tests should PASS (because `os.homedir()` returns a real Windows user dir, e.g. `C:\Users\butterfly443`, even when env vars are deleted). If they pass, you have a regression guard — proceed to Step 3.
- If any new test FAILS, the bug still exists: investigate the impl in `packages/coding-agent/src/util/deepwhale-paths.ts` `resolveDeepwhaleHome` and `packages/coding-agent/src/util/tui-history.ts` `resolveTuiHome`. Add a guard: if the resolved value is empty, fall through to `homedir()`. Keep the smallest possible patch.

**Step 3: Remove the generated bad state**

```bash
# Confirm the file is git-ignored before removing
git check-ignore -v undefined/.deepwhale/tui-history
# Expected: ".gitignore:31:.deepwhale/	undefined/.deepwhale/tui-history"

rm -rf undefined/
ls -la undefined/ 2>&1   # Expected: "No such file or directory"
```

**Step 4: Rerun targeted tests**

```bash
pnpm vitest run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts
```

- **Expected**: exit code 0, both old + new tests pass.

**Step 5: Commit**

```bash
git add packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts
git commit -m "test(coding-agent): guard undefined deepwhale state paths (D-33.0.2)"
```

If you had to modify the impl files in Step 2, also add them:

```bash
git add packages/coding-agent/src/util/deepwhale-paths.ts packages/coding-agent/src/util/tui-history.ts
git commit -m "fix(coding-agent): prevent undefined deepwhale state path (D-33.0.2)"
```

---

## Task 0.3: Align Public Status Without Overclaiming

**Files (edit ONLY the listed overclaim lines, do not rewrite):**
- `README.md`
- `ROADMAP.md`
- `docs/ROADMAP_DECISIONS.md`
- `docs/superpowers/2026-06-08-gate-1-smoke-report.md`

**Step 1: Add stabilization status block to README.md (if not already present)**

Check the first 30 lines of `README.md` for a "当前分支状态" block. From inspection 2026-06-09, the block EXISTS at lines 3-4. **Skip this step if the block is already there and accurate.**

If the block is missing or inaccurate, insert (immediately after the line "> **DeepSeek-first 开源 Claude Code 替代品 → Codex Clone → Agent OS**"):

```markdown
> **当前分支状态（2026-06-09, `release/v2.0`, HEAD `afbbe06`）**：stabilization + Gate sprint 完. 默认 registry 只暴露 coding + Code Intel essentials (19 tools), Browser / media / productivity / research / engineering 工具保留为显式 profile opt-in. Gate-1 Vite 86K LOC 已 pass, 当前 workspace 仍 < 50K LOC 故 `pnpm gate1:current` 报 `loc-below-minimum` (acceptable). 41 tools 装在 `all` profile, 默认 0 暴露.
```

**Step 2: Overclaim audit (do not edit unless an actual overclaim exists)**

Run:

```bash
rg -n "v1.0.*完成|v2.0.*完成|shipped|production" README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/2026-06-08-gate-1-smoke-report.md
```

For each match, decide:
- (a) Line is a legitimate statement (e.g. "v1.0 已发布" referring to a past release that actually shipped) → **leave alone**.
- (b) Line overclaims (e.g. "v2.0 必完成" treated as if v2.0 is already shipped) → **soften** with wording like "v2.0 unlock 条件: Gate-0 green + 显式 user approval" (per the master plan's Stage 3 unlock condition).

DO NOT change:
- Phase / Bet / Gate / version anchor lines (ROADMAP is locked).
- Past-release lines that accurately describe shipped work (e.g. "v1.0.16 已发布 2026-06-08").
- The P0/P1 bet statements (those describe the BET, not completion).

**Step 3: Update gate-1 smoke report timestamp if needed**

If `docs/superpowers/2026-06-08-gate-1-smoke-report.md` mentions a date older than 2026-06-09 in a "last updated" line, update the date but do NOT change the LOC numbers or `passed: true` line (the Vite evidence is the formal Gate-1 result; the smoke report is a docstring).

**Step 4: Verify no remaining overclaim in the 4 files**

```bash
rg -n "Gate-1.*complete|default.*Browser|default.*media|default.*productivity" README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/2026-06-08-gate-1-smoke-report.md
```

- **Expected**: no line overclaims default non-coding exposure or unqualified Gate-1 completion (other than references to formal Vite Gate-1 PASS which is legitimate).

**Step 5: Commit**

```bash
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/2026-06-08-gate-1-smoke-report.md
git commit -m "docs: align stabilization status (D-33.0.3)"
```

If no file was actually changed in Steps 1-3, **skip this commit** (opencode should report "no changes" and not commit an empty commit). Do NOT use `--allow-empty` for a docs task.

---

## Task 0.4: Gate-0 Verification

**Files:** none (verification only).

**Step 1: Run the full Gate-0 verification matrix**

```bash
cd D:/App/openClaw/projects/deepwhale
pnpm typecheck 2>&1 | tail -5
pnpm lint 2>&1 | tail -5
pnpm test 2>&1 | tail -10
pnpm -F @deepwhale/code-intel exec tsx scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --caller createServer --callee _createServer --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md 2>&1 | tail -20
pnpm gate1:current 2>&1 | tail -20
git diff --check 2>&1 | tail -5
git status --short --branch
```

**Step 2: Acceptance criteria**

- [ ] `pnpm typecheck` exit 0
- [ ] `pnpm lint` exit 0, zero warnings
- [ ] `pnpm test` exit 0, **pass count went UP by exactly the new test count** (2 new tests: 1 in deepwhale-paths + 1 in tui-history). Baseline was 1046, so expected: 1048 pass. The 1 pre-existing `verify-runner.test.ts` fail may persist (NOT introduced by this work).
- [ ] `pnpm gate1:current` either passes on a 50K+ LOC repo, OR the Markdown report explicitly states the workspace is below 50K LOC and the Vite formal evidence is referenced.
- [ ] `git diff --check` exit 0.
- [ ] `git status --short --branch` shows only the 2 untracked plan md files + the 1-2 commits from this sub-sprint.

**Step 3: 5 红线 verification**

```bash
git diff main..HEAD -- packages/coding-agent/src/repl/ packages/coding-agent/src/modes/tui.ts 2>&1 | head -30
```

- **Expected**: 0 lines changed in the 5 红线 segments. The 5 red lines are at scattered positions in the repl/*.ts files and modes/tui.ts; this sub-sprint does NOT touch any of those files (only test files + docs + 1-2 impl files in deepwhale-paths/tui-history). So the diff should be empty for those paths.

**Step 4: If any check fails**

- DO NOT push. Create a follow-up opencode dispatch with the specific failure and the relevant file/line. Report the failure back to the parent session.

**Step 5: If all checks pass, ship marker commit**

```bash
git commit --allow-empty -m "ship(coding-agent): D-33 Stage 0 收口 (2-3 commit, stabilization + overclaim audit + Gate-0 验证, 5 红线 0 改, 1046→1048 pass)"
git push origin feature/d33-stage-0-stabilization
```

---

## Acceptance Criteria Summary

After this sub-sprint, the parent session should see:

- 1-2 feat/test commits + 1 docs commit (if docs changed) + 1 ship marker commit
- Total: 2-4 commits on `feature/d33-stage-0-stabilization`
- Test count: 1046 → 1048 (delta = 2 new regression tests, the 1 pre-existing fail remains)
- 5 红线 preserved (this sub-sprint does not touch those files)
- Default registry unchanged (Task 0.1 was already done in D-32.3)
- `undefined/.deepwhale/tui-history` removed (was untracked, in .gitignore)
- Branch pushed to `feature/d33-stage-0-stabilization` (NOT yet merged; merge is parent decision after Gate-1 evidence review)

---

## Deviations To Report Back

If any of the following happen, document them in the final report (do NOT silently fix):

1. Test signature change was needed (e.g. `resolveDeepwhaleHome({ cwd, env })` actually required). Report which impl was changed and why.
2. More than 2 new tests added (e.g. env-var cleanup helpers, helper extractions). Report the count.
3. Any 5 红线 line was touched. Report the line range and reason.
4. ROADMAP.md or `docs/ROADMAP_DECISIONS.md` could not be left alone (e.g. overclaim fix required changing a phase anchor). Report what was changed.
5. `pnpm test` pass count did NOT go up by exactly 2 (could indicate pre-existing test fragility or test infra change). Report actual delta.

## STOP Conditions

Stop and report to parent (do NOT improvise beyond these):

- 3 failed opencode dispatches in a row on the same task
- `pnpm test` shows a NEW fail (delta > 0 in fail count) introduced by this work
- Any 5 红线 line inadvertently touched and not revertable by simple `git checkout`
- The `undefined/.deepwhale/tui-history` file reappears after `rm -rf` (indicates an active test is producing it)
