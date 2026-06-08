#!/usr/bin/env node
/**
 * @deepwhale/mcp-gh-search — MCP server (D-32.3.3, 2026-06-08).
 *
 * 提供 1 tool: gh_search_code (wraps `gh search code`).
 * JSON-RPC 2.0 over stdio, 跟 native MCP client 协议 1:1.
 *
 * 启: `npx @deepwhale/mcp-gh-search`  (stdio mode)
 * 注 config.yaml: mcp.servers.gh-search = { command: "npx", args: ["-y", "@deepwhale/mcp-gh-search"] }
 *
 * 拍板: 不 抽 tool 跟 MCP server 复用 (smart-search 跟 gh-search MCP 各 自 走). MCP
 *   server 保持 thin, 只 暴露 `gh_search_code` tool, 1 action (query + limit).
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (read-only 远端).
 */

import { createInterface } from 'node:readline';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const TOOLS = [
  {
    name: 'gh_search_code',
    description: 'Search public code on GitHub via gh CLI (gh search code). Read-only, no auth required for public repos.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'search query' },
        limit: { type: 'number', description: 'max results (default 10, max 30)' },
      },
      required: ['query'],
    },
  },
];

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (typeof id === 'undefined') return; // notification, ignore
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'gh-search', version: '1.0.0' },
        };
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const { name, arguments: args } = params ?? {};
        if (name !== 'gh_search_code') {
          throw new Error(`unknown tool: ${String(name)}`);
        }
        const query = args?.query;
        const limit = Math.min(args?.limit ?? 10, 30);
        if (typeof query !== 'string' || query.length === 0) {
          throw new Error('invalid-input: query required');
        }
        const { stdout } = await execFile('gh', [
          'search', 'code', query,
          '--limit', String(limit),
          '--json', 'path,repository,textMatches',
        ], { timeout: 15_000 });
        const items = JSON.parse(stdout);
        const formatted = items.map((it) => {
          const m = it.textMatches?.[0]?.matches?.[0];
          return `${it.repository.nameWithOwner}/${it.path}:${m?.line ?? 1}:${m?.col ?? 1}  ${it.textMatches?.[0]?.fragment?.slice(0, 100) ?? ''}`;
        }).join('\n');
        result = {
          content: [{ type: 'text', text: formatted || '(no results)' }],
        };
        break;
      }
      default:
        throw new Error(`unknown method: ${String(method)}`);
    }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id,
      error: { code: -32000, message: e instanceof Error ? e.message : String(e) },
    }) + '\n');
  }
});
