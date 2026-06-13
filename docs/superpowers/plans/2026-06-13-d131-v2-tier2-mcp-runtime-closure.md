# D131 V2 Tier-2 MCP Runtime Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the MCP Runtime item within v2.0 Tier-2 release evidence while keeping v2.0 blocked on Automation and Remote TUI.

**Architecture:** Add a small stdio JSON-RPC client for one configured MCP server and use it to prove `initialize`, `tools/list`, and `tools/call` against the existing gh-search MCP server. Feed the client source, tests, and server evidence into the existing v2.0 precheck without changing default registry exposure.

**Tech Stack:** TypeScript, Node child_process/readline, Vitest, Markdown/JSON evidence files, pnpm monorepo verification.

---

## File Structure

- Create `packages/coding-agent/src/mcp/client.ts`: minimal stdio JSON-RPC MCP client.
- Create `packages/coding-agent/test/unit/mcp-client.test.ts`: RED/GREEN client proof against the existing gh-search MCP server with a stub `gh` executable.
- Modify `packages/mcp-servers/gh-search/bin/gh-search-mcp.mjs`: support a test/config command override for the `gh` executable while keeping `gh` as the default.
- Modify `packages/coding-agent/src/release/v2-tier1-precheck.ts`: advance to D131, add MCP Runtime evidence refs, remove MCP Runtime from blocked checks, update caveat/summary/next actions.
- Modify `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts`: expect D131 with MCP Runtime pass and two remaining blockers.
- Modify `packages/coding-agent/test/unit/status-doc-hygiene.test.ts`: require D131 public status and D132 next-work pointers.
- Modify `docs/superpowers/v2-tier1-precheck.json`: D131 machine-readable evidence.
- Modify `docs/superpowers/v2-tier1-precheck.md`: D131 human-readable evidence.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.json`: progress and blocker update.
- Modify `docs/superpowers/v1-v4-evidence-scorecard.md`: scorecard mirror.
- Modify `README.md`, `ROADMAP.md`, `docs/ROADMAP_DECISIONS.md`: current status blocks.
- Create `docs/superpowers/specs/2026-06-13-d131-v2-tier2-mcp-runtime-closure-design.md`: design record.
- Create `docs/superpowers/plans/2026-06-13-d131-v2-tier2-mcp-runtime-closure.md`: this plan.

### Task 1: RED Test For MCP Stdio Client

- [ ] **Step 1: Write the failing client test**

Create `packages/coding-agent/test/unit/mcp-client.test.ts` with tests that import the not-yet-existing client API:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { connectMcpStdioServer } from '../../src/mcp/client.js';
import { registerMcpManifest } from '../../src/mcp/runtime.js';
import { createCapabilityRegistry } from '../../src/runtime/capability-registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const serverPath = resolve(repoRoot, 'packages/mcp-servers/gh-search/bin/gh-search-mcp.mjs');

function writeGhShim(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'deepwhale-mcp-'));
  const shim = resolve(dir, 'gh-shim.mjs');
  writeFileSync(
    shim,
    [
      'const result = [{',
      '  repository: { nameWithOwner: "deepwhale/test" },',
      '  path: "src/index.ts",',
      '  textMatches: [{',
      '    fragment: "export const whale = true",',
      '    matches: [{ line: 1, col: 8 }],',
      '  }],',
      '}];',
      'console.log(JSON.stringify(result));',
      '',
    ].join('\n'),
  );
  return shim;
}

describe('mcp stdio client (D131)', () => {
  let clients: Array<{ stop: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.stop()));
    clients = [];
  });

  it('roundtrips initialize, tools/list, and tools/call against gh-search MCP server', async () => {
    const ghShim = writeGhShim();
    const client = await connectMcpStdioServer({
      server: 'gh-search',
      command: process.execPath,
      args: [serverPath],
      env: {
        DEEPWHALE_GH_COMMAND: process.execPath,
        DEEPWHALE_GH_ARGS_JSON: JSON.stringify([ghShim]),
      },
      timeoutMs: 2_000,
    });
    clients.push(client);

    expect(client.initializeResult.serverInfo.name).toBe('gh-search');
    const manifest = await client.listToolsManifest();
    expect(manifest.server).toBe('gh-search');
    expect(manifest.tools.map((tool) => tool.name)).toContain('gh_search_code');

    const result = await client.callTool('gh_search_code', { query: 'whale', limit: 1 });

    expect(JSON.stringify(result)).toContain('deepwhale/test/src/index.ts');
  });

  it('keeps discovered MCP capabilities hidden from the default profile', async () => {
    const ghShim = writeGhShim();
    const client = await connectMcpStdioServer({
      server: 'gh-search',
      command: process.execPath,
      args: [serverPath],
      env: {
        DEEPWHALE_GH_COMMAND: process.execPath,
        DEEPWHALE_GH_ARGS_JSON: JSON.stringify([ghShim]),
      },
      timeoutMs: 2_000,
    });
    clients.push(client);

    const registry = createCapabilityRegistry();
    registerMcpManifest(registry, await client.listToolsManifest());

    expect(registry.list({ profiles: ['default'] })).toEqual([]);
    expect(registry.list({ profiles: ['mcp'] }).map((capability) => capability.id)).toEqual([
      'mcp.gh-search.gh_search_code',
    ]);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/mcp-client.test.ts --reporter=verbose
```

Expected: fail because `../../src/mcp/client.js` does not exist.

### Task 2: Implement Minimal MCP Client

- [ ] **Step 1: Create the client module**

Create `packages/coding-agent/src/mcp/client.ts` with:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type { McpServerManifest, McpToolManifest } from './runtime.js';

export interface McpStdioServerConfig {
  server: string;
  command: string;
  args?: ReadonlyArray<string>;
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version?: string };
  capabilities?: Record<string, unknown>;
}

export interface McpStdioClient {
  initializeResult: McpInitializeResult;
  listToolsManifest(): Promise<McpServerManifest>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  stop(): Promise<void>;
}
```

Implement a small class that sends newline-delimited JSON-RPC requests, waits for matching response ids, rejects JSON-RPC errors, times out pending calls, and kills the child on `stop()`.

- [ ] **Step 2: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/mcp-client.test.ts --reporter=verbose
```

Expected: 2 tests pass.

### Task 3: Update D131 Precheck

- [ ] **Step 1: Update failing precheck expectations**

Change `packages/coding-agent/test/unit/v2-tier1-precheck.test.ts` so it expects:

```ts
expect(result.slice).toBe('D131');
expect(statusOf(result, 'tier2-mcp-runtime')).toBe('pass');
expect(result.blockers).toEqual([
  'Tier-2 Automation remains blocked',
  'Tier-2 Remote TUI remains blocked',
]);
expect(result.nextActions[0]).toContain('D132');
```

Update the evidence snapshot test to expect the same row/status/blockers.

- [ ] **Step 2: Run RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: fail because implementation still reports D130 and `tier2-mcp-runtime` blocked.

- [ ] **Step 3: Implement D131 precheck**

In `packages/coding-agent/src/release/v2-tier1-precheck.ts`:

- change result slice type and return value to `D131`;
- add evidence refs for `packages/coding-agent/src/mcp/client.ts`, `packages/coding-agent/src/mcp/runtime.ts`, `packages/coding-agent/test/unit/mcp-client.test.ts`, `packages/coding-agent/test/unit/mcp-runtime.test.ts`, `packages/mcp-servers/gh-search/bin/gh-search-mcp.mjs`, and `packages/mcp-servers/gh-search/test/server.test.mjs`;
- remove `tier2-mcp-runtime` from `BLOCKED_CHECKS`;
- update the MCP caveat to one-server stdio transport proof only;
- update summary and next actions to D132.

- [ ] **Step 4: Run GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/v2-tier1-precheck.test.ts --reporter=verbose
```

Expected: 4 tests pass.

### Task 4: Update Evidence Docs And Status Hygiene

- [ ] **Step 1: Update evidence docs**

Update `docs/superpowers/v2-tier1-precheck.json` to D131 with eight pass rows and two blocked rows. `blockers` must be exactly:

```json
[
  "Tier-2 Automation remains blocked",
  "Tier-2 Remote TUI remains blocked"
]
```

Update `docs/superpowers/v2-tier1-precheck.md` to mirror the JSON.

- [ ] **Step 2: Update scorecard and public docs**

Update `docs/superpowers/v1-v4-evidence-scorecard.{json,md}`, `README.md`, `ROADMAP.md`, and `docs/ROADMAP_DECISIONS.md` with:

```text
Current sprint: D131 v2.0 Tier-2 MCP Runtime closure
D131 v2.0 Tier-2 MCP Runtime closure: MCP Runtime now has a one-server stdio transport proof...
Next implementation slice: D132 close another remaining v2.0 Tier-2 blocker without expanding default exposure.
```

Automation and Remote TUI must remain blocked.

- [ ] **Step 3: Update status hygiene test**

Change `packages/coding-agent/test/unit/status-doc-hygiene.test.ts` expectations from D130/D131 to D131/D132 and add negative checks for stale `Current sprint: D130` and `Next implementation slice: D131`.

- [ ] **Step 4: Run docs-focused GREEN**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run packages/coding-agent/test/unit/mcp-client.test.ts packages/coding-agent/test/unit/mcp-runtime.test.ts packages/coding-agent/test/unit/v2-tier1-precheck.test.ts packages/coding-agent/test/unit/status-doc-hygiene.test.ts packages/coding-agent/test/unit/default-registry-invariant.test.ts --reporter=verbose
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

- [ ] **Step 2: Stage only D131 files**

Use explicit `git add` paths. Do not stage:

```text
docs/superpowers/gate-1-current-workspace-result.json
docs/superpowers/gate-1-current-workspace-result.md
```

- [ ] **Step 3: Commit and push**

Run:

```powershell
git commit -m "feat(D-131): close MCP Runtime Tier-2 evidence"
git push -u origin feature/d36-gate2-live
```

Expected: branch pushes successfully.

## Plan Self-Review

- Spec coverage: transport proof, opt-in capability isolation, precheck, docs, verification, commit, and push are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: check ids use `tier2-mcp-runtime` consistently.
- Scope check: no Automation, Remote TUI, default exposure, auth, reconnect, HTTP/SSE, or multi-server work is included.
