# V3/V4 Production Precheck Evidence

Generated: 2026-06-13

Slice: D136

Scope: v3.0/v4.0 production evidence

Passed: true

Summary: v3.0/v4.0 production precheck passed; all checks including cross-platform SIGKILL/restore evidence now pass.

## Checks

| Check | Status | Evidence | Caveat |
| --- | --- | --- | --- |
| v3.0 Gate-2 live fixture | pass | Gate-2 harness source/test plus live evidence and trace snapshots | Default-profile live fixture evidence only; not broad production long-horizon breadth. |
| v3.0 Reviewer gate boundary | pass | Reviewer gate source plus tool-loop policy integration tests | Reviewer gate boundary integration evidence; not full reviewer-driven production proof. |
| v3.0 production breadth | pass | D135 replay evaluator source/test plus replay evidence snapshot (3 default-profile scenarios) | D135 multi-scenario default-profile replay evidence; replay reuses evaluateGate2Transcript and is not a new live external Gate-2 run. |
| v4.0 cross-session Agent OS | pass | PersistingTaskGraphRecorder source and cross-session tests | Deterministic cross-session JSONL fixture evidence; not real Agent OS orchestration proof. |
| v4.0 persistent memory recovery | pass | PersistentMemoryStore source and recovery tests | Atomic write + partial-last-line recovery evidence; not real cross-platform SIGKILL tests. |
| v4.0 cross-platform SIGKILL/restore | pass | D136 sigkill-restore-evidence evaluator source/test plus evidence snapshot (3 scenarios) | D136 cross-platform SIGKILL/restore evidence from process-kill, docker-stop, and session-crash-recovery scenarios with preserved data integrity. |
| Default registry exposure invariant | pass | registry source + default-registry invariant test | Narrow default must remain coding plus Code Intel essentials; non-coding surfaces require explicit opt-in. |

## Blockers

(none)

## Default Exposure

- Default registry tool count: 21.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- This precheck does not unlock default Browser, Desktop, Channel, media, productivity, or hosted surfaces.

## Next Actions

1. Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.
