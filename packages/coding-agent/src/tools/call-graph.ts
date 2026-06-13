/**
 * call_graph 工具 — 1 action (D-32.2.3, 2026-06-08).
 *
 * 拍板: 走 @deepwhale/code-intel buildCallGraph. 3 sub-action:
 *   for-symbol — 查 symbol 入站 + 出站 call edges
 *   for-file   — 查 file 内 all call edges
 *   for-repo   — 查 repo 全 call graph summary
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: low (只读 walk).
 */

import { resolve } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import { buildSymbolGraph, buildCallGraph, type CallGraph } from '@deepwhale/code-intel';
import type { ToolCapability } from '../governance/tool-capabilities.js';

interface TraversalNode {
  id: string;
  depth: number;
  file: string;
  name: string;
  via?: string;
}

export class CallGraphTool implements Tool {
  readonly name = 'call_graph' as ToolName;
  readonly description = 'Build a heuristic call graph for a repo using AST symbols plus textual call matches; no type analysis or dynamic dispatch resolution. 3 sub-actions: for-symbol / for-file / for-repo. Low risk (read-only walk).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = ['file-read'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'call_graph action', enum: ['for-symbol', 'for-file', 'for-repo'] },
      path: { type: 'string', description: 'repo root path (default: current working directory)' },
      symbol: { type: 'string', description: 'symbol name (required for for-symbol action)' },
      file: { type: 'string', description: 'file path relative to repo (required for for-file action)' },
      depth: { type: 'number', description: 'BFS depth (default: 2, max: 4)' },
    },
    required: ['action'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const repoPath = typeof input['path'] === 'string' ? resolve(input['path']) : process.cwd();
    const depth = parseTraversalDepth(input['depth']);
    try {
      const graph = await buildSymbolGraph(repoPath);
      const callGraph = await buildCallGraph(graph);
      switch (action) {
        case 'for-symbol': {
          const sym = input['symbol'];
          if (typeof sym !== 'string' || sym.length === 0) {
            return { success: false, content: '', error: 'invalid-input: symbol required for for-symbol action' };
          }
          // Find all caller IDs and callee IDs for this symbol
          const matchingIds = new Set<string>();
          for (const [filePath, fileSym] of graph.files) {
            for (const s of fileSym.symbols) {
              if (s.name === sym) {
                matchingIds.add(`${filePath}:${s.scope ? s.scope + '.' : ''}${s.name}`);
              }
            }
          }
          const outgoing = traverseCallGraph(callGraph, matchingIds, 'outgoing', depth);
          const incoming = traverseCallGraph(callGraph, matchingIds, 'incoming', depth);
          const content = [
            `Symbol: ${sym}`,
            `Matched declarations: ${[...matchingIds].sort().join('\n  ') || '(none)'}`,
            `Heuristic calls (outgoing, depth=${depth}): ${formatTraversal(outgoing)}`,
            `Heuristic called by (incoming, depth=${depth}): ${formatTraversal(incoming)}`,
          ].join('\n');
          return {
            success: true,
            content,
            meta: {
              action,
              symbol: sym,
              rootIds: [...matchingIds].sort(),
              traversalDepth: depth,
              outgoingCount: outgoing.length,
              incomingCount: incoming.length,
              outgoing,
              incoming,
              heuristic: true,
            },
          };
        }
        case 'for-file': {
          const file = input['file'];
          if (typeof file !== 'string' || file.length === 0) {
            return { success: false, content: '', error: 'invalid-input: file required for for-file action' };
          }
          const fileEdges = callGraph.edges.filter((e) => e.file === file);
          const content = fileEdges.length === 0
            ? '(no calls in this file)'
            : fileEdges.map((e) => `  ${e.caller} → ${e.callee} @ line ${e.line}`).join('\n');
          return {
            success: true,
            content,
            meta: { action, file, edgeCount: fileEdges.length, heuristic: true },
          };
        }
        case 'for-repo': {
          // Summarize: top 20 symbols by in+out degree
          const degree = new Map<string, { in: number; out: number; file: string; name: string }>();
          for (const e of callGraph.edges) {
            const callerFile = e.caller.split(':')[0] ?? '';
            const callerName = e.caller.split(':').slice(1).join(':') || e.caller;
            const calleeFile = e.callee.split(':')[0] ?? '';
            const calleeName = e.callee.split(':').slice(1).join(':') || e.callee;
            for (const [id, name, file] of [[e.caller, callerName, callerFile], [e.callee, calleeName, calleeFile]] as const) {
              const d = degree.get(id) ?? { in: 0, out: 0, file, name };
              if (id === e.caller) d.out += 1;
              if (id === e.callee) d.in += 1;
              degree.set(id, d);
            }
          }
          const top = [...degree.entries()]
            .map(([id, d]) => ({ id, ...d, total: d.in + d.out }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 20);
          const content = [
            `Total edges: ${callGraph.edges.length}`,
            `Top 20 by degree (in + out):`,
            ...top.map((t) => `  ${String(t.total).padStart(3)} (in=${t.in}, out=${t.out})  ${t.name}  [${t.file}]`),
          ].join('\n');
          return {
            success: true,
            content,
            meta: { action, edgeCount: callGraph.edges.length, heuristic: true },
          };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `call_graph error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

function parseTraversalDepth(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 2;
  return Math.min(4, Math.max(1, Math.trunc(raw)));
}

function traverseCallGraph(
  callGraph: CallGraph,
  roots: ReadonlySet<string>,
  direction: 'outgoing' | 'incoming',
  maxDepth: number,
): TraversalNode[] {
  const index = direction === 'outgoing' ? callGraph.byCaller : callGraph.byCallee;
  const nodes: TraversalNode[] = [];
  const visited = new Set(roots);
  const queue = [...roots].map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const edge of index.get(current.id) ?? []) {
      const nextId = direction === 'outgoing' ? edge.callee : edge.caller;
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      const nextDepth = current.depth + 1;
      const node: TraversalNode = {
        id: nextId,
        depth: nextDepth,
        file: symbolIdFile(nextId),
        name: symbolIdName(nextId),
        via: current.id,
      };
      nodes.push(node);
      queue.push({ id: nextId, depth: nextDepth });
    }
  }

  return nodes.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

function formatTraversal(nodes: ReadonlyArray<TraversalNode>): string {
  if (nodes.length === 0) return '(none)';
  return nodes.map((node) => `d${node.depth} ${node.id}${node.via ? ` via ${node.via}` : ''}`).join('\n  ');
}

function symbolIdFile(id: string): string {
  return id.split(':')[0] ?? '';
}

function symbolIdName(id: string): string {
  const afterFile = id.split(':').slice(1).join(':');
  return afterFile.split('.').pop() ?? afterFile;
}

export const callGraphTool = new CallGraphTool();
