/**
 * @deepwhale/tui-ink — CallGraph 组件 (D-32.2.3, 2026-06-08).
 *
 * Render call graph edges. Pure component, no side effects.
 * 业务逻辑 0 重写: 不调 buildCallGraph, 只接收 edges 数组.
 *
 * Props:
 *   edges: ReadonlyArray<CallEdgeLike>
 *   symbol?: string  (center symbol for `for-symbol` view)
 *   maxDepth?: number  (default 2)
 *
 * 渲染: 头部 `Call graph (N edges)` + 每 edge `caller → callee @ line` 颜色按
 *   kind 区分 (function=cyan, method=yellow, class=green).
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface CallEdgeLike {
  caller: string; // `file:symbol`
  callee: string; // `file:symbol`
  line: number;
  file: string;
}

export interface CallGraphProps {
  edges: ReadonlyArray<CallEdgeLike>;
  symbol?: string;
  maxDepth?: number; // currently unused, reserved for future BFS-limited render
}

const DEFAULT_MAX_DEPTH = 2;
void DEFAULT_MAX_DEPTH; // reserved

export const CallGraph: FC<CallGraphProps> = ({
  edges,
  symbol,
  // maxDepth reserved for future BFS-limited render
}) => {
  const filtered = symbol
    ? edges.filter((e) => e.caller.includes(symbol) || e.callee.includes(symbol))
    : edges;
  const limited = filtered.slice(0, 100); // hard cap to avoid huge renders
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>
        <Text bold color="cyan">Call graph ({filtered.length}{filtered.length > limited.length ? `, showing ${limited.length}` : ''})</Text>
        {symbol && <Text dimColor>{`  centered on '${symbol}'`}</Text>}
      </Text>
      {limited.length === 0 && <Text dimColor>(no edges)</Text>}
      {limited.map((e, i) => (
        <Box key={`${e.caller}-${e.callee}-${i}`} marginTop={i === 0 ? 0 : 1}>
          <Text>
            <Text color="green">{shortId(e.caller)}</Text>
            <Text> → </Text>
            <Text color="cyan">{shortId(e.callee)}</Text>
            <Text dimColor>{`  ${e.file}:${e.line}`}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
};

function shortId(id: string): string {
  // strip file prefix and leading scope, keep just symbol name
  const parts = id.split(':');
  const last = parts[parts.length - 1] ?? id;
  const dot = last.lastIndexOf('.');
  return dot >= 0 ? last.slice(dot + 1) : last;
}
