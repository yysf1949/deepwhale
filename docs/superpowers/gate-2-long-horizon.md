# Gate-2 Long-Horizon Report
- generated_at: 2026-06-09T03:46:52.287Z
- fixture: packages/coding-agent/test/fixtures/gate2/pass.json
- goal: fix failing registry profile test
- tool_calls: 35
- retries: 1
- goal_drift_detected: false
- passed: true

## Multi-Scenario Evidence (D142)

- total_scenarios: 5
- passed_scenarios: 5
- tool_call_range: 31-40

### Scenarios
1. invoice-domain-repair-live-replay (31 calls, 0 retries) — live trace replay
2. release-precheck-hardening-replay (35 calls, 1 retry) — precheck snapshot replay
3. cross-package-status-hygiene-replay (38 calls, 0 retries) — status doc fixture replay
4. code-refactor-transcript-replay (35 calls, 1 retry) — payment module api migration
5. bug-investigation-transcript-replay (40 calls, 2 retries) — session store race condition fix
