# D57 Registry Profile Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make registry profile policy machine-readable and honest: default stays coding plus Code Intel, stable public profiles are explicit, and historical web/engineering/research profiles are marked legacy opt-in instead of being confused with the stabilization profile set.

**Architecture:** Keep existing tool behavior compatible, but add a small policy layer in `registry.ts` that all validators can reuse. Gate-2 task parsing should stop carrying its own duplicated profile list. Tests should assert the exact stable profile set, legacy opt-in set, default exposure, and invalid Browser/Desktop/Channel profile rejection.

**Tech Stack:** TypeScript, Vitest, ESLint, pnpm workspaces, existing `ToolRegistry` and Gate-2 runner helpers.

---

## Constraints

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked `docs/plans/*.md` files and `docs/superpowers/plans/2026-06-09-v1-to-v4-master-execution-plan.md`.
- Do not add any new tools.
- Do not default-enable Browser, Desktop, Channel, web, engineering, research, productivity, media, marketplace, or deploy tools.
- Do not weaken Gate-1 or Gate-2 thresholds.
- Keep `createDefaultRegistry()` behavior compatible unless a failing test proves a change is required.
- Use TDD: write failing policy tests before editing production code.
- Do not use `git add .`.

## Files

- Modify: `packages/coding-agent/src/tools/registry.ts`
- Modify: `packages/coding-agent/scripts/gate2-runner-core.ts`
- Create: `packages/coding-agent/test/unit/registry-profile-policy.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-web.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-engineering.test.ts`
- Modify: `packages/coding-agent/test/unit/registry-profile-research.test.ts`
- Modify: `docs/superpowers/plans/2026-06-10-d57-registry-profile-policy.md`

## Task 1: RED Policy Contract

- [x] Add `packages/coding-agent/test/unit/registry-profile-policy.test.ts` with assertions for:
  - `STABLE_REGISTRY_PROFILES` equals `['core', 'coding', 'code-intel', 'productivity', 'media', 'all']`.
  - `LEGACY_OPT_IN_REGISTRY_PROFILES` equals `['web', 'engineering', 'research']`.
  - `isToolRegistryProfile('browser')`, `isToolRegistryProfile('desktop')`, and `isToolRegistryProfile('channel')` are false.
  - `registryProfilePolicy('default')` says `defaultEnabled: true` and `explicitOptInRequired: false`.
  - `registryProfilePolicy('web')` says `kind: 'legacy-opt-in'` and `explicitOptInRequired: true`.
  - `createDefaultRegistry()` still exposes only coding plus Code Intel essentials and excludes Browser/media/productivity/engineering/research tools.

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\registry-profile-policy.test.ts
```

Expected before implementation: fail because the exported policy constants/functions do not exist.

RED evidence:

- `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\registry-profile-policy.test.ts` failed as expected:
  - `STABLE_REGISTRY_PROFILES` was `undefined`;
  - `isToolRegistryProfile is not a function`;
  - `registryProfilePolicy is not a function`.

## Task 2: Implement Registry Policy API

- [x] In `packages/coding-agent/src/tools/registry.ts`, replace the duplicated profile union with exported profile arrays and derived types:

```ts
export const STABLE_REGISTRY_PROFILES = ['core', 'coding', 'code-intel', 'productivity', 'media', 'all'] as const;
export type StableToolRegistryProfile = (typeof STABLE_REGISTRY_PROFILES)[number];

export const LEGACY_OPT_IN_REGISTRY_PROFILES = ['web', 'engineering', 'research'] as const;
export type LegacyOptInToolRegistryProfile = (typeof LEGACY_OPT_IN_REGISTRY_PROFILES)[number];

export const TOOL_REGISTRY_PROFILES = ['default', ...STABLE_REGISTRY_PROFILES, ...LEGACY_OPT_IN_REGISTRY_PROFILES] as const;
export type ToolRegistryProfile = (typeof TOOL_REGISTRY_PROFILES)[number];

export interface RegistryProfilePolicy {
  readonly profile: ToolRegistryProfile;
  readonly kind: 'default' | 'stable' | 'legacy-opt-in';
  readonly defaultEnabled: boolean;
  readonly explicitOptInRequired: boolean;
}
```

- [x] Add:

```ts
export function isToolRegistryProfile(value: unknown): value is ToolRegistryProfile {
  return typeof value === 'string' && (TOOL_REGISTRY_PROFILES as readonly string[]).includes(value);
}

export function registryProfilePolicy(profile: ToolRegistryProfile): RegistryProfilePolicy {
  if (profile === 'default') {
    return { profile, kind: 'default', defaultEnabled: true, explicitOptInRequired: false };
  }
  if ((LEGACY_OPT_IN_REGISTRY_PROFILES as readonly string[]).includes(profile)) {
    return { profile, kind: 'legacy-opt-in', defaultEnabled: false, explicitOptInRequired: true };
  }
  return { profile, kind: 'stable', defaultEnabled: false, explicitOptInRequired: true };
}
```

- [x] Rewrite the top file comment in `registry.ts` as ASCII and update comments around the switch to say `web`, `engineering`, and `research` are legacy opt-in profiles.

## Task 3: Remove Gate-2 Profile List Duplication

- [x] In `packages/coding-agent/scripts/gate2-runner-core.ts`, import `isToolRegistryProfile`.
- [x] Delete the local `VALID_REGISTRY_PROFILES` set.
- [x] Change `readRegistryProfile()` to:

```ts
function readRegistryProfile(raw: unknown): ToolRegistryProfile {
  if (raw === undefined) return 'default';
  if (!isToolRegistryProfile(raw)) {
    throw new Error(`task-config invalid registryProfile: ${String(raw)}`);
  }
  return raw;
}
```

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts packages\coding-agent\test\unit\registry-profile-policy.test.ts
```

Expected after implementation: pass.

GREEN evidence:

- `.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\scripts\gate2-runner-core.test.ts packages\coding-agent\test\unit\registry-profile-policy.test.ts` passed: 2 files, 46 tests.

## Task 4: Clean Profile Test Names

- [x] Update the `describe()` titles and top comments in:
  - `packages/coding-agent/test/unit/registry-web.test.ts`
  - `packages/coding-agent/test/unit/registry-profile-engineering.test.ts`
  - `packages/coding-agent/test/unit/registry-profile-research.test.ts`
- [x] Keep assertions behavior-compatible. The purpose is status hygiene, not tool expansion.

## Task 5: Verification

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages\coding-agent\test\unit\registry-profile-policy.test.ts packages\coding-agent\test\unit\registry-profiles.test.ts packages\coding-agent\test\unit\registry-profile-all.test.ts packages\coding-agent\test\unit\registry-web.test.ts packages\coding-agent\test\unit\registry-profile-engineering.test.ts packages\coding-agent\test\unit\registry-profile-research.test.ts packages\coding-agent\test\scripts\gate2-runner-core.test.ts
```

- Evidence: command passed with 7 files and 62 tests.

- [x] Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
```

- [ ] Run:

```powershell
pnpm.cmd test
```

If sandbox/network fails with `[ERROR] fetch failed`, rerun the exact command with escalation and record both outcomes.

Verification evidence:

- `.\node_modules\.bin\tsc.cmd -b`: exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0`: exit 0.
- `git diff --check`: exit 0.
- `pnpm.cmd test` in sandbox: failed with `[ERROR] fetch failed`.
- Approved non-sandbox rerun of the same `pnpm.cmd test`: passed with 196 test files passed, 1 skipped; 1168 tests passed, 4 skipped.

## Task 6: Commit And Push

- [x] Stage only D57 files:

```powershell
git add packages/coding-agent/src/tools/registry.ts packages/coding-agent/scripts/gate2-runner-core.ts packages/coding-agent/test/unit/registry-profile-policy.test.ts packages/coding-agent/test/unit/registry-web.test.ts packages/coding-agent/test/unit/registry-profile-engineering.test.ts packages/coding-agent/test/unit/registry-profile-research.test.ts docs/superpowers/plans/2026-06-10-d57-registry-profile-policy.md
```

- [ ] Commit:

```powershell
git commit -m "fix(D-57): codify registry profile policy"
```

- [ ] Push `feature/d36-gate2-live`.
