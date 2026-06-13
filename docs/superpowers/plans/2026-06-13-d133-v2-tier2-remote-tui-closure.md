# D133 V2 Tier-2 Remote TUI Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Remote TUI item within v2.0 Tier-2 release evidence while keeping v1-v4 completion caveats explicit.

**Architecture:** Add a small authenticated Remote TUI session protocol bridge with an injected transport and injected local handlers. Feed the source and tests into the existing v2.0 precheck so all v2.0 precheck rows pass without adding a WebSocket listener or changing default registry exposure.

**Tech Stack:** TypeScript, Vitest, Markdown/JSON evidence files, pnpm monorepo verification.

---

## File Structure

- Create `packages/coding-agent/src/remote-tui/session.ts`: Remote TUI frame types and session bridge.
- Create `packages/coding-agent/src/remote-tui/index.ts`: exports for the new module.
- Create `packages/coding-agent/test/unit/remote-tui-session.test.ts`: RED/GREEN protocol proof.
- Modify `packages/coding-agent/src/release/v2-tier1-precheck.ts`: advance to D133, add Remote TUI evidence refs, remove Remote TUI from blocked checks, update caveat/summary/next actions.
- Modify `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`: expect D133 with all checks pass and no blockers.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require D133 public status and next-work pointers that move to v3.0/v4.0 gate evidence.
- Modify `docs/superpowers/v2-tier1-precheck.json`: D133 machine-readable evidence.
- Modify `docs/superpowers/v2-tier1-precheck.md`: D133 human-readable evidence.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json`: progress and blocker update.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.md`: scorecard mirror.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: current status blocks.
- Create `docs/superpowers/specs/2026-06-13-d133-v2-tier2-remote-tui-closure-design.md`: design record.
- Create `docs/superpowers/plans/2026-06-13-d133-v2-tier2-remote-tui-closure.md`: this plan.

### Task 1: RED Test For Remote TUI Session Protocol

- [ ] **Step 1: Create failing protocol tests**

Create `packages/coding-agent/test/unit/remote-tui-session.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  RemoteTuiSession,
  type RemoteTuiServerFrame,
  type RemoteTuiTransport,
} from '../../src/remote-tui/session.js';

class RecordingTransport implements RemoteTuiTransport {
  readonly frames: RemoteTuiServerFrame[] = [];
  closed = false;

  send(frame: RemoteTuiServerFrame): void {
    this.frames.push(frame);
  }

  close(): void {
    this.closed = true;
  }
}

describe('RemoteTuiSession (D133)', () => {
  it('authenticates a remote client and forwards input/resize to local handlers', () => {
    const transport = new RecordingTransport();
    const onInput = vi.fn();
    const onResize = vi.fn();
    const session = new RemoteTuiSession({
      sessionId: 'session-1',
      authToken: 'token-1',
      transport,
      onInput,
      onResize,
    });

    session.receive({ type: 'hello', token: 'token-1', clientId: 'client-a' });
    session.receive({ type: 'input', text: 'hello from remote' });
    session.receive({ type: 'resize', columns: 120, rows: 40 });
    session.publishOutput('local output');

    expect(onInput).toHaveBeenCalledWith({ text: 'hello from remote', clientId: 'client-a' });
    expect(onResize).toHaveBeenCalledWith({ columns: 120, rows: 40, clientId: 'client-a' });
    expect(transport.frames).toEqual([
      { seq: 1, type: 'welcome', sessionId: 'session-1', protocolVersion: 'remote-tui/v1' },
      { seq: 2, type: 'output', text: 'local output' },
    ]);
    expect(transport.closed).toBe(false);
  });

  it('rejects unauthorized clients before forwarding local input', () => {
    const transport = new RecordingTransport();
    const onInput = vi.fn();
    const session = new RemoteTuiSession({
      sessionId: 'session-1',
      authToken: 'token-1',
      transport,
      onInput,
    });

    session.receive({ type: 'hello', token: 'wrong', clientId: 'client-a' });
    session.receive({ type: 'input', text: 'should not pass' });

    expect(onInput).not.toHaveBeenCalled();
    expect(transport.frames).toEqual([
      { seq: 1, type: 'error', code: 'unauthorized', message: 'Remote TUI authentication failed' },
      { seq: 2, type: 'closed', reason: 'unauthorized' },
    ]);
    expect(transport.closed).toBe(true);
  });

  it('sends close frames exactly once', () => {
    const transport = new RecordingTransport();
    const session = new RemoteTuiSession({
      sessionId: 'session-1',
      authToken: 'token-1',
      transport,
    });

    session.receive({ type: 'hello', token: 'token-1', clientId: 'client-a' });
    session.close('server-shutdown');
    session.close('server-shutdown-again');

    expect(transport.frames.map((frame) => frame.type)).toEqual(['welcome', 'closed']);
    expect(transport.frames.at(-1)).toEqual({ seq: 2, type: 'closed', reason: 'server-shutdown' });
    expect(transport.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/remote-tui-session.test.ts --reporter=verbose
```

Expected: fail because `../../src/remote-tui/session.js` does not exist.

### Task 2: Implement Remote TUI Session

- [ ] **Step 1: Create session module**

Create `packages/coding-agent/src/remote-tui/session.ts` with:

```ts
export const REMOTE_TUI_PROTOCOL_VERSION = 'remote-tui/v1' as const;

export interface RemoteTuiTransport {
  send(frame: RemoteTuiServerFrame): void | Promise<void>;
  close(): void | Promise<void>;
}

export type RemoteTuiClientFrame =
  | { type: 'hello'; token: string; clientId: string }
  | { type: 'input'; text: string }
  | { type: 'resize'; columns: number; rows: number }
  | { type: 'disconnect'; reason?: string };
```

Implement `RemoteTuiSession` with synchronous methods `receive`, `publishOutput`, and `close`.
Maintain `authenticated`, `clientId`, `closed`, and `seq` state. Reject frames before `hello` with
an `unauthorized` error and close. Ignore frames after close.

- [ ] **Step 2: Create index export**

Create `packages/coding-agent/src/remote-tui/index.ts`:

```ts
export {
  REMOTE_TUI_PROTOCOL_VERSION,
  RemoteTuiSession,
} from './session.js';
export type {
  RemoteTuiClientFrame,
  RemoteTuiCloseReason,
  RemoteTuiInputEvent,
  RemoteTuiResizeEvent,
  RemoteTuiServerFrame,
  RemoteTuiSessionOptions,
  RemoteTuiTransport,
} from './session.js';
```

- [ ] **Step 3: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/remote-tui-session.test.ts --reporter=verbose
```

Expected: 3 tests pass.

### Task 3: Update D133 Precheck

- [ ] **Step 1: Update failing precheck expectations**

Change `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts` so it expects:

```ts
expect(result.slice).toBe('D133');
expect(result.passed).toBe(true);
expect(statusOf(result, 'tier2-remote-tui')).toBe('pass');
expect(result.blockers).toEqual([]);
expect(result.nextActions[0]).toContain('D134');
```

Update the evidence snapshot test to expect the same row/status/blockers.

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: fail because implementation still reports D132 and `tier2-remote-tui` blocked.

- [ ] **Step 3: Implement D133 precheck**

In `packages/coding-agent/src/release/v2-tier1-precheck.ts`:

- change result slice type and return value to `D133`;
- add Remote TUI evidence refs for `remote-tui/session.ts`, `remote-tui/index.ts`, and
  `remote-tui-session.test.ts`;
- remove `tier2-remote-tui` from `BLOCKED_CHECKS`;
- update the Remote TUI caveat to authenticated injected-transport protocol proof only;
- update summary and next actions to v3.0/v4.0 gate evidence.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: 4 tests pass.

### Task 4: Update Evidence Docs And Status Hygiene

- [ ] **Step 1: Update evidence docs**

Update `docs/superpowers/v2-tier1-precheck.json` to D133 with ten pass rows and no blockers.
`blockers` must be exactly:

```json
[]
```

Update `docs/superpowers/v2-tier1-precheck.md` to mirror the JSON.

- [ ] **Step 2: Update scorecard and public docs**

Update `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`, `README.md`, `ROADMAP.md`, and
`docs/ROADMAP_DECISIONS.md` with:

```text
Current sprint: D133 v2.0 Tier-2 Remote TUI closure
D133 v2.0 Tier-2 Remote TUI closure: Remote TUI now has an authenticated injected-transport protocol/session proof...
Next implementation slice: D134 advance v3.0/v4.0 production gate evidence without expanding default exposure.
```

Keep v1-v4 incomplete because v3.0/v4.0 blockers remain.

- [ ] **Step 3: Update status hygiene test**

Change `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` expectations from D132/D133 to
D133/D134 and add negative checks for stale `Current sprint: D132` and `Next implementation slice:
D133 close`.

- [ ] **Step 4: Run docs-focused GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/remote-tui-session.test.ts packages/coding-agent/test/unit/v2-tier1-precheck.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/coding-agent/test/unit/default-registry-invariant.test.ts --reporter=verbose
```

Expected: all focused tests pass.

### Task 5: Verification, Commit, Push

- [ ] **Step 1: Full verification**

Run:

```powershell
cmd /c "pnpm.cmd build && pnpm.cmd lint && pnpm.cmd typecheck && pnpm.cmd test"
git diff --check
```

Expected: exit 0 for both commands.

- [ ] **Step 2: Stage only D133 files**

Use explicit `git add` paths. Do not stage:

```text
docs/superpowers/gate-1-current-workspace-result.json
docs/superpowers/gate-1-current-workspace-result.md
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "feat(D-133): close Remote TUI Tier-2 evidence"
git push -u origin feature/d36-gate2-live
```

Expected: branch pushes successfully.

## Plan Self-Review

- Spec coverage: authentication, remote input, resize, local output, close behavior, precheck, docs, verification, commit, and push are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: check ids use `tier2-remote-tui` consistently.
- Scope check: no default exposure, WebSocket server, browser UI, TLS, reconnect, Desktop, Channel, media, or productivity work is included.
