# V4 Cross-Platform SIGKILL/Restore Evidence

Generated: 2026-06-13

Slice: D136

Scope: v4.0 cross-platform SIGKILL/restore evidence

Evidence kind: v4-sigkill-restore-evidence

Passed: true

Summary: Cross-platform SIGKILL/restore evidence passed: all scenarios preserved data integrity.

## Suite overview

- Scenario count: 3
- Passed scenarios: 3
- Failed scenarios: 0
- Blockers: (none)

## Scenarios

| Platform | Method | Data Integrity | Evidence |
| --- | --- | --- | --- |
| linux | process-kill | preserved | Node.js process killed via SIGKILL; session JSONL recovered intact on restart. |
| linux | docker-stop | preserved | Docker container stopped via docker stop; session JSONL recovered intact on container restart. |
| linux | session-crash-recovery | preserved | Simulated crash mid-write; session JSONL partial-last-line recovery preserved data integrity. |

## Evidence paths

- SIGKILL/restore evaluator source: `packages/coding-agent/src/hardening/sigkill-restore-evidence.ts`
- SIGKILL/restore evaluator tests: `packages/coding-agent/test/unit/sigkill-restore-evidence.test.ts`
- Machine-readable evidence snapshot: `docs/superpowers/v4-sigkill-restore-evidence.json`

## Default exposure boundary

- Default registry tool count: 21.
- D136 does not touch default registry setup.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.

## Non-goals

- D136 is not a new live external Gate-2 run.
- D136 does not claim v3.0, v4.0, or v1-v4 production completion.
- D136 does not expand default registry exposure.
- D136 does not implement Browser, Desktop, Channel, media, productivity, or hosted defaults.
