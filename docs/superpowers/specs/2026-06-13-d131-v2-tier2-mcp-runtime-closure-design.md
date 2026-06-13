# D131 V2 Tier-2 MCP Runtime Closure Design

## Context

D130 split v2.0 Tier-2 into Automation, Remote TUI, Compaction, and MCP Runtime. Compaction now has
implementation and test evidence, while Automation, Remote TUI, and MCP Runtime remain blocked. The
repository already has a thin MCP server at `packages/mcp-servers/gh-search/bin/gh-search-mcp.mjs`
and a server-side stdio JSON-RPC roundtrip test, but the coding-agent side only registers static MCP
manifests as opt-in capabilities.

## Decision

D131 closes only the MCP Runtime Tier-2 row by adding a minimal coding-agent stdio JSON-RPC client
proof. The proof covers one configured server process and the core MCP tool path:

- start a stdio child process,
- send `initialize`,
- send `tools/list`,
- register listed tools through the existing opt-in capability registry,
- send `tools/call`,
- stop the process cleanly.

The v2.0 precheck remains failed because Automation and Remote TUI still block release readiness.
Default registry exposure must remain unchanged.

## Evidence Boundary

MCP Runtime may pass only from a client transport plus server roundtrip evidence. Static manifest
registration by itself remains insufficient.

The D131 evidence set is:

- `packages/coding-agent/src/mcp/client.ts`: stdio JSON-RPC transport client.
- `packages/coding-agent/src/mcp/runtime.ts`: existing opt-in capability registration path.
- `packages/coding-agent/test/unit/mcp-client.test.ts`: client roundtrip against the real
  `gh-search-mcp.mjs` server with a stub `gh` executable, including default-profile isolation.
- `packages/coding-agent/test/unit/mcp-runtime.test.ts`: manifest registration remains opt-in.
- `packages/mcp-servers/gh-search/bin/gh-search-mcp.mjs`: existing server implementation.
- `packages/mcp-servers/gh-search/test/server.test.mjs`: existing server-side stdio proof.

## Non-Goals

- No default registry expansion.
- No dynamic MCP config loader.
- No multi-server orchestration.
- No reconnect, auth, HTTP/SSE transport, resources, prompts, sampling, or subscriptions.
- No claim that v2.0 is release-ready.
- No changes to Automation or Remote TUI status.

## Documentation

Update the v2.0 precheck and public status docs to D131:

- `tier2-mcp-runtime` becomes pass with an explicit caveat: one-server stdio transport proof, not a
  full multiplexed MCP runtime.
- blockers shrink to Automation and Remote TUI.
- next action becomes D132: close another remaining v2.0 Tier-2 blocker without expanding default
  exposure.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Scope check: one transport proof plus evidence docs; no production MCP orchestration.
- Overclaiming check: the caveat names what is not complete.
- Default exposure check: D131 relies on the capability registry's `mcp` profile only.
