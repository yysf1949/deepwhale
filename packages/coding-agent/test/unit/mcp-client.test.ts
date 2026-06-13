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
