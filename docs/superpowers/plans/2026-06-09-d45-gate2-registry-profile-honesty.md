# D45 Gate2 Registry Profile Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gate-2 live runs honest about the registry profile they use and default them to the frozen coding + Code Intel surface.

**Architecture:** Gate-2 live currently builds its registry with `profile: 'all'`, which can make live evidence appear stronger than the default product surface. Add an explicit `registryProfile` task-config field, default it to `default`, persist the selected profile in JSON/Markdown reports, and leave existing `all` support only as an explicit opt-in. Do not change the strict pass rules or add non-coding tools to the default profile.

**Tech Stack:** TypeScript, Vitest, `@deepwhale/coding-agent` Gate-2 runner scripts, registry profile tests, Superpowers TDD.

---

## Files

- Modify: `packages/coding-agent/scripts/gate2-runner-core.ts`
  - Add `registryProfile?: ToolRegistryProfile` to `TaskConfig`.
  - Parse and validate `registryProfile` from task JSON.
  - Add `registryProfile?: ToolRegistryProfile` to `Gate2Report`.
  - Render `registryProfile` in Markdown when present.
- Modify: `packages/coding-agent/scripts/gate2-runner-live.ts`
  - Pass `createDefaultRegistry({ profile: task.registryProfile ?? 'default' })`.
  - Persist `registryProfile: task.registryProfile ?? 'default'` in the report.
- Modify: `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`
  - Add RED tests for default registry profile parsing, explicit `all`, invalid profile rejection, and persisted report rendering.
- Modify: `fixtures/gate2-live/task.json`
  - Add `"registryProfile": "default"` so the checked-in live task advertises the actual default surface.
- Modify: `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md`
  - Note D45 intent/status without increasing v1-v4 percentages.

## Task 1: RED Tests For Task Config And Report Shape

- [x] Add tests to `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`:

```ts
it('defaults registryProfile to default when omitted', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
  try {
    const cfgPath = join(tmp, 'task.json');
    await writeFile(cfgPath, JSON.stringify({ goal: 'fix', workspacePath: '/tmp/ws' }), 'utf8');
    const task = await readTaskConfig(cfgPath);
    expect(task.registryProfile).toBe('default');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

it('parses explicit all registryProfile as opt-in', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
  try {
    const cfgPath = join(tmp, 'task.json');
    await writeFile(
      cfgPath,
      JSON.stringify({ goal: 'fix', workspacePath: '/tmp/ws', registryProfile: 'all' }),
      'utf8',
    );
    const task = await readTaskConfig(cfgPath);
    expect(task.registryProfile).toBe('all');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

it('rejects unknown registryProfile values', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
  try {
    const cfgPath = join(tmp, 'task.json');
    await writeFile(
      cfgPath,
      JSON.stringify({ goal: 'fix', workspacePath: '/tmp/ws', registryProfile: 'browser' }),
      'utf8',
    );
    await expect(readTaskConfig(cfgPath)).rejects.toThrow(/invalid registryProfile/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

it('writes registryProfile into Gate-2 JSON and Markdown reports', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'g2-out-'));
  try {
    const report: Gate2Report = {
      source: 'live-llm',
      passed_live: true,
      passed_mock: false,
      toolCalls: 49,
      retries: 0,
      goalDriftDetected: false,
      reviewStatus: 'approve',
      registryProfile: 'default',
      finalResult: 'pass',
      startedAt: '2026-06-09T00:00:00Z',
      finishedAt: '2026-06-09T00:01:00Z',
      durationMs: 60_000,
    };
    const jsonPath = join(tmp, 'out.json');
    const mdPath = join(tmp, 'out.md');
    await writeReport(report, jsonPath, mdPath);
    expect(JSON.parse(await readFile(jsonPath, 'utf8'))).toMatchObject({ registryProfile: 'default' });
    expect(await readFile(mdPath, 'utf8')).toContain('registryProfile: `default`');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
```

- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

Expected before implementation: fail because `registryProfile` is missing or not validated.

Execution note: RED confirmed 5 expected failures: task config default/explicit/invalid `registryProfile` and Markdown report rendering were missing.

## Task 2: GREEN Implementation

- [x] In `gate2-runner-core.ts`, import `ToolRegistryProfile` from `../src/tools/registry.js`.
- [x] Add a local set of valid profiles:

```ts
const VALID_REGISTRY_PROFILES: ReadonlySet<ToolRegistryProfile> = new Set([
  'default',
  'core',
  'coding',
  'code-intel',
  'web',
  'engineering',
  'research',
  'productivity',
  'media',
  'all',
]);
```

- [x] Add:

```ts
function readRegistryProfile(raw: unknown): ToolRegistryProfile {
  if (raw === undefined) return 'default';
  if (typeof raw !== 'string' || !VALID_REGISTRY_PROFILES.has(raw as ToolRegistryProfile)) {
    throw new Error(`task-config invalid registryProfile: ${String(raw)}`);
  }
  return raw as ToolRegistryProfile;
}
```

- [x] Return `registryProfile: readRegistryProfile(parsed.registryProfile)` from `readTaskConfig`.
- [x] Add `registryProfile?: ToolRegistryProfile` to `Gate2Report`.
- [x] Render it in `renderMarkdown`:

```ts
if (r.registryProfile !== undefined) lines.push(`- registryProfile: \`${r.registryProfile}\``);
```

- [x] In `gate2-runner-live.ts`, set:

```ts
const registryProfile = task.registryProfile ?? 'default';
...
registry: createDefaultRegistry({ profile: registryProfile }),
...
registryProfile,
```

- [x] Update `fixtures/gate2-live/task.json` with `"registryProfile": "default"`.

## Task 3: Verification

- [x] Run targeted tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts
```

Execution note: passed with 3 test files and 46 tests.

- [x] Run static checks:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
```

Execution note: all exited 0; `git diff --check` clean.

- [x] Run full test if time and live-network access are available:

```powershell
pnpm.cmd test
```

If sandbox blocks live tests with network `fetch failed` or `EACCES`, rerun the same command with approved escalation and record both facts.

Execution note: sandboxed `pnpm.cmd test` failed with `[ERROR] fetch failed`; approved non-sandbox rerun passed with 193 test files (192 passed, 1 skipped) and 1148 tests (1144 passed, 4 skipped).

## Task 4: Commit And Push

- [ ] Inspect:

```powershell
git status --short --branch
git diff --stat
```

- [ ] Stage only D45 files:

```powershell
git add packages/coding-agent/scripts/gate2-runner-core.ts packages/coding-agent/scripts/gate2-runner-live.ts packages/coding-agent/test/scripts/gate2-runner-core.test.ts fixtures/gate2-live/task.json docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md docs/superpowers/plans/2026-06-09-d45-gate2-registry-profile-honesty.md
```

- [ ] Commit:

```powershell
git commit -m "fix(D-45): default gate2 live registry profile"
```

- [ ] Push:

```powershell
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- This slice does not add or expose any new default tools.
- This slice intentionally does not rerun Gate-2 live evidence; if evidence is regenerated later, it must record `registryProfile`.
- This slice does not claim Gate-1 preferred 100K maturity.
