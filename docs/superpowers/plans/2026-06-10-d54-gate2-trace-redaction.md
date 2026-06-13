# D54 Gate-2 Trace Redaction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for the code change and superpowers:verification-before-completion before committing.

**Goal:** Harden Gate-2 live trace persistence so committed traces do not expose local temp paths, private model reasoning, or API-key-like values.

**Architecture:** Keep Gate-2 pass criteria unchanged. Add a pure sanitizer for the persisted trace object and use it immediately before writing `gate2-live-trace.json`. The trace should keep enough structure for debugging (`messages`, `steps`, `review`) while redacting sensitive/local-only details.

**Constraints:**

- Work only from `D:\App\openClaw\projects\deepwhale`.
- Preserve unrelated untracked plan files.
- Do not alter `evaluatePassedLive()` thresholds.
- Do not reinterpret existing Gate-2 evidence.
- Do not add Browser, Desktop, Channel, media, productivity, marketplace, or default tool exposure.
- Use TDD: RED test first, then minimal implementation.

## Files

- Modify: `packages/coding-agent/test/scripts/gate2-runner-core.test.ts`
  - Add a regression test for trace redaction.
- Modify: `packages/coding-agent/scripts/gate2-runner-live.ts`
  - Export a pure `sanitizeTraceForPersistence()` helper.
  - Apply it before writing `gate2-live-trace.json`.
- Create: `docs/superpowers/plans/2026-06-10-d54-gate2-trace-redaction.md`

## Task 1: RED Test

- [x] Add a test that proves `sanitizeTraceForPersistence()`:
  - removes `reasoning_content`;
  - redacts `gate2-fixt-*` materialized fixture paths;
  - redacts `dw-exec-*` temp execution paths;
  - redacts API-key-like strings.
- [x] Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts
```

Expected before implementation: fail because `sanitizeTraceForPersistence()` is missing or does not redact.

RED evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts` failed with `sanitizeTraceForPersistence is not a function`.
- Follow-up RED for trace usefulness:
  `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts -t "trace persistence redaction"` failed because the sanitizer redacted the entire fixture path including `/docs/API.md`.

## Task 2: Implement Trace Sanitizer

- [x] Implement recursive redaction for arrays and plain objects.
- [x] Drop keys named `reasoning_content`.
- [x] Redact materialized Gate-2 fixture roots to `<materialized-gate2-fixture-workspace>`, preserving relative suffixes such as `/docs/API.md`.
- [x] Redact temp execute-code directory roots to `<temp-exec-workspace>`.
- [x] Redact API-key-like strings to `<redacted-secret>`.
- [x] Call the sanitizer before writing `gate2-live-trace.json`.
- [x] Re-sanitize the existing persisted `docs/superpowers/gate2-live-trace.json` evidence file.

GREEN evidence:

- `.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts -t "trace persistence redaction"` passed: 1 passed, 41 skipped.
- `rg -n "reasoning_content|gate2-fixt-[A-Za-z0-9_-]+|dw-exec-[A-Za-z0-9_-]+|C:\\Users\\BUTTER|C:/Users/BUTTER|sk-[A-Za-z0-9_-]{12,}" docs/superpowers/gate2-live-trace.json` returned no matches.

## Task 3: Verification

- [x] Run focused Gate-2 runner tests.
- [x] Run Gate-2 related tests:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/scripts/gate2-runner-core.test.ts packages/coding-agent/test/unit/gate2-long-horizon.test.ts packages/coding-agent/test/integration/tool-loop-policy.test.ts
```

- [x] Run:

```powershell
.\node_modules\.bin\tsc.cmd -b
.\node_modules\.bin\eslint.cmd . --max-warnings 0
pnpm.cmd test
git diff --check
```

If `pnpm.cmd test` fails in the sandbox with `[ERROR] fetch failed`, rerun the same command with approval and record both outcomes.

Verification evidence:

- Gate-2 related tests passed: 3 files, 50 tests.
- `.\node_modules\.bin\tsc.cmd -b` passed with exit 0.
- `.\node_modules\.bin\eslint.cmd . --max-warnings 0` passed with exit 0.
- `git diff --check` passed with exit 0.
- `pnpm.cmd test` in sandbox failed with `[ERROR] fetch failed`.
- `pnpm.cmd test` rerun outside sandbox passed: 194 test files, 193 passed / 1 skipped; 1162 tests, 1158 passed / 4 skipped.
- Trace residual audit returned no matches:
  `rg -n "reasoning_content|gate2-fixt-[A-Za-z0-9_-]+|dw-exec-[A-Za-z0-9_-]+|C:\\Users\\BUTTER|C:/Users/BUTTER|sk-[A-Za-z0-9_-]{12,}" docs/superpowers/gate2-live-trace.json`

## Task 4: Commit And Push

- [ ] Stage only D54 files.
- [ ] Commit with:

```powershell
git commit -m "fix(D-54): redact Gate-2 live trace persistence"
```

- [ ] Push `feature/d36-gate2-live`.
