# V6 Agent OS Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Planning preview only. Implementation is doubly gated (V5 must ship first; V6 has its own Desktop-build gate). Do NOT start V6 work until V5.0 is tagged and the Desktop build environment is verified.

**Goal:** Wrap the v1-v5 deepwhale runtime in a Tauri desktop shell that ships cross-platform (Windows / macOS / Linux) and persists the persistent TaskGraph + memory across sessions. V6.0 ships when a user can install deepwhale-desktop, start it, run a long-horizon task, kill the process mid-task, restart it, and see the same goal + tool-call history + reviewer verdict.

**Architecture:** New top-level workspace package `packages/desktop/` containing the Tauri shell. The shell embeds the existing `@deepwhale/coding-agent` + `@deepwhale/tui-ink` runtime; it does NOT fork the runtime. The persistent TaskGraph + memory layer lives in the existing `packages/coding-agent/src/taskgraph/` and `packages/coding-agent/src/memory/` paths — V6 just wires them through a desktop lifecycle hook.

**Tech Stack:** Tauri 2.x, Rust (Tauri host), TypeScript (Tauri webview frontend), existing deepwhale monorepo, Superpowers TDD workflow.

---

## Gate To Unlock V6

- V5.0 tagged and shipped. v2.5 + v3.0 scorecard ≥ 60%.
- V5 strict live batch 5/5 pass and persisted in `docs/superpowers/v5-strict-live-batch.json`.
- Tauri 2.x build verified on Windows + macOS + Linux in CI.
- Cross-session memory crash/reload evidence fixture (D78, V5.3) passes 10/10 consecutive runs.
- TaskGraph persistence survives a Tauri app force-kill (SIGKILL on Unix, TerminateProcess on Windows).

Until those conditions are met, this plan is documentation only.

## Scope

### In scope

- New package: `packages/desktop/` (Tauri 2.x shell).
- Tauri host that boots the deepwhale runtime, watches for SIGINT/SIGTERM/force-kill, and signals graceful shutdown.
- Frontend webview that reuses the existing Ink UI (via xterm.js or a WebGL terminal bridge — TBD, locked during V6.1 spike).
- Persistent TaskGraph + memory file path resolved through the deepwhale home (no `undefined/.deepwhale` regression).
- Cross-session resume: on app start, load the latest TaskGraph and the latest memory snapshot, replay the goal into the agent context.
- Auto-update channel (opt-in).

### Out of scope

- No mobile shell (iOS / Android). Tauri desktop only.
- No marketplace surface.
- No hosted service mode (that is V6.0 phase 2, gated by enterprise controls).
- No multi-tenant or shared-state model in V6.0 phase 1 (single user per install).
- No new non-coding tool exposure in the desktop shell — desktop uses the same default profile as CLI.

## Sub-Sprints (target order; do not start without unlock gate)

### V6.1 — Desktop Build Spike

**Branch:** `feature/v6.1-desktop-build-spike`
**Files:**
- Create: `packages/desktop/` (Tauri scaffold)
- Create: `packages/desktop/package.json`
- Create: `packages/desktop/src-tauri/Cargo.toml`
- Create: `packages/desktop/src-tauri/tauri.conf.json`

**Step 1: RED.** `cargo build` fails (no scaffold).

**Step 2: GREEN.** Scaffold via `cargo tauri init` (Tauri 2.x). Commit the scaffold. Verify `pnpm -F @deepwhale/desktop dev` boots an empty webview.

**Step 3: Commit.** `chore(v6.1): tauri 2.x desktop scaffold`

**Step 4: Verify.** CI matrix: Windows + macOS + Linux build all exit 0.

### V6.2 — Runtime Embedding

**Branch:** `feature/v6.2-runtime-embedding`
**Files:**
- Create: `packages/desktop/src/host.ts` (boots the deepwhale runtime inside the Tauri webview)
- Modify: `packages/coding-agent/src/runtime/embedded-entry.ts` (new: re-export of `startAgent` that does not depend on stdio)
- Test: `packages/coding-agent/test/unit/embedded-entry.test.ts`

**Step 1: RED.** Write a test that boots the embedded entry in a node process and asserts it produces a ready signal.

**Step 2: GREEN.** Implement `embedded-entry.ts` and wire it into the Tauri host.

**Step 3: Commit.** `feat(v6.2): embed deepwhale runtime in tauri host`

### V6.3 — Persistent TaskGraph + Memory Wire

**Branch:** `feature/v6.3-persistent-graph`
**Files:**
- Create: `packages/coding-agent/src/taskgraph/persistent-graph.ts`
- Modify: `packages/coding-agent/src/agent/tool-loop-policy.ts` (use persistent graph when embedded)
- Test: `packages/coding-agent/test/integration/persistent-graph.test.ts`

**Step 1: RED.** Write a test that writes 5 goals to the persistent graph, kills the process, restarts, and reads back all 5.

**Step 2: GREEN.** Implement `persistent-graph.ts` (append-only journal + periodic snapshot).

**Step 3: Commit.** `feat(v6.3): persistent task graph with cross-session replay`

### V6.4 — Cross-Session Resume

**Branch:** `feature/v6.4-cross-session-resume`
**Files:**
- Create: `packages/coding-agent/src/agent/resume.ts`
- Modify: `packages/desktop/src/host.ts` (on boot, call `resume.latestGoal()` and inject into the agent context)
- Test: `packages/coding-agent/test/integration/cross-session-resume.test.ts`

**Step 1: RED.** Write a test that runs 3 tool calls, force-kills the process, restarts, and asserts the agent sees the prior goal + tool history on the first turn.

**Step 2: GREEN.** Implement `resume.ts` with the goal-replay mechanism.

**Step 3: Commit.** `feat(v6.4): cross-session resume from persistent task graph`

### V6.5 — Force-Kill Safety

**Branch:** `feature/v6.5-force-kill-safety`
**Files:**
- Modify: `packages/desktop/src-tauri/src/main.rs` (signal handler, graceful shutdown)
- Modify: `packages/coding-agent/src/taskgraph/persistent-graph.ts` (fsync on every commit)
- Test: `packages/coding-agent/test/integration/force-kill-safety.test.ts`

**Step 1: RED.** Write a test that SIGKILLs a child process mid-write and asserts the next start recovers all committed events.

**Step 2: GREEN.** Implement SIGKILL-safe fsync and signal handler.

**Step 3: Commit.** `feat(v6.5): force-kill safety for persistent task graph`

### V6.6 — Auto-Update (Opt-In)

**Branch:** `feature/v6.6-auto-update`
**Files:**
- Modify: `packages/desktop/src-tauri/tauri.conf.json` (configure Tauri updater)
- Create: `packages/desktop/src/updater.ts`
- Test: `packages/desktop/test/updater.test.ts`

**Step 1: RED.** Test that updater is disabled by default and requires explicit opt-in.

**Step 2: GREEN.** Wire the Tauri updater with opt-in policy.

**Step 3: Commit.** `feat(v6.6): opt-in auto-update channel`

### V6.0 Release Marker

**Trigger:** All V6.1..V6.6 sub-sprints merged. CI matrix green. 10/10 force-kill test pass. v4.0 scorecard ≥ 60%.

- Build signed installers for Windows (msi), macOS (dmg, both archs), Linux (deb + AppImage).
- Publish to GitHub Releases (NOT npm — the desktop is a binary distribution).
- Update README, ROADMAP, ROADMAP_DECISIONS status blocks to mark V6 shipped.
- Bump package version to 2.4.0 (line-only, not roadmap maturity).
- Tag `v6.0.0` and push.

## Verification Matrix (per sub-sprint)

- `pnpm typecheck` exit 0.
- `pnpm lint` exit 0, zero warnings.
- `pnpm test` exit 0.
- `cargo build --manifest-path packages/desktop/src-tauri/Cargo.toml` exit 0 (on Windows, macOS, Linux runners).
- Cross-platform smoke: launch the desktop app, run a 5-step coding task, kill, restart, verify resume.
- `git diff --check` exit 0.

## STOP Conditions

- Tauri scaffold does not build on one of the three target platforms.
- A V6 sub-sprint needs to expand the default registry.
- Force-kill safety test fails on a target platform.
- Cross-session resume test fails on a target platform.
- A V6 sub-sprint changes the public `runToolLoop` interface (V6 must work through `embedded-entry.ts` only).

## Self-Review Discipline

- One sub-sprint = one PR.
- Each V6 sub-sprint's PR body must include the cross-platform smoke result.
- Do not claim V6.0 ship before all 6 sub-sprints are merged AND the 10/10 force-kill test passes on all 3 platforms.
- Desktop release IS NOT a roadmap maturity claim; the scorecard v4.0 percent is the only honest evidence.
