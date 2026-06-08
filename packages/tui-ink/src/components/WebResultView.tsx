/**
 * @deepwhale/tui-ink — WebResultView 组件 (D-31.4.5, 2026-06-08).
 *
 * 渲染 web_search / web_extract 返结果列表 (title + url + snippet).
 * 业务逻辑 0 重写: 不调 web tool, 只接收 results 数组.
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebResultViewProps {
  results: ReadonlyArray<WebResult>;
  maxSnippetChars?: number;
}

const DEFAULT_MAX_SNIPPET = 200;

export const WebResultView: FC<WebResultViewProps> = ({
  results,
  maxSnippetChars = DEFAULT_MAX_SNIPPET,
}) => {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color="cyan">Web results</Text>
      {results.length === 0 && <Text dimColor>(no results)</Text>}
      {results.map((r, i) => (
        <Box key={r.url} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
          <Text>
            <Text color="green">{i + 1}. {r.title}</Text>
          </Text>
          <Text dimColor>   {r.url}</Text>
          <Text>   {r.snippet.length > maxSnippetChars ? r.snippet.slice(0, maxSnippetChars) + '…' : r.snippet}</Text>
        </Box>
      ))}
    </Box>
  );
};
