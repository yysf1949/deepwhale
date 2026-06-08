/**
 * @deepwhale/tui-ink — SearchBar 组件 (D-32.3.2, 2026-06-08).
 *
 * Combined input + results list. Pure component, no side effects.
 * 业务逻辑 0 重写: 不调 smart_search, 只接收 results 数组. ink TextInput 在
 *   父 组件 用 useInput hook 处理 (留 typed prompt).
 *
 * Props:
 *   query: current query string
 *   results: ReadonlyArray<SearchResultLike>
 *   selectedIndex?: number (0-based, default 0)
 *   isLoading?: boolean
 *   maxHeight?: number (default 10 rows)
 *
 * 渲染: 顶部 prompt `? ` + 状态 (loading / N results / empty) + 选 中 行 高亮.
 */

import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { FC } from 'react';

export interface SearchResultLike {
  file: string;
  line: number;
  col: number;
  snippet: string;
  score?: number;
  source?: 'local' | 'remote';
}

export interface SearchBarProps {
  query: string;
  results: ReadonlyArray<SearchResultLike>;
  selectedIndex?: number;
  isLoading?: boolean;
  maxHeight?: number;
  onQueryChange?: (q: string) => void;
  onSubmit?: (q: string) => void;
}

const DEFAULT_MAX_HEIGHT = 10;
const DEFAULT_QUERY = '';

export const SearchBar: FC<SearchBarProps> = ({
  query,
  results,
  selectedIndex = 0,
  isLoading = false,
  maxHeight = DEFAULT_MAX_HEIGHT,
  onQueryChange,
  onSubmit,
}) => {
  const visible = results.slice(0, maxHeight);
  const status = isLoading
    ? 'loading...'
    : results.length === 0
      ? query === DEFAULT_QUERY
        ? 'enter a query'
        : '(no results)'
      : `${results.length} result${results.length === 1 ? '' : 's'}`;
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text color="cyan">? </Text>
        <TextInput
          value={query}
          onChange={onQueryChange ?? (() => {})}
          onSubmit={onSubmit}
          placeholder="search query (symbol name or free text)..."
        />
      </Box>
      <Text dimColor>{status}</Text>
      {visible.map((r, i) => {
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? '▶ ' : '  ';
        const source = r.source === 'remote' ? 'R' : 'L';
        const scoreStr = r.score !== undefined ? ` score=${String(r.score).padStart(3)}` : '';
        return (
          <Box key={`${r.file}-${r.line}-${i}`}>
            <Text inverse={isSelected}>
              {prefix}[{source}]{scoreStr}  {r.file}:{r.line}:{r.col}
            </Text>
            <Text dimColor>{`  ${r.snippet.slice(0, 60)}`}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
