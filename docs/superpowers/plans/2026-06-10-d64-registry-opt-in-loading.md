# D64 Registry Opt-In Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the default registry module graph focused on coding plus Code Intel by moving non-default tool loading behind an explicit async opt-in factory.

**Architecture:** Preserve the synchronous `createDefaultRegistry()` API for default/core/coding/code-intel profiles only. Add `createRegistryForProfile()` for explicit opt-in profiles (`web`, `engineering`, `research`, `productivity`, `media`, `all`) and load their implementations through dynamic import so the default registry path does not statically load Browser, media, productivity, research, engineering, channel, or deploy tools.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, existing `ToolRegistry`, existing tool classes.

---

## Files

- Modify: `packages/coding-agent/src/tools/registry.ts`
- Create: `packages/coding-agent/src/tools/registry-opt-in.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-policy.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profiles.test.ts`
- Modify: opt-in registry tests that currently call `createDefaultRegistry({ profile: ... })`

## Task 1: RED Tests For Default Module Isolation

- [x] Add a test in `packages/coding-agent/test/unit/registry-profile-policy.test.ts` that reads `packages/coding-agent/src/tools/registry.ts` and asserts it does not statically import opt-in tool modules such as `browser-navigate`, `spotify`, `notion`, `github-pr-workflow`, `arxiv`, `delegate-task`, `vision-analyze`, or `text-to-speech`.
- [x] Add a test that `createDefaultRegistry({ profile: 'media' })` throws and tells callers to use `createRegistryForProfile()`.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\registry-profile-policy.test.ts
```

- [x] Expected RED: tests fail because `registry.ts` still imports opt-in tools and the async factory does not exist yet.

Execution note: RED was observed before implementation. The policy test failed because `registry.ts` still statically imported opt-in modules and `createDefaultRegistry({ profile: 'media' })` did not fail closed.

## Task 2: Add Async Opt-In Factory

- [x] Create `packages/coding-agent/src/tools/registry-opt-in.ts` with opt-in tool imports and two functions:
  - `registerOptInProfile(reg, profile)`
  - `registerAllOptInTools(reg)`
- [x] In `registry.ts`, keep only core/coding/code-intel imports at top level.
- [x] Refactor `registerCore`, `registerCoding`, and `registerCodeIntel` into local helper functions.
- [x] Add `createRegistryForProfile(options)`:
  - for `default`, `core`, `coding`, and `code-intel`, return `createDefaultRegistry(options)`;
  - for opt-in profiles, dynamically import `./registry-opt-in.js`;
  - for `all`, register coding + all opt-in + Code Intel in the same 41-tool order as before.
- [x] Make synchronous `createDefaultRegistry({ profile: optIn })` fail closed with an error that includes `createRegistryForProfile`.

## Task 3: Migrate Opt-In Tests

- [x] Update opt-in profile tests to use `await createRegistryForProfile({ profile: '...' })`.
- [x] Keep default profile tests using `createDefaultRegistry()`.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\registry-profile-policy.test.ts packages\coding-agent\test\unit\registry-profiles.test.ts packages\coding-agent\test\unit\registry-profile-all.test.ts packages\coding-agent\test\unit\registry-profile-productivity.test.ts packages\coding-agent\test\unit\registry-profile-media.test.ts packages\coding-agent\test\unit\registry-profile-research.test.ts packages\coding-agent\test\unit\registry-profile-engineering.test.ts packages\coding-agent\test\unit\registry-web.test.ts packages\coding-agent\test\unit\registry-d30-2.test.ts packages\coding-agent\test\tools.test.ts
```

- [x] Expected GREEN: all registry-focused tests pass.

Execution note: the expanded focused suite passed with 12 test files and 55 tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\registry-profile-policy.test.ts packages\coding-agent\test\unit\registry-profiles.test.ts packages\coding-agent\test\unit\registry-profile-all.test.ts packages\coding-agent\test\unit\registry-profile-productivity.test.ts packages\coding-agent\test\unit\registry-profile-media.test.ts packages\coding-agent\test\unit\registry-profile-research.test.ts packages\coding-agent\test\unit\registry-profile-engineering.test.ts packages\coding-agent\test\unit\registry-web.test.ts packages\coding-agent\test\unit\registry-d30-2.test.ts packages\coding-agent\test\tools.test.ts packages\coding-agent\test\unit\default-persistent-paths.test.ts packages\coding-agent\test\integration\repl-slash-tools-vision-tts.test.ts
```

## Task 4: Full Verification And Commit

- [x] Run `.\node_modules\.bin\tsc.cmd -b`.
- [x] Run `.\node_modules\.bin\eslint.cmd . --max-warnings 0`.
- [x] Run `git diff --check`.
- [x] Run `pnpm.cmd test -- --reporter=verbose`; if sandbox reports `fetch failed`, rerun the same command with escalation and record both outcomes.
- [ ] Stage only D64 files.
- [ ] Commit:

```powershell
git commit -m "fix(D-64): isolate opt-in registry loading"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```

Verification evidence:

- `.\node_modules\.bin\tsc.cmd -b`: exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: exit 0.
- `git diff --check`: exit 0.
- `pnpm.cmd test -- --reporter=verbose` in sandbox: failed with `[ERROR] fetch failed`.
- Escalated same command: exit 0, 197 test files total, 196 passed, 1 skipped; 1189 tests total, 1185 passed, 4 skipped.
