# D133 V2 Tier-2 Remote TUI Closure Design

## Context

D132 leaves v2.0 with one Tier-2 blocker: Remote TUI. The roadmap describes Remote TUI as WebSocket
remote control, but the current codebase has no remote TUI runtime module. Closing the row by
pointing at TUI modules, RPC mode, or roadmap text would violate the gate rule against counting module
existence as production integration.

## Decision

D133 closes only the Remote TUI Tier-2 row by adding a minimal remote TUI session protocol boundary.
The proof covers the core behavior a WebSocket or app-server adapter would need:

- authenticated `hello` handshake with a shared token,
- rejected unauthorized clients before any local input is accepted,
- remote text input forwarded to an injected local TUI input handler,
- resize events forwarded to an injected local resize handler,
- local TUI output frames sent to the remote transport with monotonic sequence numbers,
- explicit close semantics sent to the remote transport,
- no default registry expansion.

The transport is injected instead of binding to a real socket. This keeps the proof deterministic and
dependency-free while making the caveat explicit: D133 proves the Remote TUI core protocol/session
bridge, not a complete WebSocket server, browser UI, TLS/auth stack, reconnect layer, or hosted
app-server.

## Evidence Boundary

Remote TUI may pass only when the source and tests prove bidirectional remote/local session behavior.
Existing TUI rendering, RPC mode, or generic WebSocket/channel code remains insufficient by itself.

The D133 evidence set is:

- `packages/coding-agent/src/remote-tui/session.ts`: authenticated remote TUI session protocol bridge.
- `packages/coding-agent/src/remote-tui/index.ts`: package-local export boundary.
- `packages/coding-agent/test/unit/remote-tui-session.test.ts`: handshake, unauthorized rejection,
  input forwarding, resize forwarding, output sequencing, and close behavior coverage.

## Non-Goals

- No default registry expansion.
- No WebSocket listener, HTTP server, browser UI, TLS, reconnect, multiplexing, or persistence.
- No changes to the Ink TUI rendering tree.
- No claim that v1-v4 are production-complete.
- No Browser, Desktop, Channel, media, or productivity default exposure.

## Documentation

Update the v2.0 precheck and public status docs to D133:

- `tier2-remote-tui` becomes pass with an explicit caveat: authenticated injected-transport protocol
  proof, not a full WebSocket/app-server implementation.
- the v2.0 precheck has no remaining blockers and passes at the evidence layer.
- v1-v4 remains incomplete because v3.0 Gate-2 production breadth and v4.0 Agent OS/Desktop/channel/
  cross-platform evidence remain separate blockers.
- next action moves to v3.0/v4.0 gate evidence rather than v2.0 Tier-2.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Scope check: one protocol/session bridge plus evidence docs; no network server or UI rewrite.
- Overclaiming check: the caveat names what is not complete.
- Default exposure check: D133 creates no tools and changes no registry profile.
