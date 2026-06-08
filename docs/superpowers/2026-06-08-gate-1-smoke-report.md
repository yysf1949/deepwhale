# Gate-1 Report (2026-06-08)

## Result

**Status: Gate-1 passed on a qualifying 50K+ LOC repository.**

Formal Gate-1 target: a 50K+ LOC repository, preferably 100K LOC, with a 20 minute workflow:

1. locate entry point
2. follow call chain
3. identify modification point
4. produce implementation plan

The current workspace itself is still below the LOC threshold and remains a smoke target only. The formal Gate run used a real Vite source snapshot placed under the current workspace at `D:\App\openClaw\projects\deepwhale\.gate-targets\vite`. The target source directory is ignored by git; the machine-readable Gate evidence is retained under `docs/superpowers/`.

Machine-verifiable evidence now comes from `pnpm gate1:current`, which writes:

- `docs/superpowers/gate-1-current-workspace-result.json`
- `docs/superpowers/gate-1-current-workspace-result.md`

The same runner can also be pointed at an explicit scenario with `--scenario <json>` or direct CLI arguments such as `--repo`, `--entry`, `--caller`, `--callee`, `--mod-file`, and `--mod-symbol`. The formal Vite Gate evidence was written to:

- `docs/superpowers/gate-1-vite-result.json`
- `docs/superpowers/gate-1-vite-result.md`

## Formal Gate Target

- Repository snapshot: Vite `main`, downloaded from GitHub codeload into `.gate-targets/vite`
- Workspace location: `D:\App\openClaw\projects\deepwhale\.gate-targets\vite`
- Gate command:
  - `pnpm -F @deepwhale/code-intel exec tsx scripts/gate1-current-workspace.mjs --repo .gate-targets/vite --entry createServer --caller createServer --callee _createServer --mod-file packages/vite/src/node/server/index.ts --mod-symbol _createServer --json docs/superpowers/gate-1-vite-result.json --md docs/superpowers/gate-1-vite-result.md`
- Status: `passed`
- LOC: `86216` (minimum `50000`, preferred `100000`)
- Supported files: `1395`
- Files indexed: `1395`
- Symbols indexed: `7427`
- References indexed: `30821`
- Heuristic call edges found: `32830`
- Code Intel graph build: `2295ms`
- Call graph build: `890ms`
- Total Gate runner elapsed: `3534ms` of the `1200000ms` timebox

Entry/call-chain/modification-point evidence:

- Entry: `createServer` at `packages/vite/src/node/server/index.ts:473:7`
- Call chain: `packages/vite/src/node/server/index.ts:createServer -> packages/vite/src/node/server/index.ts:_createServer @ packages/vite/src/node/server/index.ts:476`
- Modification point: `_createServer` at `packages/vite/src/node/server/index.ts:479:7`

Implementation-plan output for the scenario:

- Treat `createServer` as the public entry wrapper and `_createServer` as the implementation modification point.
- Make dev-server initialization changes inside `_createServer`, because the call chain shows `createServer` delegates there before config resolution, watcher setup, HTTP server creation, websocket setup, plugin container creation, and close hooks.
- Keep public API compatibility at `createServer`; add or adjust tests around `_createServer` behavior and any affected `server` lifecycle methods.

This satisfies the 50K+ formal Gate threshold and the 20 minute timebox. It does not satisfy the preferred 100K LOC target, so a later 100K+ run would still be useful before expanding into Browser/media/productivity work again.

## Current-Workspace Smoke Target

Using Code Intel-supported source extensions only (`ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `py`, `go`, `sh`, `rs`) and excluding generated/vendor directories, the latest current-workspace run measured **43,041 LOC across 336 supported source files**. That is below the formal 50K+/100K Gate-1 target, so this report must not be treated as a Gate-1 pass.

- Workspace: `D:\App\openClaw\projects\deepwhale`
- Branch under test: `release/v2.0`
- Scope under test: registry profiles, Code Intel reference graph, call graph, `rename_symbol`
- Task scenario: locate the registry profile entry point, follow where the registry is consumed, identify the modification point, and produce the stabilization plan.

## Current-Workspace Evidence

- Code Intel graph build: `1039ms`
- Call graph build: `99ms`
- Total Gate runner elapsed: `1219ms` of the `1200000ms` timebox
- Files indexed: `336`
- Symbols indexed: `2596`
- References indexed: `15133`
- Heuristic call edges found: `2606`
- Machine failure reason: `loc-below-minimum: 43041 < 50000`

Entry/reference evidence for `createDefaultRegistry`:

- `packages/coding-agent/src/tools/registry.ts` defines the registry profile surface and profile switch.
- `packages/coding-agent/src/repl/repl-agent-turn.ts:122` and `:139` call `createDefaultRegistry` from `runAgentTurn`.
- The machine Gate runner verifies this call chain as:
  - `packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:122`
  - `packages/coding-agent/src/repl/repl-agent-turn.ts:runAgentTurn -> packages/coding-agent/src/tools/registry.ts:createDefaultRegistry @ packages/coding-agent/src/repl/repl-agent-turn.ts:139`

Modification-point evidence:

- The default tool exposure is controlled in `packages/coding-agent/src/tools/registry.ts`.
- The machine Gate runner identifies the modification point as `createDefaultRegistry at packages/coding-agent/src/tools/registry.ts:123:7`.
- Tests that pin the new behavior live under `packages/coding-agent/test/unit/registry-profile-*.test.ts` and `packages/coding-agent/test/unit/registry-profiles.test.ts`.
- Code Intel truthfulness and rename behavior are pinned under `packages/code-intel/test/unit/symbol-graph.test.ts`, `packages/coding-agent/test/unit/code-intel-descriptions.test.ts`, and `packages/coding-agent/test/unit/rename-symbol.test.ts`.

## Smoke Read

The project is now pointed back toward stabilization:

- non-coding tools are frozen behind explicit profiles
- default registry exposure is narrowed to coding + Code Intel essentials
- Code Intel tool descriptions now say heuristic instead of implying IDE/LSP-grade precision
- rename now uses Code Intel references instead of broad all-file textual replacement

The remaining Gate risk is still empirical and real. The call graph now filters call-expression-like matches, prefers relative import targets for same-name symbols, resolves multiline aliased TypeScript named imports back to their exported call target, follows TypeScript barrel re-exports for both named exports and `export *` edges, resolves TypeScript `tsconfig.json` `paths` aliases for imported call targets, and resolves TypeScript namespace import member calls such as `api.target()` to the imported module symbol instead of unrelated same-name declarations. That is enough for the recorded Vite 50K+ formal Gate pass, but a preferred 100K+ run remains recommended.

## Required Before Claiming Gate-1 Complete

- Keep `pnpm test`, `pnpm lint`, and `pnpm gate1:current` green or honestly documented before release. As of this report, `pnpm gate1:current` is intentionally documented as failing only because the current workspace itself is below 50K LOC.
- Run a preferred 100K+ LOC Gate scenario before resuming Browser/media/productivity expansion, or explicitly accept the Vite 86K LOC run as the v1 stabilization Gate.
- Record any future Gate scenario as JSON + Markdown under `docs/superpowers/`.
