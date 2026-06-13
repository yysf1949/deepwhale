# D60 Rename Symbol Scanner Truthfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `rename_symbol` lexical scanning with the Code Intel truthfulness fixes so default rename does not miss real TypeScript references or report comment/string/private-field noise as skipped references.

**Architecture:** Keep `rename_symbol` heuristic and conservative. Add regression tests around TypeScript private fields, block comments, strings, and skipped cross-file candidates; then replace the local line-comment-only scanner with a small language-aware comment masker in `rename-symbol.ts`. Do not change registry profiles or Gate thresholds.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, `@deepwhale/code-intel` symbol graph, existing coding-agent tool tests.

---

## Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*.md` and the untracked master execution plan.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or deploy tools.
- Do not weaken Gate-1 or Gate-2 thresholds.
- Keep `rename_symbol` descriptions honest: heuristic, not IDE-grade.
- Use TDD: write failing tests before production code.
- Do not use `git add .`.

## Files

- Modify: `packages/coding-agent/test/unit/rename-symbol.test.ts`
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`
- Create: `docs/superpowers/plans/2026-06-10-d60-rename-symbol-scanner-truthfulness.md`

## Task 1: RED Tests

- [x] Add a test proving a TypeScript private field marker before a real same-line call does not suppress the real rename.
- [x] Add a test proving skipped cross-file expansion ignores block comments, strings, and TypeScript private identifiers.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\rename-symbol.test.ts
```

Expected before implementation: at least the private-field same-line call test fails because the local scanner treats `#` as a universal comment marker; the skipped-reference test fails because block comments are scanned as candidate references.

Observed RED before implementation:

- `rename_symbol conservative mode > renames a real TypeScript call after a private field on the same line`: failed because `return target();` was not rewritten.
- `rename_symbol conservative mode > does not report comments, strings, or TS private identifiers as skipped cross-file references`: failed because a block-comment `target` was reported as a skipped reference.

## Task 2: Implement Scanner Fix

- [x] Pass each file language from `graph.files.get(file)?.language` into `rewriteReferences()`.
- [x] In `rewriteReferences()`, build masked source lines that preserve column offsets while removing language-appropriate comments.
- [x] Use TypeScript/JavaScript/Rust/Go style `//` and `/* */` comments without treating `#` as a comment.
- [x] Use Python/Bash style `#` line comments without treating `//` as a comment.
- [x] Skip TS/JS private identifiers whose identifier token is immediately preceded by `#`, while preserving later real tokens on the same line.
- [x] Use the same language-aware scanner in `expandSkippedReferences()`.

## Task 3: GREEN Verification

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\rename-symbol.test.ts
.\node_modules\.bin\vitest.cmd run packages\code-intel\test\unit\symbol-graph.test.ts
```

Expected: exit code `0`.

Observed:

- `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\rename-symbol.test.ts`: exit 0; 13 tests passed.
- `.\node_modules\.bin\vitest.cmd run packages\code-intel\test\unit\symbol-graph.test.ts`: exit 0; 23 tests passed.

## Task 4: Full Verification

- [x] Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
pnpm.cmd test -- --reporter=verbose
```

If full `pnpm.cmd test` fails in sandbox with fetch/EACCES/network, rerun the exact command with escalation and record both outcomes.

Observed:

- `.\node_modules\.bin\tsc.cmd -b`: exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: exit 0.
- `git diff --check`: exit 0.
- `pnpm.cmd test -- --reporter=verbose`: sandbox exit 1 with `[ERROR] fetch failed`.
- Escalated exact rerun `pnpm.cmd test -- --reporter=verbose`: exit 0; 196 test files passed, 1 skipped; 1179 tests passed, 4 skipped.

## Task 5: Commit And Push

- [ ] Stage only D60 files:

```powershell
git add packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/src/tools/rename-symbol.ts docs/superpowers/plans/2026-06-10-d60-rename-symbol-scanner-truthfulness.md
```

- [ ] Commit:

```powershell
git commit -m "fix(D-60): align rename scanner truthfulness"
```

- [ ] Push `feature/d36-gate2-live`.
