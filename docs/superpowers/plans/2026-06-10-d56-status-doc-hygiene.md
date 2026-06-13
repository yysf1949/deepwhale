# D56 Status Doc Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public status docs match the current stabilization reality so agents and reviewers do not infer that v1-v4 are complete or that non-coding tools are default-enabled.

**Architecture:** Add a small regression test that reads the public docs and Gate evidence, then replace only the high-risk top status sections with plain ASCII status blocks. Keep code behavior unchanged; this sprint is documentation and status hygiene only.

**Tech Stack:** TypeScript, Vitest, Node fs/path APIs, Markdown docs, existing Gate-1/Gate-2 JSON evidence.

---

## Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*.md` files and `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md`.
- Do not add tools or default-enable Browser, Desktop, Channel, media, productivity, marketplace, or other non-coding surfaces.
- Do not alter Gate-1 or Gate-2 thresholds or reinterpret existing evidence.
- Use TDD: add the failing document hygiene test before editing docs.
- Do not use `git add .`.

## Files

- Create: `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/plans/2026-06-10-d56-status-doc-hygiene.md`

## Task 1: RED Test For Status Honesty

- [x] Add `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` with assertions that:
  - README, ROADMAP, and ROADMAP_DECISIONS each contain an ASCII `Current Status` block.
  - README states `Branch: feature/d36-gate2-live`.
  - README states `Package version line: 2.2.0`.
  - README states Gate-2 evidence has `passed_live=true`, `registryProfile=default`, and `toolCalls=31`.
  - README states Gate-1 preferred 100K remains blocked.
  - README states v1-v4 are capability milestones, not a production-complete claim.
  - README states Browser/Desktop/Channel/media/productivity are not default-enabled.
  - The first 80 lines of each edited doc do not contain common mojibake markers.

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts
```

Expected before doc edits: fail because the required ASCII status blocks are absent and README/ROADMAP_DECISIONS top sections contain mojibake markers.

RED evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts` failed with 3/3 failures:
  - `README.md missing current status block`;
  - README status did not contain `Branch: feature/d36-gate2-live`;
  - README status did not state default non-coding tools are not default-enabled.

## Task 2: Rewrite High-Risk Status Blocks

- [x] Replace the top README status section with a plain ASCII block that says:
  - current branch is `feature/d36-gate2-live`;
  - package version line is `2.2.0`;
  - default registry is 19 coding + Code Intel tools;
  - Gate-2 live evidence currently records `passed_live=true`, `registryProfile=default`, and `toolCalls=31`;
  - Gate-2 evidence does not unlock Browser/Desktop/Channel/media/productivity;
  - Gate-1 preferred 100K remains blocked by local target availability;
  - v1-v4 are capability milestones and are not production-complete.
- [x] Add a matching short `Current Status` block near the top of `ROADMAP.md`.
- [x] Add a matching short `Current Status` block near the top of `docs/ROADMAP_DECISIONS.md`.
- [x] Keep edits narrow and avoid reformatting the rest of the files.

Implementation note:

- The status blocks were inserted at the top of each public document and the older content was kept under a `Historical ...` heading.
- A first attempt appended the status blocks at EOF; this was corrected before verification so each document now has exactly one `status:current` block at the top.

## Task 3: GREEN Verification

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts
```

Expected: pass.

GREEN evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/status-doc-hygiene.test.ts` passed: 1 file, 3 tests.

- [x] Run:

```powershell
rg -n "v1-v4 production complete|Browser.*(is|are) default-enabled|Desktop.*(is|are) default-enabled|Channel.*(is|are) default-enabled|media.*(is|are) default-enabled|productivity.*(is|are) default-enabled|preferred-100k.*passed|Gate-1 preferred.*passed" README.md ROADMAP.md docs/ROADMAP_DECISIONS.md
```

Expected: no matches.

Evidence:

- `rg -n "v1-v4 production complete|Browser.*(is|are) default-enabled|Desktop.*(is|are) default-enabled|Channel.*(is|are) default-enabled|media.*(is|are) default-enabled|productivity.*(is|are) default-enabled|preferred-100k.*passed|Gate-1 preferred.*passed" README.md ROADMAP.md docs/ROADMAP_DECISIONS.md` exited `1` with no matches.

## Task 4: Broader Verification

- [x] Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
```

Expected: all exit 0.

Evidence:

- `.\node_modules\.bin\tsc.cmd -b` exited `0`.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0` exited `0`.
- `git diff --check` exited `0`.

- [x] Run:

```powershell
pnpm.cmd test
```

If sandbox/network fails with `[ERROR] fetch failed`, rerun the exact command with escalation and record both outcomes.

Evidence:

- First `pnpm.cmd test` run timed out at 120 seconds, so it was rerun with a longer timeout.
- Second sandbox `pnpm.cmd test` run failed with `[ERROR] fetch failed`.
- Escalated exact rerun of `pnpm.cmd test` exited `0`: 195 test files passed, 1 skipped; 1164 tests passed, 4 skipped.

## Task 5: Commit And Push

- [ ] Stage only D56 files:

```powershell
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/plans/2026-06-10-d56-status-doc-hygiene.md packages/coding-agent/test/unit/status-doc-hygiene.test.ts
```

- [ ] Commit:

```powershell
git commit -m "docs(D-56): align stabilization status"
```

- [ ] Push `feature/d36-gate2-live`.
