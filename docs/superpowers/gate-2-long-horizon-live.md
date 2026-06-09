# Gate-2 Run Report (D-39 evidence hardened)

## Status: passed_live = FALSE (drift fixed, 5/6 conditions pass)

D-39 fixes:
- Fixture now lives in repo (`packages/coding-agent/test/fixtures/gate2-live/fixture/`)
  and is materialized to a fresh temp dir per run. No hardcoded user paths.
- Drift detector is now multi-signal: workspace scope, expectedFile touch,
  assistant content, review-gate invocation. No more false-positive drift
  on legitimate `bash ls` / `read_file src/calc.ts` calls.
- System prompt is D-39-tuned so the LLM converges cleanly to `'pass'`.

## Run Details

- source: `live-llm` (real DeepSeek v4-flash, NOT mock)
- passed_live: `false` (1 of 6 conditions fails)
- passed_mock: `false`
- toolCalls: `15` (FAIL: below the 30-call minimum)
- retries: 0
- goalDriftDetected: `false` (D-39 multi-signal, correct)
- reviewStatus: `approve`
- finalResult: `pass`
- taskgraphNodes: 13
- workspace: `C:\Users\BUTTER~1\AppData\Local\Temp\gate2-fixt-yLognt` (fresh temp dir per run)
- durationMs: 27436

## D-38 vs D-39 scorecard

| Condition                      | D-38 (legacy)     | D-39 (this run) |
|--------------------------------|-------------------|-----------------|
| source === live-llm            | PASS              | PASS            |
| reviewStatus === approve       | PASS              | PASS            |
| finalResult === pass           | FAIL (limit)      | PASS            |
| liveError absent               | PASS              | PASS            |
| toolCalls in [30, 50]          | FAIL (54)         | FAIL (15)       |
| goalDriftDetected === false    | FAIL (heuristic)  | PASS            |
| **passed_live**                | **false**         | **false**       |

## Why this is the HONEST state

- The LLM (DeepSeek v4-flash) actually did the work: all 6 bugs in
  `src/calc.ts` were fixed correctly, `pnpm test` returns 0-fail.
- The 6-bug fixture is the most substantial task the runner can express
  with the current fixture design. The LLM converges in 15 calls because
  it can read the file once, identify all 6 bugs from the source comments,
  and patch them in a single round. This is GOOD agent behaviour, not a
  bug.
- The 30-50 tool-call spec assumed a "long-horizon" task. A 6-bug
  single-file fix is not actually long-horizon. To unlock a true
  passed_live=true, the fixture would need to be a multi-file refactor
  (e.g. add a new module + tests + integration + docs), which is a
  different design exercise (D-40 candidate).
- We deliberately did NOT loosen the 30-50 rule. Strict rules stay strict.

## What needs to happen for a real passed_live=true

- (a) Design a multi-file refactor fixture (e.g. split a 100-line module
  into 3 files, add integration tests, add JSDoc). Expect 30-50 calls.
- (b) Or: add an explicit "checkpoint" requirement in the goal so the
  LLM cannot converge in one round.
- (c) Or: leave the 30-50 spec as-is and accept that the current fixture
  is bounded by LLM efficiency, not runner design.

## Verifiable evidence

- `gate-2-long-horizon-live.json` — the report
- `gate2-live-trace.json` — full step transcript
- Workspace at `C:\Users\BUTTER~1\AppData\Local\Temp\gate2-fixt-yLognt` —
  fresh per run, contains fixed `src/calc.ts` + clean test output
- Fixture source committed: `packages/coding-agent/test/fixtures/gate2-live/fixture/`
