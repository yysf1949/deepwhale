# V1 To V4 Master Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive deepwhale from the current stabilization state through the roadmap v1.0, v1.5, v2.0, v2.5, v3.0, and v4.0 releases without scope drift.

**Architecture:** Execute the roadmap as a gate-driven sequence, not as parallel feature expansion. The immediate track is stabilization and release hygiene; non-coding capability expansion stays frozen until the required gates pass. Each phase adds one coherent capability layer while keeping the default runtime focused on coding plus essential Code Intelligence.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, ESLint, Ink/React, existing `@deepwhale/core`, `@deepwhale/llm`, `@deepwhale/edit-engine`, `@deepwhale/code-intel`, `@deepwhale/coding-agent`, `@deepwhale/tui-ink`, Docker-only sandbox decisions, Superpowers TDD workflow.

---

## Current Reality

- Repository root: `D:\App\openClaw\projects\deepwhale`.
- Ignore all context from `D:\App\openClaw\projects\openclaw-github`.
- Current branch: `release/v2.0`.
- Latest pushed code commit: `afbbe06 stabilize gate sprint` on `origin/release/v2.0`.
- Known untracked files to preserve unless the user explicitly adopts them:
  - `docs/plans/2026-06-08-D-31.4.7-youtube-transcript-npm-fix.md`
  - `docs/plans/2026-06-08-D-31.4.8-i18n-env-stub.md`
- Current package version line: `2.2.0`. Treat roadmap labels `v1.0` to `v4.0` as product capability milestones, not necessarily npm package numbers.
- Latest full verification before this master plan was recorded on commit `afbbe06`: `pnpm typecheck`, `pnpm lint`, and `pnpm test` passed.
- Current `pnpm format:check` has broad pre-existing formatting differences. Do not format the whole repository as part of feature work.
- Formal Gate-1 evidence exists on Vite under `.gate-targets/vite`:
  - `docs/superpowers/gate-1-vite-result.json`
  - `docs/superpowers/gate-1-vite-result.md`
  - `docs/superpowers/2026-06-08-gate-1-smoke-report.md`
- Current workspace smoke is below the formal LOC threshold and is expected to fail only for `loc-below-minimum`.

## Global Execution Rules

- [ ] Work from `D:\App\openClaw\projects\deepwhale`.
- [ ] Before starting each task, run `git status --short --branch` and note unrelated dirty files.
- [ ] Do not stage the two untracked `docs/plans/2026-06-08-D-31.4.*` files unless the user says to adopt them.
- [ ] Use TDD for every code change: write the failing test, run it, implement the smallest change, rerun targeted tests, then rerun the phase verification command.
- [ ] Keep non-coding expansion frozen until the matching gate unlocks it. This means no new media, productivity, channel, Browser, Computer Use, or marketplace tools in the default profile during the stabilization sprint.
- [ ] Keep default registry exposure narrowed to coding plus Code Intelligence essentials. Any productivity, media, research, deployment, Browser, or channel tool must require explicit profile opt-in.
- [ ] Keep tool descriptions honest. If a Code Intelligence result is heuristic, the exposed tool description and test name must say so.
- [ ] Keep generated state out of commits: `.gate-targets/`, `undefined/.deepwhale/`, local history, `dist/`, and `.tsbuildinfo`.
- [ ] Commit at task boundaries with narrow `git add` commands. Never use `git add .`.

## Repository Map

### Existing ownership

- `package.json`: root scripts and package version story.
- `pnpm-workspace.yaml`: workspace package inclusion and pnpm configuration.
- `README.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP_DECISIONS.md`: public positioning and roadmap truth.
- `docs/design/AGENT_RUNTIME.md`: role boundaries, task, context, observation, memory.
- `docs/design/CAPABILITY_MODEL.md`: unified capability abstraction.
- `docs/design/CODE_INTELLIGENCE.md`: workspace index, symbol graph, reference graph, semantic search.
- `docs/design/BROWSER_PLANNER.md`: Observe, Plan, Act, Recover model.
- `docs/superpowers/plans/`: executable plans.
- `docs/superpowers/*.json`, `docs/superpowers/*.md`: machine-readable and human-readable gate evidence.
- `packages/core/src/session/*`: JSONL session and compaction primitives.
- `packages/core/src/i18n/*`: i18n primitives and locale files.
- `packages/llm/src/*`: model clients, schema canonicalization, pricing, parsing.
- `packages/edit-engine/src/*`: hashline and unified-diff edit engines.
- `packages/code-intel/src/parser.ts`: language parser boundary.
- `packages/code-intel/src/symbols.ts`: symbol extraction.
- `packages/code-intel/src/symbol-graph.ts`: symbol, import, reference, and heuristic call graph.
- `packages/code-intel/src/gate1.ts`: Gate-1 runner.
- `packages/code-intel/scripts/gate1-current-workspace.mjs`: Gate-1 CLI entry.
- `packages/coding-agent/src/tools/registry.ts`: registry profiles and default tool exposure.
- `packages/coding-agent/src/tools/*.ts`: built-in tool implementations.
- `packages/coding-agent/src/agent/*`: tool loop and session adapter.
- `packages/coding-agent/src/repl/*`: REPL flow and slash command routing.
- `packages/coding-agent/src/sandbox/*`: sandbox runners and policy.
- `packages/coding-agent/src/util/*`: stores, paths, history, skills, cron helpers.
- `packages/coding-agent/src/verify/*`: verification runner and report formatting.
- `packages/tui-ink/src/*`: Ink UI, components, hooks, history.
- `packages/mcp-servers/gh-search/*`: opt-in MCP server package.

### New paths reserved by this plan

- `packages/coding-agent/src/tools/result-schema.ts`: v1.0 normalized tool result contracts.
- `packages/coding-agent/src/runtime/capability.ts`: capability model implementation shared by tools, MCP, Browser, Computer Use, and plugins.
- `packages/coding-agent/src/runtime/capability-registry.ts`: capability registration and profile exposure.
- `packages/coding-agent/src/memory/ranking.ts`: v2.0 memory scoring.
- `packages/coding-agent/src/memory/store.ts`: ranked memory persistence adapter.
- `packages/code-intel/src/semantic-index.ts`: v2.0 semantic search interface and local fallback.
- `packages/coding-agent/src/browser/observation.ts`: Browser observation model.
- `packages/coding-agent/src/browser/planner.ts`: Browser action planning.
- `packages/coding-agent/src/browser/runtime.ts`: Browser capability wrapper.
- `packages/coding-agent/src/mcp/runtime.ts`: MCP runtime registration.
- `packages/coding-agent/src/planner/task-dag.ts`: v2.5 Task DAG.
- `packages/coding-agent/src/planner/planner.ts`: Planner role boundary.
- `packages/coding-agent/src/planner/plan-cache.ts`: plan cache.
- `packages/coding-agent/src/reviewer/reviewer.ts`: v3.0 Reviewer role.
- `packages/coding-agent/src/reviewer/gates.ts`: reviewer verification gates.
- `packages/coding-agent/src/computer/compat-runtime.ts`: Computer Use compatibility wrapper.
- `packages/coding-agent/src/long-horizon/gate2.ts`: Gate-2 harness.
- `packages/coding-agent/src/researcher/researcher.ts`: v4.0 Researcher role.
- `packages/coding-agent/src/taskgraph/taskgraph.ts`: v4.0 cross-session TaskGraph.
- `packages/coding-agent/src/memory/persistent-store.ts`: v4.0 persistent memory store.
- `packages/desktop/`: v4.0 Tauri desktop shell, created only after Gate-2 passes.

## Global Verification Matrix

Run these commands from `D:\App\openClaw\projects\deepwhale`.

- [ ] `pnpm typecheck`
  - Expected: exit code `0`.
- [ ] `pnpm lint`
  - Expected: exit code `0`, zero warnings.
- [ ] `pnpm test`
  - Expected: exit code `0`.
- [ ] `pnpm -F @deepwhale/code-intel exec tsx scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --caller createServer --callee _createServer --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md`
  - Expected: exit code `0`, JSON contains `"passed": true`.
- [ ] `pnpm gate1:current`
  - Expected in the current repo until LOC grows: non-zero with `loc-below-minimum`. This is acceptable only when the Markdown report states the LOC reason explicitly.
- [ ] `git diff --check`
  - Expected: exit code `0`. CRLF warnings may appear if Git reports an existing line-ending conversion; whitespace errors are not acceptable.
- [ ] `git status --short --branch`
  - Expected before final release: only intentional files are modified or untracked.

## Gate Policy

### Gate-0: Stabilization

- Required before any feature expansion beyond coding and Code Intelligence.
- Passing condition:
  - `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.
  - Gate-1 Vite evidence remains pass.
  - Default registry exposes only coding plus Code Intelligence essentials.
  - README and roadmap status do not overclaim.
  - Generated `undefined/.deepwhale/tui-history` cannot be produced by tests.

### Gate-1: Code Intelligence Kill Gate

- Required before v2.0 Browser or MCP expansion.
- Passing condition:
  - A qualifying 50K+ LOC scenario passes under `packages/code-intel/src/gate1.ts`.
  - The Gate report states the actual LOC and elapsed time.
  - The result is not inferred from the current workspace smoke if the current workspace is below 50K LOC.
  - A 100K+ run is required before claiming preferred Gate maturity.

### Gate-1.5: Browser Viability Decision Gate

- Required before v3.0 Browser enhancement.
- Passing condition:
  - 20 real browser tasks are recorded as JSON and Markdown.
  - Success rate drives the branch decision:
    - `>= 80%`: continue Browser enhancement.
    - `50%` to `79%`: keep v2.0 Browser foundation and stop Browser enhancement.
    - `< 50%`: keep a minimal runtime and remove Browser from future critical path.

### Gate-2: Long-Horizon Kill Gate

- Required before v4.0 Researcher, TaskGraph, Desktop, and Channels.
- Passing condition:
  - One real bugfix or feature task runs for 30 to 50 tool calls without losing the goal.
  - Planner, Executor, Reviewer, and compaction all preserve task state.
  - A machine-readable report records every step, failure, retry, and final verification.

## Stage 0: Stabilization And Release Hygiene

### Task 0.1: Freeze Default Capability Surface

**Files:**
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Test: `packages/coding-agent/test/unit/registry-profiles.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profile-all.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profile-productivity.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profile-media.test.ts`

- [ ] Write or update a failing test that asserts `createDefaultRegistry()` omits productivity, media, channel, Browser, and deploy tools.

```ts
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('default registry profile', () => {
  it('exposes coding and code-intel essentials without non-coding tools', () => {
    const registry = createDefaultRegistry();
    const names = registry.list().map((tool) => tool.name).sort();

    expect(names).toContain('read_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('get_symbols');
    expect(names).toContain('find_references');
    expect(names).not.toContain('youtube_content');
    expect(names).not.toContain('spotify');
    expect(names).not.toContain('browser_navigate');
    expect(names).not.toContain('notion');
    expect(names).not.toContain('airtable');
  });
});
```

- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/registry-profiles.test.ts`.
  - Expected before implementation: the new assertion fails if default exposure drifted.
- [ ] Implement only registry/profile changes needed to pass the test.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/registry-profiles.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-productivity.test.ts packages/coding-agent/test/unit/registry-profile-media.test.ts`.
  - Expected: exit code `0`.
- [ ] Commit:

```bash
git add packages/coding-agent/src/tools/registry.ts packages/coding-agent/test/unit/registry-profiles.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts packages/coding-agent/test/unit/registry-profile-productivity.test.ts packages/coding-agent/test/unit/registry-profile-media.test.ts
git commit -m "test: lock default registry profile"
```

### Task 0.2: Fix Generated Undefined State

**Files:**
- Modify: `packages/coding-agent/src/util/deepwhale-paths.ts`
- Modify: `packages/coding-agent/src/util/tui-history.ts`
- Test: `packages/coding-agent/test/unit/deepwhale-paths.test.ts`
- Test: `packages/coding-agent/test/util/tui-history.test.ts`

- [ ] Add a failing regression test that rejects `undefined/.deepwhale` paths.

```ts
import { describe, expect, it } from 'vitest';
import { resolveDeepwhaleHome } from '../../src/util/deepwhale-paths.js';

describe('resolveDeepwhaleHome', () => {
  it('never resolves below an undefined directory name', () => {
    const home = resolveDeepwhaleHome({ cwd: 'D:/repo', env: {} });
    expect(home.replaceAll('\\', '/')).not.toContain('/undefined/.deepwhale');
    expect(home.replaceAll('\\', '/')).toContain('/.deepwhale');
  });
});
```

- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts`.
  - Expected before implementation: the new test fails if the bug exists.
- [ ] Implement path resolution that uses explicit env, user home, or repo-local fallback without stringifying `undefined`.
- [ ] Remove generated `undefined/.deepwhale/tui-history` only after `git status --short` confirms it is untracked generated state.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts`.
  - Expected: exit code `0`.
- [ ] Commit:

```bash
git add packages/coding-agent/src/util/deepwhale-paths.ts packages/coding-agent/src/util/tui-history.ts packages/coding-agent/test/unit/deepwhale-paths.test.ts packages/coding-agent/test/util/tui-history.test.ts
git commit -m "fix: prevent undefined deepwhale state paths"
```

### Task 0.3: Align Public Status Without Overclaiming

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/ROADMAP_DECISIONS.md`
- Modify: `docs/superpowers/2026-06-08-gate-1-smoke-report.md`

- [ ] Add a concise status block to `README.md` that states:
  - current branch is stabilization-focused,
  - default profile is coding plus Code Intelligence essentials,
  - non-coding tool expansion is opt-in,
  - Gate-1 has Vite 86K evidence and the current workspace smoke is below LOC threshold.
- [ ] Replace mojibake headings only in edited sections; do not rewrite the whole README.
- [ ] Ensure roadmap language does not claim v2/v3/v4 features are production-ready.
- [ ] Run `rg -n "Gate-1.*complete|Browser.*default|media.*default|productivity.*default" README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/2026-06-08-gate-1-smoke-report.md`.
  - Expected: no line overclaims default non-coding exposure or unqualified Gate completion.
- [ ] Commit:

```bash
git add README.md ROADMAP.md docs/ROADMAP_DECISIONS.md docs/superpowers/2026-06-08-gate-1-smoke-report.md
git commit -m "docs: align stabilization status"
```

### Task 0.4: Gate-0 Verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run the formal Vite Gate command from the Global Verification Matrix.
- [ ] Run `git diff --check`.
- [ ] Run `git status --short --branch`.
- [ ] If a command fails, create a focused fix task before moving to v1.0 release closure.

## Stage 1: v1.0 Coding Agent Release Closure

### Task 1.1: Normalize Tool Result Contracts

**Files:**
- Create: `packages/coding-agent/src/tools/result-schema.ts`
- Modify: `packages/coding-agent/src/tools/read-file.ts`
- Modify: `packages/coding-agent/src/tools/write-file.ts`
- Modify: `packages/coding-agent/src/tools/edit-file.ts`
- Modify: `packages/coding-agent/src/tools/bash.ts`
- Modify: `packages/coding-agent/src/tools/grep.ts`
- Modify: `packages/coding-agent/src/tools/find.ts`
- Test: `packages/coding-agent/test/unit/tool-result-schema.test.ts`

- [ ] Write the failing contract test.

```ts
import { describe, expect, it } from 'vitest';
import { normalizeToolResult } from '../../src/tools/result-schema.js';

describe('normalizeToolResult', () => {
  it('returns observation and recovery fields for successful tools', () => {
    expect(normalizeToolResult({ ok: true, summary: 'read 3 lines' })).toEqual({
      status: 'ok',
      summary: 'read 3 lines',
      artifacts: [],
      next_actions: [],
      recovery: null,
    });
  });

  it('returns recovery guidance for failed tools', () => {
    expect(normalizeToolResult({ ok: false, summary: 'missing file', error: 'ENOENT' })).toEqual({
      status: 'error',
      summary: 'missing file',
      artifacts: [],
      next_actions: [],
      recovery: {
        root_cause_hint: 'ENOENT',
        safe_retry: false,
        stop_condition: 'input must change before retry',
      },
    });
  });
});
```

- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/tool-result-schema.test.ts`.
  - Expected before implementation: import or assertion failure.
- [ ] Implement `ToolResultStatus`, `ToolRecovery`, `NormalizedToolResult`, and `normalizeToolResult` in `packages/coding-agent/src/tools/result-schema.ts`.
- [ ] Update the six core tools to return or wrap the normalized shape at their public boundary.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/tool-result-schema.test.ts packages/coding-agent/test/tools.test.ts`.
  - Expected: exit code `0`.
- [ ] Commit:

```bash
git add packages/coding-agent/src/tools/result-schema.ts packages/coding-agent/src/tools/read-file.ts packages/coding-agent/src/tools/write-file.ts packages/coding-agent/src/tools/edit-file.ts packages/coding-agent/src/tools/bash.ts packages/coding-agent/src/tools/grep.ts packages/coding-agent/src/tools/find.ts packages/coding-agent/test/unit/tool-result-schema.test.ts packages/coding-agent/test/tools.test.ts
git commit -m "feat: normalize core tool results"
```

### Task 1.2: Preserve Linear Session Compatibility

**Files:**
- Modify: `packages/core/src/session/jsonl.ts`
- Modify: `packages/core/src/session/compaction.ts`
- Test: `packages/core/test/session-jsonl.test.ts`
- Test: `packages/core/test/session-compaction.test.ts`
- Test: `packages/core/test/session/policy-decision.test.ts`

- [ ] Add a failing test that appends, reloads, and compacts a linear session without changing message order.
- [ ] Add a failing test that rejects DAG-only fields in v1.0 linear mode unless they are stored as inert metadata.
- [ ] Run `pnpm vitest run packages/core/test/session-jsonl.test.ts packages/core/test/session-compaction.test.ts packages/core/test/session/policy-decision.test.ts`.
- [ ] Implement the smallest compatibility fix in `jsonl.ts` or `compaction.ts`.
- [ ] Rerun the same test command.
- [ ] Commit:

```bash
git add packages/core/src/session/jsonl.ts packages/core/src/session/compaction.ts packages/core/test/session-jsonl.test.ts packages/core/test/session-compaction.test.ts packages/core/test/session/policy-decision.test.ts
git commit -m "fix: preserve linear session contract"
```

### Task 1.3: Lock Prefix Cache And Provider Contracts

**Files:**
- Modify: `packages/llm/src/canonicalize-schema.ts`
- Modify: `packages/llm/src/deepseek-client.ts`
- Modify: `packages/llm/src/anthropic-client.ts`
- Test: `packages/llm/test/canonicalize-schema.test.ts`
- Test: `packages/llm/test/deepseek-client.test.ts`
- Test: `packages/llm/test/anthropic-client.test.ts`

- [ ] Add tests that prove schema keys are stable, empty content is serialized as `""`, and reasoning content is not sent on the wire.
- [ ] Run `pnpm vitest run packages/llm/test/canonicalize-schema.test.ts packages/llm/test/deepseek-client.test.ts packages/llm/test/anthropic-client.test.ts`.
- [ ] Implement only the provider serialization changes needed by the tests.
- [ ] Rerun the same test command.
- [ ] Commit:

```bash
git add packages/llm/src/canonicalize-schema.ts packages/llm/src/deepseek-client.ts packages/llm/src/anthropic-client.ts packages/llm/test/canonicalize-schema.test.ts packages/llm/test/deepseek-client.test.ts packages/llm/test/anthropic-client.test.ts
git commit -m "test: lock provider cache contracts"
```

### Task 1.4: Verify TUI Core Workflows

**Files:**
- Modify: `packages/tui-ink/src/app.tsx`
- Modify: `packages/tui-ink/src/components/StatusBar.tsx`
- Modify: `packages/tui-ink/src/hooks/useRunToolLoop.ts`
- Test: `packages/tui-ink/test/app.smoke.test.ts`
- Test: `packages/tui-ink/test/tui-slash-basic.test.ts`
- Test: `packages/tui-ink/test/sessionlist.test.tsx`

- [ ] Add failing tests for startup, slash help, session list rendering, and tool-loop status display.
- [ ] Run `pnpm vitest run packages/tui-ink/test/app.smoke.test.ts packages/tui-ink/test/tui-slash-basic.test.ts packages/tui-ink/test/sessionlist.test.tsx`.
- [ ] Implement minimal UI and hook fixes.
- [ ] Run `pnpm -F @deepwhale/tui-ink build`.
- [ ] Run the same targeted Vitest command.
- [ ] Commit:

```bash
git add packages/tui-ink/src/app.tsx packages/tui-ink/src/components/StatusBar.tsx packages/tui-ink/src/hooks/useRunToolLoop.ts packages/tui-ink/test/app.smoke.test.ts packages/tui-ink/test/tui-slash-basic.test.ts packages/tui-ink/test/sessionlist.test.tsx
git commit -m "test: lock tui core workflows"
```

### Task 1.5: v1.0 Release Gate

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run `git diff --check`.
- [ ] Update `README.md` with a v1.0 capability checklist only if every command exits `0`.
- [ ] Commit docs with `git commit -m "docs: mark v1 coding baseline"`.

## Stage 2: v1.5 Code Intelligence And Codex Core

### Task 2.1: Harden Code Intel Import And Reference Graph

**Files:**
- Modify: `packages/code-intel/src/symbol-graph.ts`
- Modify: `packages/code-intel/src/parser.ts`
- Test: `packages/code-intel/test/unit/symbol-graph.test.ts`
- Test: `packages/code-intel/test/unit/parser.test.ts`

- [ ] Add failing fixtures for TypeScript `paths`, `extends` in `tsconfig.json`, barrel re-exports, default re-exports, namespace import member calls, and dynamic imports.
- [ ] Add this test block to `packages/code-intel/test/unit/symbol-graph.test.ts` and expand fixtures in the same file.

```ts
it('resolves tsconfig paths, barrels, defaults, namespaces, and dynamic imports conservatively', async () => {
  const graph = await buildSymbolGraph({
    root: fixtureRoot('ts-imports-advanced'),
    includeReferences: true,
  });

  expect(referenceTargets(graph, 'api.target')).toContain('src/api.ts:target');
  expect(referenceTargets(graph, 'defaultWorker')).toContain('src/workers/default-worker.ts:defaultWorker');
  expect(referenceKinds(graph, 'lazyFeature')).toContain('dynamic_import');
});
```

- [ ] Run `pnpm vitest run packages/code-intel/test/unit/symbol-graph.test.ts`.
  - Expected before implementation: at least one assertion fails.
- [ ] Implement path and import resolution conservatively. Prefer no edge over a false edge when uncertain.
- [ ] Rerun `pnpm vitest run packages/code-intel/test/unit/symbol-graph.test.ts packages/code-intel/test/unit/parser.test.ts`.
- [ ] Commit:

```bash
git add packages/code-intel/src/symbol-graph.ts packages/code-intel/src/parser.ts packages/code-intel/test/unit/symbol-graph.test.ts packages/code-intel/test/unit/parser.test.ts
git commit -m "feat: harden code intel references"
```

### Task 2.2: Keep Rename Symbol Conservative

**Files:**
- Modify: `packages/coding-agent/src/tools/rename-symbol.ts`
- Modify: `packages/coding-agent/src/tools/find-references.ts`
- Test: `packages/coding-agent/test/unit/rename-symbol.test.ts`
- Test: `packages/coding-agent/test/unit/find-references.test.ts`

- [ ] Add a failing test that proves default rename does not rewrite comments, strings, unrelated same-name locals, or non-imported symbols.
- [ ] Add a failing test that requires dry-run output to include each edit hunk and the heuristic confidence.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/find-references.test.ts`.
- [ ] Route rename through Code Intel references and `@deepwhale/edit-engine`.
- [ ] Keep broad textual replacement behind an explicit input flag named `allow_textual_fallback`.
- [ ] Rerun the targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/tools/rename-symbol.ts packages/coding-agent/src/tools/find-references.ts packages/coding-agent/test/unit/rename-symbol.test.ts packages/coding-agent/test/unit/find-references.test.ts
git commit -m "fix: keep rename symbol reference scoped"
```

### Task 2.3: Implement Capability Registry Foundation

**Files:**
- Create: `packages/coding-agent/src/runtime/capability.ts`
- Create: `packages/coding-agent/src/runtime/capability-registry.ts`
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Test: `packages/coding-agent/test/unit/capability-registry.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profiles.test.ts`

- [ ] Write a failing test for unique capability ids, risk levels, side effects, and profile exposure.

```ts
import { describe, expect, it } from 'vitest';
import { createCapabilityRegistry } from '../../src/runtime/capability-registry.js';

describe('capability registry', () => {
  it('rejects duplicate ids and exposes only enabled profiles', () => {
    const registry = createCapabilityRegistry();
    registry.register({ id: 'tool.read_file', source: 'tool', riskLevel: 'low', profiles: ['core', 'coding'] });

    expect(() => {
      registry.register({ id: 'tool.read_file', source: 'tool', riskLevel: 'low', profiles: ['core'] });
    }).toThrow(/duplicate capability id/);

    expect(registry.list({ profiles: ['coding'] }).map((capability) => capability.id)).toEqual(['tool.read_file']);
    expect(registry.list({ profiles: ['media'] })).toEqual([]);
  });
});
```

- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/capability-registry.test.ts`.
- [ ] Implement the registry without changing public tool behavior.
- [ ] Wire existing tool profile metadata through the capability registry.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/capability-registry.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts`.
- [ ] Commit:

```bash
git add packages/coding-agent/src/runtime/capability.ts packages/coding-agent/src/runtime/capability-registry.ts packages/coding-agent/src/tools/registry.ts packages/coding-agent/test/unit/capability-registry.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts
git commit -m "feat: add capability registry foundation"
```

### Task 2.4: Skills, Hooks, Approval, And Task Hygiene

**Files:**
- Modify: `packages/coding-agent/src/util/skill-loader.ts`
- Modify: `packages/coding-agent/src/util/skill-store.ts`
- Modify: `packages/coding-agent/src/repl/repl-confirm.ts`
- Modify: `packages/coding-agent/src/agent/tool-loop.ts`
- Test: `packages/coding-agent/test/unit/skill-loader.test.ts`
- Test: `packages/coding-agent/test/unit/skill-store.test.ts`
- Test: `packages/coding-agent/test/repl/repl-confirm.test.ts`
- Test: `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

- [ ] Add tests for SKILL.md frontmatter, read-only skill load, capability checks, approval prompts, and tool loop policy enforcement.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/skill-loader.test.ts packages/coding-agent/test/unit/skill-store.test.ts packages/coding-agent/test/repl/repl-confirm.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts`.
- [ ] Implement missing behavior with existing utility patterns.
- [ ] Rerun the same command.
- [ ] Commit:

```bash
git add packages/coding-agent/src/util/skill-loader.ts packages/coding-agent/src/util/skill-store.ts packages/coding-agent/src/repl/repl-confirm.ts packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/test/unit/skill-loader.test.ts packages/coding-agent/test/unit/skill-store.test.ts packages/coding-agent/test/repl/repl-confirm.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
git commit -m "test: lock skills approval and tool policy"
```

### Task 2.5: Gate-1 Evidence Hygiene

**Files:**
- Modify: `packages/code-intel/src/gate1.ts`
- Modify: `packages/code-intel/scripts/gate1-current-workspace.mjs`
- Modify: `packages/code-intel/test/unit/gate1.test.ts`
- Modify: `docs/superpowers/2026-06-08-gate-1-smoke-report.md`

- [ ] Add a failing test that requires Gate JSON to include `repoRoot`, `loc`, `supportedFiles`, `symbols`, `references`, `callEdges`, `elapsedMs`, `entry`, `callChain`, `modificationPoint`, and `passed`.
- [ ] Run `pnpm vitest run packages/code-intel/test/unit/gate1.test.ts`.
- [ ] Implement any missing fields and keep report wording honest.
- [ ] Run the formal Vite Gate command from the Global Verification Matrix.
- [ ] Commit:

```bash
git add packages/code-intel/src/gate1.ts packages/code-intel/scripts/gate1-current-workspace.mjs packages/code-intel/test/unit/gate1.test.ts docs/superpowers/2026-06-08-gate-1-smoke-report.md docs/superpowers/gate-1-vite-result.json docs/superpowers/gate-1-vite-result.md
git commit -m "test: lock gate one evidence schema"
```

### Task 2.6: v1.5 Release Gate

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run the formal Vite Gate command.
- [ ] Run `pnpm gate1:current` and confirm the report documents `loc-below-minimum` if the workspace is still below 50K LOC.
- [ ] Run `git diff --check`.
- [ ] Update `README.md` and `docs/superpowers/2026-06-08-gate-1-smoke-report.md` only after the evidence is fresh.
- [ ] Commit with `git commit -m "docs: record v1.5 code intel gate"`.

## Stage 3: v2.0 Observe

### Unlock Condition

- [ ] Gate-0 is green.
- [ ] Gate-1 has a fresh qualifying pass.
- [ ] The user explicitly unlocks v2.0 work after reviewing the Gate report.
- [ ] Default profile remains coding plus Code Intelligence essentials after every v2.0 task.

### Task 3.1: Memory Ranking

**Files:**
- Create: `packages/coding-agent/src/memory/ranking.ts`
- Create: `packages/coding-agent/src/memory/store.ts`
- Test: `packages/coding-agent/test/unit/memory-ranking.test.ts`
- Test: `packages/coding-agent/test/unit/memory-store.test.ts`

- [ ] Write a failing scoring test.

```ts
import { describe, expect, it } from 'vitest';
import { rankMemories } from '../../src/memory/ranking.js';

describe('rankMemories', () => {
  it('orders by importance, recency decay, and scope weight', () => {
    const ranked = rankMemories(
      [
        { id: 'session-low', content: 'temp', importance: 0.2, lastAccessedAt: 100, scope: 'session', source: 'auto_extracted' },
        { id: 'project-high', content: 'decision', importance: 0.9, lastAccessedAt: 80, scope: 'project', source: 'user_explicit' },
      ],
      { now: 100, halfLifeMs: 100, limit: 2 },
    );

    expect(ranked.map((memory) => memory.id)).toEqual(['project-high', 'session-low']);
  });
});
```

- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/memory-ranking.test.ts`.
- [ ] Implement deterministic scoring with `importance`, `lastAccessedAt`, `scope`, and `source`.
- [ ] Add store tests for 1000 memories, archive instead of delete, and hand-edit precedence.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/memory-ranking.test.ts packages/coding-agent/test/unit/memory-store.test.ts`.
- [ ] Commit:

```bash
git add packages/coding-agent/src/memory/ranking.ts packages/coding-agent/src/memory/store.ts packages/coding-agent/test/unit/memory-ranking.test.ts packages/coding-agent/test/unit/memory-store.test.ts
git commit -m "feat: add ranked memory foundation"
```

### Task 3.2: Code Intel Semantic Search Interface

**Files:**
- Create: `packages/code-intel/src/semantic-index.ts`
- Modify: `packages/code-intel/src/index.ts`
- Modify: `packages/coding-agent/src/tools/smart-search.ts`
- Test: `packages/code-intel/test/unit/semantic-index.test.ts`
- Test: `packages/coding-agent/test/unit/smart-search.test.ts`

- [ ] Add a failing test for semantic search fallback when embeddings are unavailable.
- [ ] Add a failing test that `smart_search` labels fallback results as heuristic.
- [ ] Run `pnpm vitest run packages/code-intel/test/unit/semantic-index.test.ts packages/coding-agent/test/unit/smart-search.test.ts`.
- [ ] Implement the interface with a deterministic local lexical fallback. Do not add a network embedding dependency to the default path.
- [ ] Rerun the targeted tests.
- [ ] Commit:

```bash
git add packages/code-intel/src/semantic-index.ts packages/code-intel/src/index.ts packages/coding-agent/src/tools/smart-search.ts packages/code-intel/test/unit/semantic-index.test.ts packages/coding-agent/test/unit/smart-search.test.ts
git commit -m "feat: add semantic search fallback"
```

### Task 3.3: Browser Foundation Behind Explicit Opt-In

**Files:**
- Create: `packages/coding-agent/src/browser/observation.ts`
- Create: `packages/coding-agent/src/browser/planner.ts`
- Create: `packages/coding-agent/src/browser/runtime.ts`
- Modify: `packages/coding-agent/src/tools/registry.ts`
- Test: `packages/coding-agent/test/unit/browser-observation.test.ts`
- Test: `packages/coding-agent/test/unit/browser-planner.test.ts`
- Test: `packages/coding-agent/test/unit/browser-runtime-profile.test.ts`

- [ ] Add failing tests for DOM summary, element ranking, page summary, action history, and explicit Browser profile opt-in.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/browser-observation.test.ts packages/coding-agent/test/unit/browser-planner.test.ts packages/coding-agent/test/unit/browser-runtime-profile.test.ts`.
- [ ] Implement pure data transforms first. Keep Playwright or runtime adapters behind an explicit profile.
- [ ] Confirm `createDefaultRegistry()` still omits Browser tools.
- [ ] Rerun the targeted tests plus `pnpm vitest run packages/coding-agent/test/unit/registry-profiles.test.ts`.
- [ ] Commit:

```bash
git add packages/coding-agent/src/browser/observation.ts packages/coding-agent/src/browser/planner.ts packages/coding-agent/src/browser/runtime.ts packages/coding-agent/src/tools/registry.ts packages/coding-agent/test/unit/browser-observation.test.ts packages/coding-agent/test/unit/browser-planner.test.ts packages/coding-agent/test/unit/browser-runtime-profile.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts
git commit -m "feat: add opt-in browser foundation"
```

### Task 3.4: MCP Runtime As Opt-In Capability Source

**Files:**
- Create: `packages/coding-agent/src/mcp/runtime.ts`
- Modify: `packages/coding-agent/src/runtime/capability-registry.ts`
- Modify: `packages/mcp-servers/gh-search/test/server.test.mjs`
- Test: `packages/coding-agent/test/unit/mcp-runtime.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profiles.test.ts`

- [ ] Add failing tests that MCP tools are registered as capabilities but are hidden unless `mcp` or `all` profile is selected.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/mcp-runtime.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts`.
- [ ] Implement stdio manifest registration with explicit opt-in.
- [ ] Run `pnpm -F @deepwhale/mcp-gh-search test`.
- [ ] Rerun targeted Vitest command.
- [ ] Commit:

```bash
git add packages/coding-agent/src/mcp/runtime.ts packages/coding-agent/src/runtime/capability-registry.ts packages/mcp-servers/gh-search/test/server.test.mjs packages/coding-agent/test/unit/mcp-runtime.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts
git commit -m "feat: register mcp capabilities as opt in"
```

### Task 3.5: Gate-1.5 Browser Viability Harness

**Files:**
- Create: `packages/coding-agent/src/browser/gate15.ts`
- Create: `packages/coding-agent/scripts/gate15-browser-viability.mjs`
- Test: `packages/coding-agent/test/unit/browser-gate15.test.ts`
- Docs: `docs/superpowers/gate-1.5-browser-viability.md`

- [ ] Add a failing test that computes success rate from 20 task records and returns one of `continue`, `freeze-enhancement`, or `minimal-runtime`.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/browser-gate15.test.ts`.
- [ ] Implement pure report logic before adding any live browser automation.
- [ ] Create the script that reads a JSON scenario file and writes JSON plus Markdown evidence.
- [ ] Run a dry fixture command:

```bash
pnpm -F @deepwhale/coding-agent exec tsx scripts/gate15-browser-viability.mjs --fixture packages/coding-agent/test/fixtures/browser-gate15/pass.json --json docs/superpowers/gate-1.5-browser-viability.json --md docs/superpowers/gate-1.5-browser-viability.md
```

- [ ] Commit:

```bash
git add packages/coding-agent/src/browser/gate15.ts packages/coding-agent/scripts/gate15-browser-viability.mjs packages/coding-agent/test/unit/browser-gate15.test.ts packages/coding-agent/test/fixtures/browser-gate15/pass.json docs/superpowers/gate-1.5-browser-viability.json docs/superpowers/gate-1.5-browser-viability.md
git commit -m "feat: add browser viability gate harness"
```

### Task 3.6: v2.0 Release Gate

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run formal Gate-1 again.
- [ ] Run Gate-1.5 fixture report.
- [ ] Run live Gate-1.5 only when the user has approved network/browser testing.
- [ ] Confirm `createDefaultRegistry()` still excludes Browser, MCP, productivity, media, and channels.
- [ ] Commit docs with `git commit -m "docs: record v2 observe gate status"`.

## Stage 4: v2.5 Plan

### Unlock Condition

- [ ] v2.0 release gate is green or explicitly branched by Gate-1.5 decision.
- [ ] Planner work does not add new non-coding tools.
- [ ] `--mode=single` continues to run the v1.0 style Executor loop.

### Task 4.1: Task DAG Types And State Machine

**Files:**
- Create: `packages/coding-agent/src/planner/task-dag.ts`
- Test: `packages/coding-agent/test/unit/task-dag.test.ts`

- [ ] Write failing tests for `pending`, `ready`, `running`, `done`, `failed`, and `blocked`.
- [ ] Include dependency sorting and cycle rejection.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/task-dag.test.ts`.
- [ ] Implement pure DAG functions with no tool execution.
- [ ] Rerun the targeted test.
- [ ] Commit:

```bash
git add packages/coding-agent/src/planner/task-dag.ts packages/coding-agent/test/unit/task-dag.test.ts
git commit -m "feat: add planner task dag"
```

### Task 4.2: Planner Role Boundary

**Files:**
- Create: `packages/coding-agent/src/planner/planner.ts`
- Modify: `packages/coding-agent/src/agent/tool-loop.ts`
- Test: `packages/coding-agent/test/unit/planner-boundary.test.ts`
- Test: `packages/coding-agent/test/integration/runToolLoop-2turn.test.ts`

- [ ] Add a failing test that Planner can emit tasks but cannot call tools.
- [ ] Add a failing test that Executor can execute tasks but cannot decompose a new DAG.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/planner-boundary.test.ts packages/coding-agent/test/integration/runToolLoop-2turn.test.ts`.
- [ ] Implement the Planner boundary and pass tasks to the existing Executor loop.
- [ ] Rerun the targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/planner/planner.ts packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/test/unit/planner-boundary.test.ts packages/coding-agent/test/integration/runToolLoop-2turn.test.ts
git commit -m "feat: enforce planner executor boundary"
```

### Task 4.3: Plan Cache

**Files:**
- Create: `packages/coding-agent/src/planner/plan-cache.ts`
- Test: `packages/coding-agent/test/unit/plan-cache.test.ts`

- [ ] Add failing tests for cache key stability, invalidation on changed goal, and cross-session read.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/plan-cache.test.ts`.
- [ ] Implement append-only plan cache records using the same path discipline as session JSONL.
- [ ] Rerun the targeted test.
- [ ] Commit:

```bash
git add packages/coding-agent/src/planner/plan-cache.ts packages/coding-agent/test/unit/plan-cache.test.ts
git commit -m "feat: add plan cache"
```

### Task 4.4: v2.5 Release Gate

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run an integration scenario where Planner decomposes a 5-step coding task and Executor runs it in dependency order.
- [ ] Run a `--mode=single` scenario and compare output against the v1.0 loop expectation.
- [ ] Commit docs with `git commit -m "docs: record v2.5 planner gate"`.

## Stage 5: v3.0 Execute And Review

### Unlock Condition

- [ ] v2.5 release gate is green.
- [ ] Gate-1.5 decision allows Browser enhancement if Browser tasks are included.
- [ ] Computer Use is implemented as compatibility layer only. Do not self-implement OCR, UI detection, element localization, mouse, keyboard, or screen capture primitives.

### Task 5.1: Reviewer Role

**Files:**
- Create: `packages/coding-agent/src/reviewer/reviewer.ts`
- Create: `packages/coding-agent/src/reviewer/gates.ts`
- Modify: `packages/coding-agent/src/agent/tool-loop.ts`
- Test: `packages/coding-agent/test/unit/reviewer.test.ts`
- Test: `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

- [ ] Add failing tests that Reviewer can run verification gates and produce `approve` or `request_changes`.
- [ ] Add failing tests that Reviewer cannot modify production files.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/reviewer.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts`.
- [ ] Implement Reviewer as a verification-only role.
- [ ] Rerun targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/reviewer/reviewer.ts packages/coding-agent/src/reviewer/gates.ts packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/test/unit/reviewer.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
git commit -m "feat: add reviewer role"
```

### Task 5.2: Compaction Hook Contract

**Files:**
- Modify: `packages/core/src/session/compaction.ts`
- Modify: `packages/coding-agent/src/agent/agent-compaction.ts`
- Test: `packages/core/test/session-compaction.test.ts`
- Test: `packages/coding-agent/test/agent-compaction-2d6.test.ts`
- Test: `packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts`

- [ ] Add failing tests that compaction is the only prefix-cache reset point and can be replaced by a hook.
- [ ] Run the three listed tests.
- [ ] Implement hook injection with deterministic fallback to default compaction.
- [ ] Rerun the three listed tests.
- [ ] Commit:

```bash
git add packages/core/src/session/compaction.ts packages/coding-agent/src/agent/agent-compaction.ts packages/core/test/session-compaction.test.ts packages/coding-agent/test/agent-compaction-2d6.test.ts packages/coding-agent/test/integration/compaction-cross-protocol-2d5.test.ts
git commit -m "feat: add compaction hook contract"
```

### Task 5.3: Browser Enhancement After Gate-1.5

**Files:**
- Modify: `packages/coding-agent/src/browser/observation.ts`
- Modify: `packages/coding-agent/src/browser/planner.ts`
- Modify: `packages/coding-agent/src/browser/runtime.ts`
- Test: `packages/coding-agent/test/unit/browser-visual-grounding.test.ts`
- Test: `packages/coding-agent/test/unit/browser-recovery.test.ts`
- Test: `packages/coding-agent/test/unit/browser-adaptive-retry.test.ts`

- [ ] Proceed only if Gate-1.5 success rate is `>= 80%`.
- [ ] Add failing tests for visual element labels, strategic recovery, and adaptive retry.
- [ ] Run the three targeted tests.
- [ ] Implement enhancements without putting Browser in the default profile.
- [ ] Rerun targeted tests and registry profile tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/browser/observation.ts packages/coding-agent/src/browser/planner.ts packages/coding-agent/src/browser/runtime.ts packages/coding-agent/test/unit/browser-visual-grounding.test.ts packages/coding-agent/test/unit/browser-recovery.test.ts packages/coding-agent/test/unit/browser-adaptive-retry.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts
git commit -m "feat: enhance opt-in browser recovery"
```

### Task 5.4: Computer Use Compatibility Layer

**Files:**
- Create: `packages/coding-agent/src/computer/compat-runtime.ts`
- Modify: `packages/coding-agent/src/runtime/capability-registry.ts`
- Test: `packages/coding-agent/test/unit/computer-compat-runtime.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profiles.test.ts`

- [ ] Add failing tests that Computer Use capabilities can be registered from an external provider and remain hidden unless the explicit profile is selected.
- [ ] Add failing tests that local implementations of OCR, UI detection, element localization, mouse, keyboard, and screen capture are not exported from `compat-runtime.ts`.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/computer-compat-runtime.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts`.
- [ ] Implement provider delegation only.
- [ ] Rerun targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/computer/compat-runtime.ts packages/coding-agent/src/runtime/capability-registry.ts packages/coding-agent/test/unit/computer-compat-runtime.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts
git commit -m "feat: add computer use compatibility layer"
```

### Task 5.5: Gate-2 Long-Horizon Harness

**Files:**
- Create: `packages/coding-agent/src/long-horizon/gate2.ts`
- Create: `packages/coding-agent/scripts/gate2-long-horizon.mjs`
- Test: `packages/coding-agent/test/unit/gate2-long-horizon.test.ts`
- Docs: `docs/superpowers/gate-2-long-horizon.md`

- [ ] Add a failing test that validates a 30 to 50 tool-call transcript, detects goal drift, and records retries.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/gate2-long-horizon.test.ts`.
- [ ] Implement transcript validation and report generation.
- [ ] Create a fixture transcript with one failure, one retry, and final pass.
- [ ] Run:

```bash
pnpm -F @deepwhale/coding-agent exec tsx scripts/gate2-long-horizon.mjs --fixture packages/coding-agent/test/fixtures/gate2/pass.json --json docs/superpowers/gate-2-long-horizon.json --md docs/superpowers/gate-2-long-horizon.md
```

- [ ] Commit:

```bash
git add packages/coding-agent/src/long-horizon/gate2.ts packages/coding-agent/scripts/gate2-long-horizon.mjs packages/coding-agent/test/unit/gate2-long-horizon.test.ts packages/coding-agent/test/fixtures/gate2/pass.json docs/superpowers/gate-2-long-horizon.json docs/superpowers/gate-2-long-horizon.md
git commit -m "feat: add long horizon gate harness"
```

### Task 5.6: v3.0 Release Gate

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run Gate-1 formal command.
- [ ] Run Gate-1.5 decision report.
- [ ] Run Gate-2 fixture report.
- [ ] Run one real 30 to 50 tool-call task before claiming Gate-2 pass.
- [ ] Commit docs with `git commit -m "docs: record v3 execute review gate"`.

## Stage 6: v4.0 Research And Agent OS

### Unlock Condition

- [ ] Gate-2 has a fresh pass on a real task.
- [ ] Researcher, TaskGraph, Persistent Memory, Desktop, and Channels remain stopped if Gate-2 fails.
- [ ] Single-process role switching remains the implementation model. Do not spawn five independent long-running agents.

### Task 6.1: Researcher Role

**Files:**
- Create: `packages/coding-agent/src/researcher/researcher.ts`
- Modify: `packages/coding-agent/src/agent/tool-loop.ts`
- Test: `packages/coding-agent/test/unit/researcher.test.ts`
- Test: `packages/coding-agent/test/integration/tool-loop-policy.test.ts`

- [ ] Add failing tests that Researcher can read and search but cannot modify files or run production actions.
- [ ] Add failing tests that Researcher output is an `Observation` consumed by Planner or Reviewer.
- [ ] Run targeted tests.
- [ ] Implement Researcher as an optional role injection point.
- [ ] Rerun targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/researcher/researcher.ts packages/coding-agent/src/agent/tool-loop.ts packages/coding-agent/test/unit/researcher.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
git commit -m "feat: add researcher role"
```

### Task 6.2: Cross-Session TaskGraph

**Files:**
- Create: `packages/coding-agent/src/taskgraph/taskgraph.ts`
- Modify: `packages/coding-agent/src/planner/task-dag.ts`
- Test: `packages/coding-agent/test/unit/taskgraph.test.ts`
- Test: `packages/coding-agent/test/unit/task-dag.test.ts`

- [ ] Add failing tests for cross-session persistence, dependency scheduling, retry counters, timeout state, and crash recovery.
- [ ] Run `pnpm vitest run packages/coding-agent/test/unit/taskgraph.test.ts packages/coding-agent/test/unit/task-dag.test.ts`.
- [ ] Implement append-only TaskGraph storage. Keep Session DAG and TaskGraph separate: Session DAG stores messages; TaskGraph stores work.
- [ ] Rerun targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/taskgraph/taskgraph.ts packages/coding-agent/src/planner/task-dag.ts packages/coding-agent/test/unit/taskgraph.test.ts packages/coding-agent/test/unit/task-dag.test.ts
git commit -m "feat: add persistent taskgraph"
```

### Task 6.3: Persistent Memory

**Files:**
- Create: `packages/coding-agent/src/memory/persistent-store.ts`
- Modify: `packages/coding-agent/src/memory/store.ts`
- Test: `packages/coding-agent/test/unit/persistent-memory.test.ts`
- Test: `packages/coding-agent/test/unit/memory-store.test.ts`

- [ ] Add failing tests for user, project, and session scopes.
- [ ] Add failing tests for hand-edit precedence over automatic extraction.
- [ ] Add failing tests that stale memories are archived and recoverable.
- [ ] Run targeted tests.
- [ ] Implement persistent memory with explicit source and scope fields.
- [ ] Rerun targeted tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/memory/persistent-store.ts packages/coding-agent/src/memory/store.ts packages/coding-agent/test/unit/persistent-memory.test.ts packages/coding-agent/test/unit/memory-store.test.ts
git commit -m "feat: add persistent memory"
```

### Task 6.4: Desktop Shell After Agent Core Is Stable

**Files:**
- Create: `packages/desktop/package.json`
- Create: `packages/desktop/src/main.ts`
- Create: `packages/desktop/src/App.tsx`
- Modify: `pnpm-workspace.yaml`
- Test: `packages/desktop/test/smoke.test.ts`

- [ ] Proceed only after Gate-2 pass and explicit user approval for desktop work.
- [ ] Add a failing smoke test that loads the desktop shell without invoking agent tools.
- [ ] Run `pnpm -F @deepwhale/desktop test`.
- [ ] Create the minimal Tauri shell that embeds the existing agent UI boundary.
- [ ] Rerun desktop smoke test.
- [ ] Confirm `pnpm typecheck`, `pnpm lint`, and `pnpm test` still pass for the workspace.
- [ ] Commit:

```bash
git add pnpm-workspace.yaml packages/desktop/package.json packages/desktop/src/main.ts packages/desktop/src/App.tsx packages/desktop/test/smoke.test.ts
git commit -m "feat: add desktop shell"
```

### Task 6.5: Channels And Marketplaces As Opt-In Surfaces

**Files:**
- Modify: `packages/coding-agent/src/channel/router.ts`
- Modify: `packages/coding-agent/src/channel/telegram.ts`
- Modify: `packages/coding-agent/src/channel/discord.ts`
- Modify: `packages/coding-agent/src/runtime/capability-registry.ts`
- Test: `packages/coding-agent/test/unit/channel-router.test.ts`
- Test: `packages/coding-agent/test/unit/telegram.test.ts`
- Test: `packages/coding-agent/test/unit/discord.test.ts`
- Test: `packages/coding-agent/test/unit/registry-profiles.test.ts`

- [ ] Add failing tests that all channel capabilities are opt-in and absent from the default profile.
- [ ] Add failing tests for idempotent message routing and explicit approval on outbound actions.
- [ ] Run targeted tests.
- [ ] Implement channel registration through the capability registry.
- [ ] Rerun targeted tests and registry profile tests.
- [ ] Commit:

```bash
git add packages/coding-agent/src/channel/router.ts packages/coding-agent/src/channel/telegram.ts packages/coding-agent/src/channel/discord.ts packages/coding-agent/src/runtime/capability-registry.ts packages/coding-agent/test/unit/channel-router.test.ts packages/coding-agent/test/unit/telegram.test.ts packages/coding-agent/test/unit/discord.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts
git commit -m "feat: register channels as opt in capabilities"
```

### Task 6.6: v4.0 Release Gate

- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Run Gate-1 formal command.
- [ ] Run Gate-1.5 report according to the v2.0 branch decision.
- [ ] Run Gate-2 on a real 30 to 50 tool-call task.
- [ ] Verify TaskGraph crash recovery by interrupting and resuming a fixture task.
- [ ] Verify persistent memory can be hand-edited and reloaded.
- [ ] Verify default profile still omits productivity, media, Browser, Computer Use, channels, MCP, and desktop actions unless explicitly selected.
- [ ] Commit docs with `git commit -m "docs: record v4 agent os gate"`.

## Concrete Test Bodies

Use these test bodies when a task above names the behavior but does not include inline code at the task site. Keep the imports aligned with the file under test and adjust only path depth.

### A.0 Shared Test Helpers

Paste only the helpers needed by the test file being edited. These helpers keep the examples below self-contained.

```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export async function createTempDir(prefix = 'dw-plan-'): Promise<string> {
  return mkdtemp(resolve(tmpdir(), prefix));
}

export async function createTempSessionFile(): Promise<string> {
  const dir = await createTempDir('dw-session-');
  return resolve(dir, 'session.jsonl');
}

export async function createRenameFixture(files: Record<string, string>): Promise<string> {
  const root = await createTempDir('dw-rename-');
  for (const [file, content] of Object.entries(files)) {
    const fullPath = resolve(root, file);
    await mkdir(resolve(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }
  return root;
}

export async function createSkillFixture(files: Record<string, string>): Promise<string> {
  const root = await createTempDir('dw-skill-');
  for (const [file, content] of Object.entries(files)) {
    const fullPath = resolve(root, file);
    await mkdir(resolve(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }
  return root;
}

export async function createGateFixture(): Promise<string> {
  const root = await createTempDir('dw-gate-');
  await mkdir(resolve(root, 'src'), { recursive: true });
  await writeFile(
    resolve(root, 'src/main.ts'),
    [
      'export function implementation() {',
      '  return 1;',
      '}',
      '',
      'export function entry() {',
      '  return implementation();',
      '}',
    ].join('\n'),
  );
  return root;
}

export function makeBrowserTasks(successes: number, failures: number) {
  return [
    ...Array.from({ length: successes }, (_, index) => ({ id: `s-${index}`, status: 'success' as const })),
    ...Array.from({ length: failures }, (_, index) => ({ id: `f-${index}`, status: 'failed' as const })),
  ];
}

export function makeGate2Transcript(input: {
  toolCalls: number;
  retries: number;
  goalDrift: boolean;
}) {
  return {
    goal: 'fix failing registry profile test',
    steps: Array.from({ length: input.toolCalls }, (_, index) => ({
      index: index + 1,
      tool: 'shell',
      summary: input.goalDrift && index === Math.floor(input.toolCalls / 2)
        ? 'started unrelated browser feature'
        : 'continued registry profile fix',
      retry: index < input.retries,
    })),
  };
}
```

### A.1 Linear Session Contract

Target task: Task 1.2.

```ts
import { describe, expect, it } from 'vitest';
import { appendSessionEvent, readSessionEvents } from '../../src/session/jsonl.js';

describe('linear session jsonl contract', () => {
  it('reloads events in append order after compaction metadata is present', async () => {
    const file = await createTempSessionFile();
    await appendSessionEvent(file, { id: '1', role: 'user', content: 'first' });
    await appendSessionEvent(file, { id: '2', role: 'assistant', content: 'second', metadata: { compacted: true } });

    const events = await readSessionEvents(file);

    expect(events.map((event) => event.id)).toEqual(['1', '2']);
    expect(events[1]).toMatchObject({ role: 'assistant', metadata: { compacted: true } });
  });

  it('stores dag fields as inert metadata in linear mode', async () => {
    const file = await createTempSessionFile();
    await appendSessionEvent(file, {
      id: '1',
      role: 'assistant',
      content: 'kept linear',
      metadata: { parentId: 'root', leafId: 'leaf' },
    });

    const [event] = await readSessionEvents(file);

    expect(event?.metadata).toEqual({ parentId: 'root', leafId: 'leaf' });
    expect(event).not.toHaveProperty('children');
  });
});
```

### A.2 Provider Cache Contract

Target task: Task 1.3.

```ts
import { describe, expect, it } from 'vitest';
import { canonicalizeSchema } from '../../src/canonicalize-schema.js';
import { serializeDeepSeekMessagesForTest } from '../_helpers/deepseek-serialization.js';

describe('provider cache contract', () => {
  it('canonicalizes object keys deterministically', () => {
    expect(canonicalizeSchema({ b: { d: true, c: true }, a: true })).toEqual({
      a: true,
      b: { c: true, d: true },
    });
  });

  it('serializes empty content as an empty string', () => {
    const payload = serializeDeepSeekMessagesForTest([{ role: 'assistant', content: '' }]);
    expect(payload.messages[0]).toMatchObject({ content: '' });
  });

  it('keeps reasoning content out of the wire payload', () => {
    const payload = serializeDeepSeekMessagesForTest([
      { role: 'assistant', content: 'answer', reasoning_content: 'private chain' },
    ]);
    expect(JSON.stringify(payload)).not.toContain('private chain');
  });
});
```

### A.3 TUI Smoke Contract

Target task: Task 1.4.

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.js';

describe('tui core workflow', () => {
  it('renders startup status and accepts slash help without throwing', () => {
    const screen = render(<App initialInput="/help" />);

    expect(screen.lastFrame()).toContain('deepwhale');
    expect(screen.lastFrame()).toContain('/help');
  });

  it('renders session list labels without resizing the status bar', () => {
    const screen = render(<App initialInput="/sessions" />);

    expect(screen.lastFrame()).toContain('Sessions');
    expect(screen.lastFrame()).toContain('Status');
  });
});
```

### A.4 Rename Symbol Guard

Target task: Task 2.2.

```ts
import { describe, expect, it } from 'vitest';
import { RenameSymbolTool } from '../../src/tools/rename-symbol.js';

describe('rename_symbol conservative mode', () => {
  it('does not rewrite comments, strings, unrelated locals, or unrelated files by default', async () => {
    const root = await createRenameFixture({
      'src/a.ts': [
        'export function target() { return 1; }',
        'export function caller() { return target(); }',
        "const text = 'target';",
        '// target is documentation only',
      ].join('\n'),
      'src/b.ts': 'function target() { return 2; }\n',
    });

    const result = await new RenameSymbolTool().execute({
      repo: root,
      symbol: 'target',
      new_name: 'renamedTarget',
      dry_run: true,
    });

    expect(result.summary).toContain('heuristic');
    expect(result.edits).toEqual([
      expect.objectContaining({ file: 'src/a.ts', oldText: 'target', newText: 'renamedTarget' }),
    ]);
    expect(JSON.stringify(result.edits)).not.toContain('documentation only');
  });
});
```

### A.5 Skills And Approval Contract

Target task: Task 2.4.

```ts
import { describe, expect, it } from 'vitest';
import { loadSkill } from '../../src/util/skill-loader.js';
import { requireApprovalForTool } from '../../src/repl/repl-confirm.js';

describe('skills and approval policy', () => {
  it('loads SKILL.md frontmatter and rejects missing capabilities', async () => {
    const skill = await loadSkill({
      root: await createSkillFixture({
        'SKILL.md': '---\nname: sample\ncapabilities:\n  - tool.read_file\n---\n# Sample\n',
      }),
      availableCapabilities: ['tool.read_file'],
    });

    expect(skill.name).toBe('sample');
    await expect(
      loadSkill({
        root: await createSkillFixture({
          'SKILL.md': '---\nname: bad\ncapabilities:\n  - tool.write_file\n---\n# Bad\n',
        }),
        availableCapabilities: ['tool.read_file'],
      }),
    ).rejects.toThrow(/missing capability: tool.write_file/);
  });

  it('requires approval for side-effecting tools', () => {
    expect(requireApprovalForTool({ name: 'read_file', riskLevel: 'low' })).toBe(false);
    expect(requireApprovalForTool({ name: 'bash', riskLevel: 'high' })).toBe(true);
  });
});
```

### A.6 Gate-1 Schema Contract

Target task: Task 2.5.

```ts
import { describe, expect, it } from 'vitest';
import { runGate1 } from '../../src/gate1.js';

describe('gate1 evidence schema', () => {
  it('returns the complete machine-readable evidence shape', async () => {
    const result = await runGate1({
      repoRoot: await createGateFixture(),
      entry: 'entry',
      caller: 'entry',
      callee: 'implementation',
      modificationFile: 'src/main.ts',
      modificationSymbol: 'implementation',
      minimumLoc: 1,
      timeboxMs: 1200000,
    });

    expect(result).toEqual(
      expect.objectContaining({
        repoRoot: expect.any(String),
        loc: expect.any(Number),
        supportedFiles: expect.any(Number),
        symbols: expect.any(Number),
        references: expect.any(Number),
        callEdges: expect.any(Number),
        elapsedMs: expect.any(Number),
        entry: expect.any(Object),
        callChain: expect.any(Array),
        modificationPoint: expect.any(Object),
        passed: true,
      }),
    );
  });
});
```

### A.7 Semantic Search Fallback

Target task: Task 3.2.

```ts
import { describe, expect, it } from 'vitest';
import { createSemanticIndex } from '../../src/semantic-index.js';

describe('semantic index fallback', () => {
  it('uses deterministic lexical ranking when embeddings are unavailable', async () => {
    const index = createSemanticIndex({ embeddingProvider: null });
    await index.addChunk({ id: 'auth', content: 'jwt middleware validates bearer token', symbolId: 'auth.ts:middleware' });
    await index.addChunk({ id: 'ui', content: 'renders status bar', symbolId: 'status.tsx:StatusBar' });

    const results = await index.search('bearer token auth', { maxResults: 1 });

    expect(results).toEqual([
      expect.objectContaining({ id: 'auth', mode: 'lexical_fallback', heuristic: true }),
    ]);
  });
});
```

### A.8 Browser Foundation Contract

Target task: Task 3.3.

```ts
import { describe, expect, it } from 'vitest';
import { observeHtml } from '../../src/browser/observation.js';
import { planBrowserAction } from '../../src/browser/planner.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('browser foundation opt in', () => {
  it('summarizes DOM, ranks elements, and records action history', () => {
    const observation = observeHtml({
      url: 'https://example.test',
      title: 'Example',
      html: '<main><button>Buy now</button><input aria-label="Search" /></main>',
      actionHistory: [{ type: 'navigate', target: 'https://example.test', result: 'success' }],
    });

    expect(observation.domSummary).toContain('button');
    expect(observation.visibleElements[0]).toMatchObject({ text: 'Buy now' });
    expect(observation.actionHistory).toHaveLength(1);
  });

  it('keeps browser tools out of the default registry', () => {
    expect(createDefaultRegistry().list().map((tool) => tool.name)).not.toContain('browser_navigate');
  });

  it('plans a click for a matching element', () => {
    const action = planBrowserAction({
      userIntent: 'click buy',
      observation: observeHtml({ url: 'https://example.test', title: 'Example', html: '<button>Buy now</button>' }),
    });

    expect(action).toMatchObject({ type: 'click', target: expect.stringContaining('Buy now') });
  });
});
```

### A.9 MCP Opt-In Contract

Target task: Task 3.4.

```ts
import { describe, expect, it } from 'vitest';
import { registerMcpManifest } from '../../src/mcp/runtime.js';
import { createCapabilityRegistry } from '../../src/runtime/capability-registry.js';

describe('mcp runtime opt in', () => {
  it('registers mcp tools as hidden capabilities until the mcp profile is selected', () => {
    const registry = createCapabilityRegistry();
    registerMcpManifest(registry, {
      server: 'gh-search',
      tools: [{ name: 'code_search', inputSchema: { type: 'object' } }],
    });

    expect(registry.list({ profiles: ['default'] })).toEqual([]);
    expect(registry.list({ profiles: ['mcp'] }).map((capability) => capability.id)).toEqual([
      'mcp.gh-search.code_search',
    ]);
  });
});
```

### A.10 Browser Gate Decision

Target task: Task 3.5.

```ts
import { describe, expect, it } from 'vitest';
import { evaluateBrowserGate15 } from '../../src/browser/gate15.js';

describe('browser viability gate', () => {
  it('maps success rate to roadmap branch decisions', () => {
    expect(evaluateBrowserGate15(makeBrowserTasks(16, 4)).decision).toBe('continue');
    expect(evaluateBrowserGate15(makeBrowserTasks(10, 10)).decision).toBe('freeze-enhancement');
    expect(evaluateBrowserGate15(makeBrowserTasks(9, 11)).decision).toBe('minimal-runtime');
  });
});
```

### A.11 Task DAG Contract

Target task: Task 4.1.

```ts
import { describe, expect, it } from 'vitest';
import { createTaskDag, markTaskDone, readyTasks } from '../../src/planner/task-dag.js';

describe('task dag', () => {
  it('moves tasks through pending ready running done states by dependency order', () => {
    const dag = createTaskDag([
      { id: 'a', goal: 'first', dependsOn: [] },
      { id: 'b', goal: 'second', dependsOn: ['a'] },
    ]);

    expect(readyTasks(dag).map((task) => task.id)).toEqual(['a']);
    const updated = markTaskDone(dag, 'a', { summary: 'ok' });
    expect(readyTasks(updated).map((task) => task.id)).toEqual(['b']);
  });

  it('rejects cycles', () => {
    expect(() =>
      createTaskDag([
        { id: 'a', goal: 'a', dependsOn: ['b'] },
        { id: 'b', goal: 'b', dependsOn: ['a'] },
      ]),
    ).toThrow(/cycle/);
  });
});
```

### A.12 Planner Boundary Contract

Target task: Task 4.2.

```ts
import { describe, expect, it } from 'vitest';
import { createPlanner } from '../../src/planner/planner.js';

describe('planner executor boundary', () => {
  it('lets planner create tasks but denies tool calls', async () => {
    const planner = createPlanner();
    const plan = await planner.plan({ goal: 'rename a symbol safely' });

    expect(plan.tasks.length).toBeGreaterThan(0);
    await expect(planner.callTool('read_file', { path: 'README.md' })).rejects.toThrow(/planner cannot call tools/);
  });
});
```

### A.13 Plan Cache Contract

Target task: Task 4.3.

```ts
import { describe, expect, it } from 'vitest';
import { createPlanCache } from '../../src/planner/plan-cache.js';

describe('plan cache', () => {
  it('uses stable keys and invalidates when the goal changes', async () => {
    const cache = createPlanCache({ root: await createTempDir() });
    const firstKey = cache.keyFor({ goal: 'fix bug', repoHash: 'abc' });
    const secondKey = cache.keyFor({ goal: 'fix bug', repoHash: 'abc' });
    const changedKey = cache.keyFor({ goal: 'add feature', repoHash: 'abc' });

    expect(firstKey).toBe(secondKey);
    expect(firstKey).not.toBe(changedKey);
  });
});
```

### A.14 Reviewer Contract

Target task: Task 5.1.

```ts
import { describe, expect, it } from 'vitest';
import { createReviewer } from '../../src/reviewer/reviewer.js';

describe('reviewer role', () => {
  it('approves passing verification and requests changes on failures', async () => {
    const reviewer = createReviewer({
      runCommand: async (command) => ({ command, exitCode: command.includes('fail') ? 1 : 0, stdout: '', stderr: '' }),
    });

    await expect(reviewer.review({ commands: ['pnpm test'] })).resolves.toMatchObject({ status: 'approve' });
    await expect(reviewer.review({ commands: ['pnpm fail'] })).resolves.toMatchObject({ status: 'request_changes' });
  });

  it('cannot modify production files', async () => {
    const reviewer = createReviewer({ runCommand: async () => ({ exitCode: 0, stdout: '', stderr: '' }) });
    await expect(reviewer.writeFile('src/app.ts', 'change')).rejects.toThrow(/reviewer cannot modify files/);
  });
});
```

### A.15 Compaction Hook Contract

Target task: Task 5.2.

```ts
import { describe, expect, it } from 'vitest';
import { compactSession } from '../../src/session/compaction.js';

describe('compaction hook contract', () => {
  it('uses compaction as the only prefix cache reset point', async () => {
    const resets: string[] = [];
    await compactSession({
      messages: [{ role: 'user', content: 'long task' }],
      onPrefixCacheReset: (reason) => resets.push(reason),
    });

    expect(resets).toEqual(['compaction']);
  });

  it('allows a hook to replace the default summary', async () => {
    const result = await compactSession({
      messages: [{ role: 'user', content: 'keep this' }],
      compact: async () => ({ summary: 'hook summary' }),
    });

    expect(result.summary).toBe('hook summary');
  });
});
```

### A.16 Computer Compatibility Contract

Target task: Task 5.4.

```ts
import { describe, expect, it } from 'vitest';
import { createComputerCompatRuntime } from '../../src/computer/compat-runtime.js';

describe('computer use compatibility runtime', () => {
  it('delegates actions to an external provider', async () => {
    const calls: string[] = [];
    const runtime = createComputerCompatRuntime({
      provider: {
        invoke: async (name) => {
          calls.push(name);
          return { status: 'ok' };
        },
      },
    });

    await runtime.invoke('computer.mouse_click', { x: 1, y: 2 });

    expect(calls).toEqual(['computer.mouse_click']);
  });

  it('does not export local vision or input primitives', async () => {
    const runtimeModule = await import('../../src/computer/compat-runtime.js');

    expect(runtimeModule).not.toHaveProperty('detectUiElements');
    expect(runtimeModule).not.toHaveProperty('screenCapture');
    expect(runtimeModule).not.toHaveProperty('mouseClick');
    expect(runtimeModule).not.toHaveProperty('keyboardType');
  });
});
```

### A.17 Gate-2 Contract

Target task: Task 5.5.

```ts
import { describe, expect, it } from 'vitest';
import { evaluateGate2Transcript } from '../../src/long-horizon/gate2.js';

describe('gate2 long horizon', () => {
  it('accepts 30 to 50 coherent tool calls and records retry recovery', () => {
    const result = evaluateGate2Transcript(makeGate2Transcript({ toolCalls: 35, retries: 1, goalDrift: false }));

    expect(result).toMatchObject({
      passed: true,
      toolCalls: 35,
      retries: 1,
      goalDriftDetected: false,
    });
  });

  it('fails when the transcript drifts from the original goal', () => {
    const result = evaluateGate2Transcript(makeGate2Transcript({ toolCalls: 35, retries: 0, goalDrift: true }));

    expect(result).toMatchObject({ passed: false, reason: 'goal-drift' });
  });
});
```

### A.18 Researcher Boundary Contract

Target task: Task 6.1.

```ts
import { describe, expect, it } from 'vitest';
import { createResearcher } from '../../src/researcher/researcher.js';

describe('researcher role', () => {
  it('returns observations from read-only exploration', async () => {
    const researcher = createResearcher({ readFile: async () => 'export const value = 1;' });

    await expect(researcher.inspectFile('src/index.ts')).resolves.toMatchObject({
      source: 'codebase',
      rawData: expect.stringContaining('value'),
    });
  });

  it('cannot modify files or execute production actions', async () => {
    const researcher = createResearcher({ readFile: async () => '' });

    await expect(researcher.writeFile('src/index.ts', 'change')).rejects.toThrow(/researcher cannot modify files/);
    await expect(researcher.runCommand('pnpm test')).rejects.toThrow(/researcher cannot execute commands/);
  });
});
```

### A.19 TaskGraph Contract

Target task: Task 6.2.

```ts
import { describe, expect, it } from 'vitest';
import { createTaskGraphStore } from '../../src/taskgraph/taskgraph.js';

describe('persistent taskgraph', () => {
  it('recovers tasks across restart and schedules only satisfied dependencies', async () => {
    const root = await createTempDir();
    const store = createTaskGraphStore({ root });
    await store.append({ id: 'a', goal: 'first', dependsOn: [], status: 'done' });
    await store.append({ id: 'b', goal: 'second', dependsOn: ['a'], status: 'pending' });

    const reloaded = createTaskGraphStore({ root });

    expect((await reloaded.readyTasks()).map((task) => task.id)).toEqual(['b']);
  });
});
```

### A.20 Persistent Memory Contract

Target task: Task 6.3.

```ts
import { describe, expect, it } from 'vitest';
import { createPersistentMemoryStore } from '../../src/memory/persistent-store.js';

describe('persistent memory', () => {
  it('keeps user project and session scopes separate', async () => {
    const store = createPersistentMemoryStore({ root: await createTempDir() });
    await store.put({ id: 'u', scope: 'user', source: 'user_explicit', content: 'prefers Chinese' });
    await store.put({ id: 'p', scope: 'project', source: 'project_fact', content: 'uses pnpm' });
    await store.put({ id: 's', scope: 'session', source: 'auto_extracted', content: 'temporary' });

    expect((await store.list({ scope: 'project' })).map((memory) => memory.id)).toEqual(['p']);
  });

  it('keeps hand edits over automatic extraction and archives stale memories', async () => {
    const store = createPersistentMemoryStore({ root: await createTempDir() });
    await store.put({ id: 'decision', scope: 'project', source: 'auto_extracted', content: 'old' });
    await store.put({ id: 'decision', scope: 'project', source: 'user_explicit', content: 'hand edited' });
    await store.archive('decision');

    expect(await store.get('decision')).toMatchObject({ content: 'hand edited', archived: true });
  });
});
```

### A.21 Desktop Smoke Contract

Target task: Task 6.4.

```ts
import { describe, expect, it } from 'vitest';
import { createDesktopShell } from '../src/main.js';

describe('desktop shell', () => {
  it('loads without invoking agent tools', async () => {
    const invokedTools: string[] = [];
    const shell = await createDesktopShell({ invokeTool: (name) => invokedTools.push(name) });

    expect(shell.status).toBe('ready');
    expect(invokedTools).toEqual([]);
  });
});
```

### A.22 Channel Opt-In Contract

Target task: Task 6.5.

```ts
import { describe, expect, it } from 'vitest';
import { createChannelRouter } from '../../src/channel/router.js';
import { createDefaultRegistry } from '../../src/tools/registry.js';

describe('channel capabilities', () => {
  it('keeps channels out of the default profile', () => {
    const names = createDefaultRegistry().list().map((tool) => tool.name);

    expect(names).not.toContain('telegram_send');
    expect(names).not.toContain('discord_send');
  });

  it('deduplicates outbound messages and requires approval', async () => {
    const router = createChannelRouter({ requireApproval: async () => true });

    await router.send({ idempotencyKey: '1', channel: 'telegram', text: 'hello' });
    await router.send({ idempotencyKey: '1', channel: 'telegram', text: 'hello' });

    expect(router.sentCount()).toBe(1);
  });
});
```

## Final Release Checklist

- [ ] `git status --short --branch` shows only intentional release changes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Formal Gate-1 evidence is fresh.
- [ ] Gate-1.5 evidence exists and the Browser branch decision is documented.
- [ ] Gate-2 evidence exists before v4.0 claims.
- [ ] `README.md` status matches actual gates.
- [ ] `ROADMAP.md` and `docs/ROADMAP_DECISIONS.md` do not claim gated work is complete before evidence exists.
- [ ] `package.json` and package workspace versions tell one version story.
- [ ] `pnpm-workspace.yaml` includes every workspace package that must participate in recursive verification.
- [ ] `.gitignore`, `.prettierignore`, and `eslint.config.js` keep generated Gate targets and state out of verification noise.
- [ ] `$patterns = @('TO'+'DO','TB'+'D','place'+'holder','lat'+'er','sim'+'ilar to'); foreach ($pattern in $patterns) { rg -n $pattern docs/superpowers/plans README.md ROADMAP.md docs/ROADMAP_DECISIONS.md }` returns no matches in newly edited release text.
- [ ] `git diff --check` exits `0`.

## Handoff Instructions For Agentic Workers

- [ ] Start with Stage 0. Do not jump to v2.0, v3.0, or v4.0 work.
- [ ] Use `superpowers:subagent-driven-development` when splitting independent tasks across agents.
- [ ] Use `superpowers:executing-plans` when executing this plan inline.
- [ ] Use `superpowers:test-driven-development` for every implementation task.
- [ ] Use `superpowers:systematic-debugging` before fixing any failing test or unexpected gate output.
- [ ] Use `superpowers:verification-before-completion` before claiming any task, gate, or release is complete.
- [ ] Keep commits narrow and named after the task.
- [ ] Stop and report if a gate fails three times for the same reason.
- [ ] Do not expand the default tool surface as a shortcut around a blocked task.
