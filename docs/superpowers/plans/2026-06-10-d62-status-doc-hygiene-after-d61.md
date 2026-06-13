# D62 Status Doc Hygiene After D61 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align public current-status documentation with the actual D60/D61 branch state without overclaiming v1-v4 completion.

**Architecture:** Treat `README.md`, `ROADMAP.md`, and `docs/ROADMAP_DECISIONS.md` current-status blocks as the public source of truth, and keep historical sections untouched. Add tests that fail on stale D56-D59 "current/next" language so future agents cannot follow outdated sprint pointers.

**Tech Stack:** TypeScript, Vitest, Markdown status blocks, pnpm workspace verification.

---

## Files

- Modify: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Create: `docs/superpowers/plans/2026-06-10-d62-status-doc-hygiene-after-d61.md`

## Task 1: Lock Status Blocks To D60/D61 Reality

- [ ] Add a failing test to `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` asserting current-status blocks mention D60/D61, do not present D56 as current, and do not list D57-D59 as next work.
- [ ] Run `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\status-doc-hygiene.test.ts`.
  - Expected before docs update: fail on stale D56-D59 lines.
- [ ] Update only the current-status blocks in `README.md`, `ROADMAP.md`, and `docs/ROADMAP_DECISIONS.md`.
- [ ] Keep these facts explicit:
  - Gate-2 live evidence is `passed_live=true`, `registryProfile=default`, `toolCalls=31`.
  - Gate-1 preferred-100k remains blocked by missing local 100K+ target evidence.
  - Default registry remains coding plus Code Intel essentials only.
  - v1-v4 are not production-complete.
  - D60 fixed rename scanner truthfulness and D61 hardened Gate-2 drift prompt handling.
- [ ] Rerun the status-doc hygiene test.
- [ ] Run `.\node_modules\.bin\tsc.cmd -b`.
- [ ] Run `.\node_modules\.bin\eslint.cmd . --max-warnings 0`.
- [ ] Run `git diff --check`.
- [ ] Run `pnpm.cmd test -- --reporter=verbose`.
- [ ] Stage only D62 files:

```powershell
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md packages/coding-agent/test/unit/status-doc-hygiene.test.ts docs/superpowers/plans/2026-06-10-d62-status-doc-hygiene-after-d61.md
```

- [ ] Commit:

```powershell
git commit -m "docs(D-62): align status after gate hardening"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```
