# D132 V2 Tier-2 Automation Closure Design

## Context

D131 closed the MCP Runtime row with a one-server stdio JSON-RPC proof. The v2.0 precheck still has
two Tier-2 blockers: Automation and Remote TUI. The repository already has `CronStore`,
`CronDaemon`, `/cron` listing, and a TUI cron list component, but the daemon comments and tests still
describe the execution path as a stub. Counting that module existence as Automation completion would
violate the gate rules.

## Decision

D132 closes only the Automation Tier-2 row by adding a narrow, injected automation runtime proof:

- enabled cron jobs are loaded from `CronStore`,
- disabled jobs are skipped,
- each enabled job's prompt is passed to an injected `AutomationRunner`,
- each success or failure is persisted as a cron run record,
- one failed job does not stop later enabled jobs,
- the default registry stays unchanged.

The runner is injected so unit tests can prove the execution boundary without calling an LLM,
network, shell, or background service by default. This is enough to replace the old "daemon stub"
with a real runtime boundary while keeping the caveat honest: D132 is not a full scheduler service,
cron expression evaluator, no-agent thread resumer, or hosted automation system.

## Evidence Boundary

Automation may pass only when source and tests prove both execution and recording. Store-only,
daemon-only, or UI-only evidence remains insufficient.

The D132 evidence set is:

- `packages/coding-agent/src/util/automation-runtime.ts`: injected runner runtime that executes
  enabled cron jobs and records outcomes.
- `packages/coding-agent/src/util/cron-store.ts`: persisted cron jobs plus persisted run records.
- `packages/coding-agent/src/util/cron-daemon.ts`: existing timer/listing boundary reused by the
  runtime.
- `packages/coding-agent/test/unit/automation-runtime.test.ts`: runner execution, disabled-job
  skipping, success recording, failure recording, and continue-after-failure coverage.
- `packages/coding-agent/test/unit/cron-store.test.ts`: persisted run record coverage.
- `packages/coding-agent/test/unit/cron-daemon.test.ts`: existing timer boundary coverage.

## Non-Goals

- No default registry expansion.
- No LLM or API-key dependency in tests or default runtime construction.
- No cron expression parser or due-time filtering.
- No OS background service installer.
- No no-agent thread/session resumption claim.
- No Remote TUI status change.
- No claim that v2.0 is release-ready.

## Documentation

Update the v2.0 precheck and public status docs to D132:

- `tier2-automation` becomes pass with an explicit caveat: injected runner plus persisted run-record
  proof, not a full hosted/no-agent automation service.
- blockers shrink to Remote TUI only.
- next action becomes D133: close the remaining Remote TUI blocker or explicitly defer it to v2.0.x.
- v1-v4 remains incomplete, and v2.0 remains blocked until Remote TUI is handled.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Scope check: one execution boundary plus evidence docs; no scheduler service or LLM integration.
- Overclaiming check: the caveat names what is not complete.
- Default exposure check: D132 changes util/runtime evidence only and does not add tools to the
  default registry.
