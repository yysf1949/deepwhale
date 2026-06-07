/**
 * @deepwhale/tui-ink — CronList 组件 (D-30.5.4, 2026-06-08).
 *
 * 渲染 cron 任务列表, ●/○ 标记每个 job 是否启用.
 * 业务逻辑 0 重写: 数据由 coding-agent CronStore 喂.
 *
 * 渲染规则:
 *   - 头部 "Cron jobs"
 *   - 空列表 → (no jobs)
 *   - 每行: enabled=true → 绿色 ●, enabled=false → 灰色 ○
 *   - schedule (cron 表达式) 左对齐, prompt 跟右边
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface CronJob {
  id: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
}

export interface CronListProps {
  jobs: ReadonlyArray<CronJob>;
  onToggle: (id: string) => void;
}

export const CronList: FC<CronListProps> = ({ jobs }) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold color="cyan">Cron jobs</Text>
    {jobs.length === 0 && <Text dimColor>(no jobs)</Text>}
    {jobs.map((j) => (
      <Text key={j.id}>
        {j.enabled ? <Text color="green">● </Text> : <Text color="gray">○ </Text>}
        <Text bold>{j.schedule.padEnd(12)}</Text> {j.prompt}
      </Text>
    ))}
  </Box>
);