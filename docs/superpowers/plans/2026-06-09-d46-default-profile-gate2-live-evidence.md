# D46 Default Profile Gate2 Live Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate Gate-2 LIVE evidence with `registryProfile: "default"` recorded in the persisted report.

**Architecture:** D45 changed the live runner so task configs default to the frozen default registry profile and reports persist `registryProfile`. D46 must run the real Gate-2 invoice fixture through the live LLM path, keep all strict pass rules unchanged, and update only evidence/docs if the run genuinely passes. If the live run fails or credentials are unavailable, record the exact blocker without fabricating evidence.

**Tech Stack:** TypeScript, tsx, DeepSeek-compatible LLM config, Gate-2 live runner, Superpowers verification workflow.

---

## Files

- Read: `fixtures/gate2-live/task.json`
  - Must contain `"registryProfile": "default"`.
- Potentially modify: `docs/superpowers/gate-2-long-horizon-live.json`
  - Fresh persisted Gate-2 live report. Must contain `registryProfile: "default"` before it can be treated as default-profile proof.
- Potentially modify: `docs/superpowers/gate-2-long-horizon-live.md`
  - Markdown companion report.
- Potentially modify: `docs/superpowers/gate2-live-trace.json`
  - Fresh trace from the live run. Must not contain real API keys.
- Modify: `docs/superpowers/plans/2026-06-09-d46-default-profile-gate2-live-evidence.md`
  - Track execution notes and final status.
- Potentially modify: `README.md`
  - Only if D46 produces a real passed report; update status from D40 caveat to D46 default-profile evidence.
- Potentially modify: `docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md`
  - Only if D46 produces a real passed report; add D46 default-profile evidence note.

## Task 1: Preflight

- [x] Confirm branch and worktree scope.

Run:

```powershell
git status --short --branch
git log --oneline -3
```

Expected: branch is `feature/d36-gate2-live`; only unrelated untracked `docs/plans/*` and the master execution plan may be present.

Execution note: branch is `feature/d36-gate2-live`; tracked tree was clean before D46, with unrelated untracked `docs/plans/*`, the master execution plan, and this new D46 plan.

- [x] Confirm the task config uses the default profile.

Run:

```powershell
Get-Content -Raw fixtures/gate2-live/task.json
```

Expected: JSON includes `"registryProfile": "default"`.

Execution note: `fixtures/gate2-live/task.json` includes `"registryProfile": "default"`.

- [x] Confirm an LLM key is available without printing it.

Run:

```powershell
$keys = @('DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN')
$dotenv = @{}
if (Test-Path '.env') {
  foreach ($line in Get-Content '.env') {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$') {
      $dotenv[$matches[1]] = $true
    }
  }
}
foreach ($k in $keys) {
  [pscustomobject]@{
    Name = $k
    InProcess = [bool][Environment]::GetEnvironmentVariable($k, 'Process')
    InDotEnv = [bool]$dotenv[$k]
  }
}
```

Expected: `DEEPSEEK_API_KEY` is present either in process env or `.env`. If absent, stop the live run and record the blocker.

Execution note: `DEEPSEEK_API_KEY` was present in process env and `.env`; `ANTHROPIC_AUTH_TOKEN` was absent. No key value was printed.

## Task 1.5: Fix BOM JSON Config Blocker

- [x] Reproduce the live-run blocker.

Execution note: first D46 live run exited 3 before LLM execution because the temporary PowerShell-generated JSON config had a UTF-8 BOM:

```text
gate2-runner: Unexpected token '<BOM>', '<BOM>{ ...' is not valid JSON
```

- [x] Add a failing regression test.

Test added to `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`:

```ts
it('reads a valid config when the JSON file has a UTF-8 BOM', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'g2-'));
  try {
    const cfgPath = join(tmp, 'llm.json');
    await writeFile(
      cfgPath,
      `\uFEFF${JSON.stringify({ apiKey: 'sk-test', model: 'deepseek-v4-flash' })}`,
      'utf8',
    );
    const cfg = await readLLMConfig(cfgPath);
    expect(cfg.apiKey).toBe('sk-test');
    expect(cfg.model).toBe('deepseek-v4-flash');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
```

RED command:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

RED result: 1 failed, 37 passed; failure was `Unexpected token '<BOM>'`.

- [x] Implement minimal fix.

Implementation in `packages/coding-agent/scripts/gate2-runner-core.ts`:

```ts
function parseJsonWithOptionalBom(raw: string): unknown {
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}
```

`readLLMConfig()` and `readTaskConfig()` now parse through this helper.

- [x] Verify green.

GREEN command:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

GREEN result: 1 test file passed, 38 tests passed.

## Task 2: Run Default-Profile Gate-2 LIVE

- [x] Create a temporary LLM config outside the repo without printing the key.

Run:

```powershell
$tmp = Join-Path $env:TEMP 'deepwhale-gate2-live-llm-config.json'
$envFile = Join-Path (Get-Location) '.env'
$key = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'Process')
if (-not $key -and (Test-Path $envFile)) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DEEPSEEK_API_KEY\s*=\s*(.+)\s*$') {
      $key = $matches[1].Trim().Trim('"').Trim("'")
      break
    }
  }
}
if (-not $key) { throw 'DEEPSEEK_API_KEY unavailable for D46 live run' }
@{
  apiKey = $key
  model = 'deepseek-v4-flash'
} | ConvertTo-Json | Set-Content -Encoding UTF8 $tmp
Write-Output $tmp
```

Expected: outputs only the temp file path, not the key.

Execution note: temp config was written to `%TEMP%\deepwhale-gate2-live-llm-config.json`; only the path was printed.

- [x] Run the live Gate-2 runner.

Run:

```powershell
pnpm -F @deepwhale/coding-agent exec tsx scripts/gate2-runner.mjs --llm-config <TEMP_LLM_CONFIG_PATH> --task-config ../../fixtures/gate2-live/task.json --json ../../docs/superpowers/gate-2-long-horizon-live.json --md ../../docs/superpowers/gate-2-long-horizon-live.md
```

Expected success output:

```text
gate2-runner: source=live-llm passed_live=true passed_mock=false toolCalls=<30..50>
```

If the command exits non-zero, inspect the generated report and record the exact failing hard condition. Do not change Gate-2 thresholds to make it pass.

Execution note: after the BOM parser fix, live runner passed:

```text
gate2-runner: source=live-llm passed_live=true passed_mock=false toolCalls=31
```

- [x] Delete the temporary LLM config.

Run:

```powershell
Remove-Item -LiteralPath <TEMP_LLM_CONFIG_PATH> -Force
```

Expected: temp config removed.

Execution note: temp config was removed; `Test-Path` returned `False`.

## Task 3: Evidence Audit

- [x] Inspect the generated JSON report.

Run:

```powershell
Get-Content -Raw docs/superpowers/gate-2-long-horizon-live.json
```

Required fields:

```json
{
  "source": "live-llm",
  "passed_live": true,
  "passed_mock": false,
  "toolCalls": 30,
  "goalDriftDetected": false,
  "reviewStatus": "approve",
  "registryProfile": "default",
  "finalResult": "pass"
}
```

`toolCalls` can be any integer from 30 to 50 inclusive.

Execution note: report contains `source=live-llm`, `passed_live=true`, `passed_mock=false`, `toolCalls=31`, `reviewStatus=approve`, `registryProfile=default`, `goalDriftDetected=false`, and `finalResult=pass`.

- [x] Audit the trace for secret patterns.

Run:

```powershell
Select-String -Path docs/superpowers/gate2-live-trace.json -Pattern 'sk-[A-Za-z0-9_\-]{12,}|api_key["'']?\s*[:=]' -CaseSensitive
```

Expected: no matches.

Execution note: no matches for the configured secret patterns.

- [x] Update docs only if `passed_live=true` and `registryProfile=default`.

Required wording:

```markdown
D46 regenerated Gate-2 LIVE evidence with `registryProfile: "default"`, so the report now proves the frozen default coding + Code Intel tool surface can pass the invoice fixture under the strict six Gate-2 conditions. This still does not prove v1-v4 production completeness.
```

Execution note: README and D41 progress plan were updated with this exact caveat.

## Task 4: Verification

- [x] Run targeted tests.

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/test/unit/registry-profiles.test.ts packages/coding-agent/test/unit/registry-profile-all.test.ts
```

Expected: all tests pass.

Execution note: passed with 3 test files and 47 tests.

- [x] Run static checks.

Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
git diff --check
```

Expected: all exit 0.

Execution note: `tsc`, `eslint`, and `git diff --check` all exited 0.

- [x] Run full test.

Run:

```powershell
pnpm.cmd test
```

If sandbox blocks live/network with `fetch failed` or `EACCES`, rerun the same command with approved escalation and record both facts.

Execution note: sandboxed `pnpm.cmd test` failed with `[ERROR] fetch failed`; approved non-sandbox rerun passed with 193 test files (192 passed, 1 skipped) and 1149 tests (1145 passed, 4 skipped).

## Task 5: Commit And Push

- [ ] Inspect staged scope.

Run:

```powershell
git status --short --branch
git diff --stat
```

Expected: only D46 plan/evidence/docs files plus the BOM JSON reader fix are modified; unrelated untracked `docs/plans/*` are not staged.

- [ ] Stage only D46 files.

If D46 passes:

```powershell
git add docs/superpowers/plans/2026-06-09-d46-default-profile-gate2-live-evidence.md docs/superpowers/gate-2-long-horizon-live.json docs/superpowers/gate-2-long-horizon-live.md docs/superpowers/gate2-live-trace.json README.md docs/superpowers/plans/2026-06-09-d41-v1-v4-progress-and-next-48h.md
```

Also stage the BOM reader regression and fix:

```powershell
git add packages/coding-agent/scripts/gate2-runner-core.ts packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

If D46 is blocked before evidence generation:

```powershell
git add docs/superpowers/plans/2026-06-09-d46-default-profile-gate2-live-evidence.md
```

- [ ] Commit.

If D46 passes:

```powershell
git commit -m "test(D-46): refresh default-profile Gate-2 live evidence"
```

If D46 is blocked:

```powershell
git commit -m "docs(D-46): record default-profile Gate-2 live blocker"
```

- [ ] Push.

Run:

```powershell
git push origin feature/d36-gate2-live
```

## Self-Review Notes

- Do not claim default-profile Gate-2 pass unless the JSON report contains `registryProfile: "default"` and `passed_live: true`.
- Do not change strict Gate-2 pass rules.
- Do not add Browser, Desktop, Channel, media, productivity, or marketplace tools to the default profile.
- Do not commit temporary LLM config or secrets.
