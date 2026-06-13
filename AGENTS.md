# AGENTS.md

## Project Overview

DeepWhale is a DeepSeek-first AI coding agent (Claude Code alternative). pnpm monorepo, TypeScript strict, Node >=20.

## Quick Commands

```bash
# Full verification pipeline (must run in this order before commit)
pnpm build && pnpm lint && pnpm typecheck && pnpm test

# Dev mode (watches all packages in parallel)
pnpm dev

# Single package dev
pnpm -F @deepwhale/coding-agent dev

# Focused test run (vitest)
pnpm test -- path/to/file.test.ts

# Format check / fix
pnpm format:check
pnpm format
```

**Critical**: `pnpm test` runs `pretest: tsc -b` automatically. If you run vitest directly without building first, tests may fail on stale dist/.

## Monorepo Structure

```
packages/
  core/          - i18n, session JSONL, compaction, types
  llm/           - LLM client (DeepSeek + Anthropic), pricing TOML
  coding-agent/  - CLI entry, tools (6 core), sandbox, policy chain
  edit-engine/   - hashline + unified-diff editing
  tui-ink/       - TUI (Ink 6 + React 19, esbuild bundle)
  code-intel/    - Tree-sitter WASM parsing, symbol graph
  mcp-servers/   - MCP server implementations
  desktop/       - Desktop app (early stage)
```

## Package Dependencies

`coding-agent` depends on `core`, `llm`, `edit-engine`, `code-intel`. Build order matters: `core` first, then `llm`, then others.

## Tooling

- **Package manager**: pnpm 10.33.0 (uses `corepack pnpm`)
- **TypeScript**: strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax: false`
- **ESLint**: `--max-warnings 0` (any warning fails lint)
- **Prettier**: single quotes, trailing commas, 100 char width, LF line endings
- **Vitest**: tests in `packages/*/src/**/*.test.ts` and `packages/*/test/**/*.test.ts`

## Testing Quirks

- **Vitest alias**: `@deepwhale/core` resolves to `packages/core/src/index.ts` in tests (not dist). This prevents stale dist issues.
- **Setup file**: `packages/coding-agent/test/setup-env.ts` loads `.env` via `loadProjectEnv()` before tests.
- **Integration tests**: gated by `INTEGRATION=1` env var. Without it, all integration tests skip (not fail).
- **API keys**: `DEEPSEEK_API_KEY` and `ANTHROPIC_AUTH_TOKEN` needed for integration tests. Test code never reads `.env` directly—only `process.env`.
- **Test count drifts**: test numbers fluctuate; do not hardcode expected counts.

## Environment

- `.env.example` → copy to `.env` (gitignored, never commit `.env`)
- `.env` auto-loaded at vitest startup and CLI entry
- `??=` semantics: shell exports / CI set always override `.env`

## Gate System

The repo has a gate-driven development process. Gate evidence lives in `docs/superpowers/`. Do not weaken gate thresholds or claim unverified milestones.

## Code Conventions

- Prefixed unused vars with `_` (ESLint rule)
- `no-console: off` is allowed
- All source is ESM (`"type": "module"`)
- Cross-package imports use workspace protocol (`@deepwhale/*`)
- TUI uses esbuild bundle; do not add runtime deps to tui-ink without checking bundle impact

## What NOT to Do

- Do not add Browser, Desktop, Channel, media, or productivity tools to the default registry
- Do not count module existence as production integration
- Do not count mock evidence as live evidence
- Do not run `git add -A` or `git add .` (may include `.env` or large binaries)
- Do not skip `pretest` step when running vitest manually
