# V3/V4 Production Precheck Evidence

Generated: 2026-06-13

Slice: D134

Scope: v3.0/v4.0 production evidence

Passed: false

Summary: v3.0/v4.0 production precheck is expected to fail overall; v3 production breadth and v4 cross-platform SIGKILL/restore evidence remain blockers.

This precheck is expected to fail overall until v3.0 production breadth and v4.0 cross-platform SIGKILL/restore evidence exist.

## Checks

| Check | Status | Evidence | Caveat |
| --- | --- | --- | --- |
| v3.0 Gate-2 live fixture | pass | Gate-2 harness source/test plus live evidence and trace snapshots | Default-profile live fixture evidence only; not broad production long-horizon breadth. |
| v3.0 Reviewer gate boundary | pass | Reviewer gate source plus tool-loop policy integration tests | Reviewer gate boundary integration evidence; not full reviewer-driven production proof. |
| v3.0 production breadth | blocked | tracked separately | Multi-scenario production long-horizon replay evidence is not yet present. |
| v4.0 cross-session Agent OS | pass | PersistingTaskGraphRecorder source and cross-session tests | Deterministic cross-session JSONL fixture evidence; not real Agent OS orchestration proof. |
| v4.0 persistent memory recovery | pass | PersistentMemoryStore source and recovery tests | Atomic write + partial-last-line recovery evidence; not real cross-platform SIGKILL tests. |
| v4.0 cross-platform SIGKILL/restore | blocked | tracked separately | Real cross-platform SIGKILL/restore evidence is not yet present. |
| Default registry exposure invariant | pass | registry source + default-registry invariant test | Narrow default must remain coding plus Code Intel essentials; non-coding surfaces require explicit opt-in. |

## Blockers

1. v3.0 production breadth needs multi-scenario long-horizon replay evidence.
2. v4.0 cross-platform SIGKILL/restore evidence is missing.

## Default Exposure

- Default registry tool count: 21.
- Browser, Desktop, Channel, media, and productivity remain opt-in or stopped, not default-enabled.
- This precheck does not unlock default Browser, Desktop, Channel, media, productivity, or hosted surfaces.

## Next Actions

1. D135: record multi-scenario v3.0 production long-horizon replay evidence without expanding default exposure.
2. D136: record real cross-platform v4.0 SIGKILL/restore evidence without expanding default exposure.
3. Keep Browser, Desktop, Channel, media, and productivity tools out of non-coding default exposure.
