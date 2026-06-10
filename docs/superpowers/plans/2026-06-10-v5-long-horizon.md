# V5 Long-Horizon Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Planning preview only. Implementation is gated. Do NOT start V5 work until the v1-v4 scorecard next-actions D76/D77/D78 produce machine-readable evidence.

**Goal:** Tighten the planner, reviewer, TaskGraph, and memory main-loop into a single, reproducible long-horizon production path. V5.0 ships when 5 real (non-fixture) long-horizon tasks pass through the strict live Gate-2 runner.

**Architecture:** Reuse the existing planner, reviewer, TaskGraph, and memory modules. The V5 work is NOT new capability — it is integration evidence. Each sub-sprint promotes one module from "exists in src/" to "is exercised end-to-end by the strict live runner."

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Ink/React, existing `@deepwhale/coding-agent`, `@deepwhale/code-intel`, `@deepwhale/core`, `@deepwhale/llm`, Superpowers TDD workflow.

---

## Gate To Unlock V5

- v1-v4 scorecard aggregate ≥ 65% (currently 48%).
- D76 has recorded at least 5 live Gate-1.5 Browser tasks (deferred until opt-in sourcing).
- D77 has at least one planner main-loop evidence fixture passing.
- D78 has at least one cross-session memory crash/reload evidence fixture passing.
- 5 real long-horizon tasks have run end-to-end through the strict live Gate-2 runner and passed the same conditions as the default-profile invoice fixture.

Until those conditions are met, this plan is documentation only. Do not write V5 implementation code under the default profile.

## Scope

### In scope

- Promote planner, reviewer, TaskGraph, and memory into the strict live Gate-2 runner path.
- Add explicit evidence fixtures for each integration point.
- Keep the default registry narrow (coding + Code Intel essentials only).
- Add observability hooks (goal recording, tool-call recording, reviewer verdict) without leaking internals to the tool surface.

### Out of scope

- No Browser enhancement. No Computer Use.
- No Desktop shell (that is V6).
- No new non-coding tool exposure.
- No package version bump.
- No npm publish.

## Sub-Sprints (target order; do not start without unlock gate)

### V5.1 — Planner Main-Loop Evidence (D77)

**Branch:** `feature/v5.1-planner-mainloop`
**Files:**
- Modify: `packages/coding-agent/src/agent/run-command.ts` (wire planner into the loop entry)
- Create: `packages/coding-agent/test/integration/planner-mainloop.test.ts`
- Create: `packages/coding-agent/fixtures/v5/planner-mainloop-fixture.json`
- Modify: `packages/coding-agent/src/planner/planner.ts` (expose `planForMessages`)
- Test: `packages/coding-agent/test/unit/planner.test.ts`

**Step 1: RED.** Write a test that proves `runToolLoopWithReview` calls `planner.planForMessages` before the first tool call when a planner is provided.

**Step 2: GREEN.** Implement the minimal wiring. Do not change the planner's public interface.

**Step 3: Commit.** `feat(v5.1): wire planner into main loop with evidence fixture`

**Step 4: Update scorecard.** v2.5 moves from 40% to 50% (planner integration fixture present). D77 closes.

### V5.2 — Reviewer + TaskGraph Integration (extends D75)

**Branch:** `feature/v5.2-reviewer-taskgraph`
**Files:**
- Modify: `packages/coding-agent/src/agent/tool-loop-policy.ts` (already records goals; add reviewer verdict recording)
- Create: `packages/coding-agent/src/reviewer/verdict-recorder.ts`
- Test: `packages/coding-agent/test/integration/reviewer-taskgraph.test.ts`

**Step 1: RED.** Write a test that proves the reviewer verdict (pass/fail) is recorded into the TaskGraph alongside tool calls and goal.

**Step 2: GREEN.** Implement `verdict-recorder.ts` and wire it into `runToolLoopWithReview`.

**Step 3: Commit.** `feat(v5.2): record reviewer verdict into task graph`

### V5.3 — Memory Crash/Reload Evidence (D78)

**Branch:** `feature/v5.3-memory-crash-reload`
**Files:**
- Modify: `packages/coding-agent/src/memory/persistent-store.ts`
- Create: `packages/coding-agent/test/integration/memory-crash-reload.test.ts`
- Create: `packages/coding-agent/fixtures/v5/memory-crash-reload-fixture.json`

**Step 1: RED.** Write a test that crashes the process mid-write and proves the next process can recover all committed events.

**Step 2: GREEN.** Implement fsync-after-commit for the persistent memory store.

**Step 3: Commit.** `feat(v5.3): harden persistent memory with crash-reload evidence`

### V5.4 — Strict Live Runner 5-Task Batch

**Branch:** `feature/v5.4-strict-live-batch`
**Files:**
- Create: `packages/coding-agent/scripts/v5-strict-live-batch.mjs`
- Create: `docs/superpowers/v5-strict-live-batch.json`
- Create: `docs/superpowers/v5-strict-live-batch.md`

**Step 1: RED.** Run the strict live runner against 5 real long-horizon tasks (the same 5 used in v3.0 Gate-2 evidence, but promoted to strict live with no fixture mocking).

**Step 2: GREEN.** Iterate on failures until 5/5 pass the same conditions as the default-profile invoice fixture (default registry, 30-50 tool calls, planner + reviewer + memory + TaskGraph all wired, recorded JSON + MD evidence).

**Step 3: Commit.** `feat(v5.4): 5-task strict live batch evidence`

### V5.0 Release Marker

**Trigger:** All V5.1..V5.4 sub-sprints merged. Scorecard v2.5 + v3.0 ≥ 60%. No new default tools.

- Run full verification matrix.
- Update README, ROADMAP, ROADMAP_DECISIONS status blocks to mark V5 shipped.
- Bump package version to 2.3.0 (line-only, not roadmap maturity).
- Tag `v5.0.0` and push.

## Verification Matrix (per sub-sprint)

- `pnpm typecheck` exit 0.
- `pnpm lint` exit 0, zero warnings.
- `pnpm test` exit 0, new tests pass, pre-existing tests still pass.
- `pnpm build` exit 0.
- `git diff --check` exit 0.
- `git status --short --branch` shows only the intended files.

## STOP Conditions

- Any sub-sprint fails the strict live runner condition.
- A V5 sub-sprint needs to expand the default registry.
- Scorecard v2.5 does not move on V5.1 completion.
- A V5 sub-sprint changes `runToolLoop` (V5 must work through `runToolLoopWithReview` only).

## Self-Review Discipline

- One sub-sprint = one PR. Do not stack V5.1 + V5.2 in a single commit cluster.
- Each sub-sprint's PR body must include the actual test count delta and the actual scorecard percent movement.
- Do not claim V5.0 ship before all 4 sub-sprints are merged and the strict live batch JSON shows 5/5 pass.
