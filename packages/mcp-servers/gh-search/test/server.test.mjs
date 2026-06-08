// Test gh-search MCP server with mocked stdio. Spawns the server as a child
// process, sends JSON-RPC over stdin, validates JSON-RPC over stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(__dirname, '../bin/gh-search-mcp.mjs');

function spawnAndQuery(req) {
  return new Promise((resolveP) => {
    const child = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    child.stdout.on('data', (d) => out.push(d.toString()));
    child.stdin.write(JSON.stringify(req) + '\n');
    setTimeout(() => {
      child.kill();
      const text = out.join('');
      try {
        resolveP(JSON.parse(text));
      } catch (e) {
        resolveP({ _parseError: e.message, _raw: text });
      }
    }, 200);
  });
}

test('gh-search MCP server: initialize returns protocolVersion', async () => {
  const response = await spawnAndQuery({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.ok(response.result.protocolVersion);
  assert.equal(response.result.serverInfo.name, 'gh-search');
});

test('gh-search MCP server: tools/list returns gh_search_code', async () => {
  const response = await spawnAndQuery({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.equal(response.id, 2);
  const tools = response.result.tools;
  assert.ok(Array.isArray(tools));
  assert.ok(tools.some((t) => t.name === 'gh_search_code'));
});

test('gh-search MCP server: tools/call with missing query returns error', async () => {
  const response = await spawnAndQuery({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'gh_search_code', arguments: {} },
  });
  assert.equal(response.id, 3);
  assert.ok(response.error);
  assert.match(response.error.message, /invalid-input|query/i);
});

test('gh-search MCP server: tools/call with unknown tool returns error', async () => {
  const response = await spawnAndQuery({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nonexistent', arguments: {} },
  });
  assert.equal(response.id, 4);
  assert.ok(response.error);
  assert.match(response.error.message, /unknown tool/);
});
