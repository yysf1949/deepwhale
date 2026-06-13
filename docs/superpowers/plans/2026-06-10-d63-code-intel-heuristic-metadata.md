# D63 Code Intel Heuristic Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Code Intel tools expose heuristic limitations in machine-readable result metadata, starting with `find_references`.

**Architecture:** Keep the existing heuristic implementations unchanged. Add focused tests that assert `find_references` result metadata includes `heuristic: true` for both `references` and `count` actions, then add the minimal metadata fields to the tool outputs.

**Tech Stack:** TypeScript, Vitest, `@deepwhale/coding-agent` tools, `@deepwhale/code-intel` fixtures.

---

## Files

- Modify: `packages/coding-agent/src/tools/find-references.ts`
- Modify: `packages/coding-agent/test/unit/find-references.test.ts`
- Create: `docs/superpowers/plans/2026-06-10-d63-code-intel-heuristic-metadata.md`

## Task 1: Add Machine-Readable Heuristic Metadata

- [ ] Add failing tests in `packages/coding-agent/test/unit/find-references.test.ts`:
  - `count` action returns `meta.heuristic === true`.
  - `references` action returns `meta.heuristic === true`.
- [ ] Run `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\find-references.test.ts`.
  - Expected before implementation: fail because `heuristic` is absent from metadata.
- [ ] Add `heuristic: true` to both success metadata objects in `packages/coding-agent/src/tools/find-references.ts`.
- [ ] Rerun the targeted test.
- [ ] Run `.\node_modules\.bin\tsc.cmd -b`.
- [ ] Run `.\node_modules\.bin\eslint.cmd . --max-warnings 0`.
- [ ] Run `git diff --check`.
- [ ] Run `pnpm.cmd test -- --reporter=verbose`.
- [ ] Stage only D63 files:

```powershell
git add packages/coding-agent/src/tools/find-references.ts packages/coding-agent/test/unit/find-references.test.ts docs/superpowers/plans/2026-06-10-d63-code-intel-heuristic-metadata.md
```

- [ ] Commit:

```powershell
git commit -m "fix(D-63): mark find references heuristic"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```
