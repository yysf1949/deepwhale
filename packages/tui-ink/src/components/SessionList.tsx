/**
 * @deepwhale/tui-ink — SessionList 组件 (D-30.5.5, 2026-06-08).
 *
 * 渲染 session 历史列表, 1 行 = 1 session.
 * 业务逻辑 0 重写: 数据由 coding-agent SessionIndex 喂.
 *
 * 渲染规则:
 *   - 头部 "Sessions"
 *   - 空列表 → (no sessions)
 *   - 每行: id(前 8 位, yellow) + 首条 user(前 40 字) + (N msg)
 *   - onLoad(id) 回调 (UI 不直接触发, 由父组件接 input)
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface SessionRow {
  id: string;
  firstUser: string;
  messageCount: number;
  createdAt: number;
}

export interface SessionListProps {
  sessions: ReadonlyArray<SessionRow>;
  onLoad: (id: string) => void;
}

export const SessionList: FC<SessionListProps> = ({ sessions }) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold color="cyan">Sessions</Text>
    {sessions.length === 0 && <Text dimColor>(no sessions)</Text>}
    {sessions.map((s) => (
      <Text key={s.id}>
        <Text color="yellow">{s.id.slice(0, 8)}</Text>
        {' '}<Text>{s.firstUser.slice(0, 40)}</Text>
        {' '}<Text dimColor>({s.messageCount} msg)</Text>
      </Text>
    ))}
  </Box>
);