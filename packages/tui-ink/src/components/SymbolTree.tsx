/**
 * @deepwhale/tui-ink — SymbolTree 组件 (D-32.1.5, 2026-06-08).
 *
 * 渲染 symbols 数组 (file → class → method 层级). 业务逻辑 0 重写:
 *   不调 extractSymbols, 只接收 symbols 数组. 跟 WebResultView /
 *   ProfileSwitcher 同 pattern (round border + 颜色).
 *
 * Props:
 *   symbols: ReadonlyArray<Symbol>
 *   maxDepth?: number  (default 4)
 *
 * 输出:
 *   - 头部 "Symbols ({N})" + per-kind count
 *   - 树: scope.path + .name, kind 标色
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'import'
  | 'export'
  | 'type';

export interface Symbol {
  name: string;
  kind: SymbolKind;
  line: number;
  col: number;
  scope?: string;
  file?: string;
}

export interface SymbolTreeProps {
  symbols: ReadonlyArray<Symbol>;
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 4;

const KIND_COLOR: Record<SymbolKind, string> = {
  function: 'cyan',
  class: 'green',
  method: 'yellow',
  variable: 'gray',
  import: 'magenta',
  export: 'blue',
  type: 'white',
};

export const SymbolTree: FC<SymbolTreeProps> = ({
  symbols,
  maxDepth = DEFAULT_MAX_DEPTH,
}) => {
  const counts = countByKind(symbols);
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>
        <Text bold color="cyan">Symbols ({symbols.length})</Text>
        {counts.length > 0 && <Text dimColor>{'  ' + counts.join('  ')}</Text>}
      </Text>
      {symbols.length === 0 && <Text dimColor>(no symbols)</Text>}
      {symbols.map((s, i) => (
        <Box key={`${s.kind}-${s.name}-${i}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
          {renderSymbol(s, maxDepth)}
        </Box>
      ))}
    </Box>
  );
};

function renderSymbol(s: Symbol, _maxDepth: number): React.ReactNode {
  const color = KIND_COLOR[s.kind] ?? 'white';
  const scopePath = s.scope ? `${s.scope}.` : '';
  return (
    <Text>
      <Text color={color}>{s.kind.padEnd(8)}</Text>
      <Text>{scopePath}</Text>
      <Text bold>{s.name}</Text>
      <Text dimColor>{`  ${s.line}:${s.col}`}</Text>
    </Text>
  );
}

function countByKind(symbols: ReadonlyArray<Symbol>): string[] {
  const counts = new Map<SymbolKind, number>();
  for (const s of symbols) {
    counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`);
}
