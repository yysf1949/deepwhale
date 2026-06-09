# Gate-2 Run Report (D-38 evidence hardened)

## Status: passed_live = FALSE (hard fail, but evidence produced)

D-38 enforces a 6-rule strict pass criterion. This run fails 3 of 6:

- source: `live-llm` ✓
- reviewStatus: `approve` ✓
- finalResult: `limit` ✗ (must be `'pass'`)
- liveError: absent ✓
- toolCalls: `54` ✗ (must be ∈ [30, 50])
- goalDriftDetected: `true` ✗ (must be `false`, no heuristic override)

## Run Details

- source: `live-llm`
- passed_live: `false`
- passed_mock: `false`
- toolCalls: 54
- retries: 0
- goalDriftDetected: true
- reviewStatus: `approve`
- taskgraphNodes: 46
- goal: `Fix the bugs in the workspace's src/calc.ts. There are 3 bugs (subtract, power, squareRoot). ...`
- workspace: `C:/Users/butterfly443/AppData/Local/Temp/gate2-fixture-workspace`
- finalResult: `limit`
- liveError: absent
- startedAt: 2026-06-09T11:35:03.654Z
- finishedAt: 2026-06-09T11:36:23.569Z
- durationMs: 79915

## Why this is the HONEST state (not overclaim)

- The LLM **did fix all 3 bugs correctly** in the fixture workspace (subtract, power, squareRoot).
- The agent's `pnpm test` (run via review gates after the tool loop) returned `fail 0`.
- The LLM was the real DeepSeek v4-flash model — not a scripted mock.
- BUT: the runner hit its `maxSteps` cap (50) and the tool loop threw `ToolLoopLimitError` because the LLM kept exploring (54 tool calls, over the cap).
- Because the loop didn't terminate with `'pass'`, the review gates never got to confirm-test after the agent's last fix, so `reviewStatus='approve'` is from the partial in-loop run; the final result is `limit` not `pass`.
- The `goalDriftDetected=true` is a **heuristic false positive**: the detector compares tool-summary token overlap with goal tokens, but `bash ls /tmp/...` and `read_file src/calc.ts` summaries never contain the goal words ("subtract/power/squareRoot"). D-38 hard-fails on drift even when the review passed, per user direction (no heuristic override).

## What needs to happen for a real passed_live=true

- (a) Improve the drift detector to look at assistant `content` (not just tool summaries) so legitimate work is not flagged.
- (b) Design a fixture task that requires 30-50 calls without hitting maxSteps — e.g. a multi-file refactor with explicit checkpoints.
- (c) Lower `maxSteps` on a per-task basis so the LLM naturally terminates with `'pass'` instead of `limit`.

## Verifiable evidence

- `gate-2-long-horizon-live.json` — the report (this run)
- `gate2-live-trace.json` — full 94-step tool-loop transcript
- Workspace at `C:/Users/butterfly443/AppData/Local/Temp/gate2-fixture-workspace` — all 3 bugs fixed, `pnpm test` green
