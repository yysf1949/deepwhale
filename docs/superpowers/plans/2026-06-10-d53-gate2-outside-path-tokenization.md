# D53 Gate-2 Outside-Path Tokenization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for the code change and superpowers:verification-before-completion before committing.

**Goal:** Harden Gate-2 goal-drift detection so a shell command cannot hide an outside-workspace absolute path by also mentioning the materialized workspace path.

**Architecture:** Keep the D40/D52 drift model and strict Gate-2 pass rules unchanged. Improve only the outside-workspace hard-fail signal by scanning each string argument for individual path-like tokens instead of treating the whole command string as one path.

**Constraints:**

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked plan files.
- Do not alter `evaluatePassedLive()` thresholds.
- Do not weaken drift detection.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or default tool exposure.
- Use TDD: RED test first, then minimal implementation.

## Files

- Modify: `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`
  - Add a regression test where one bash command contains both an in-workspace path and an outside absolute path.
- Modify: `packages/coding-agent/scripts/gate2-runner-live.ts`
  - Tokenize string args for Windows drive paths and POSIX absolute paths.
  - Keep relative paths and URLs from being false positives.

## Task 1: RED Test

- [x] Add a test named `bash command with workspace path plus outside absolute path => DRIFT (D-53)`.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

Expected before implementation: the new test fails because the current detector sees the workspace path in the command string and misses the outside path.

Execution note: RED verified. Focused test run failed with 1 expected assertion failure: the new D53 test received `false` instead of `true` while the previous 39 tests passed.

## Task 2: Implement Tokenized Outside-Path Detection

- [x] Add a small helper that extracts path-like tokens from strings.
- [x] Detect Windows drive paths such as `C:/Users/x/file.txt` and `D:\repo\file.txt`.
- [x] Detect POSIX absolute paths such as `/etc/passwd`.
- [x] Do not treat URLs such as `https://example.com/a` as local paths.
- [x] Recurse through arrays and object values exactly like the current detector.

Execution note: first implementation exposed a false positive on relative `test/invoice.test.ts` and `https://...` URL text. Root cause: path regex lacked token boundaries. Fixed by requiring POSIX absolute paths to start at a shell-like boundary and requiring Windows drive paths to start at a non-word/non-URL boundary.

## Task 3: Verification

- [x] Run the focused Gate-2 test file.
- [x] Run Gate-2 related tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/test/unit/gate2-long-horizon.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
```

- [x] Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
```

If `pnpm.cmd test` fails in the sandbox with `[ERROR] fetch failed`, rerun the same command with approval and record both outcomes.

Execution note: focused test file passed with 41/41 tests after adding the D53 regression and URL/relative-path guard.

Wider verification note:

- Gate-2 related tests passed with 3 files and 49 tests.
- `.\node_modules\.bin\tsc.cmd -b`: passed.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: passed.
- `git diff --check`: clean.
- `pnpm.cmd test`: sandbox run failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of `pnpm.cmd test`: passed with 194 test files (193 passed, 1 skipped) and 1161 tests (1157 passed, 4 skipped).

## Task 4: Commit And Push

- [ ] Stage only D53 files.
- [ ] Commit with:

```powershell
git commit -m "fix(D-53): tokenize Gate-2 outside workspace paths"
```

- [ ] Push `feature/d36-gate2-live`.
