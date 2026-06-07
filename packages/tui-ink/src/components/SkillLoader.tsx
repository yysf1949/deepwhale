/**
 * @deepwhale/tui-ink — SkillLoader 组件 (D-30.5.3, 2026-06-08).
 *
 * 渲染 skill 列表, ✓/○ 标记每个 skill 是否已加载.
 * 业务逻辑 0 重写: 数据由 coding-agent SkillStore 喂.
 *
 * 渲染规则:
 *   - 头部 "Skills"
 *   - 每行: loaded=true → 绿色 ✓, loaded=false → 灰色 ○
 *   - onToggle(name) 回调 (UI 不直接触发, 由父组件接 input)
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface SkillItem {
  name: string;
  loaded: boolean;
}

export interface SkillLoaderProps {
  skills: ReadonlyArray<SkillItem>;
  onToggle: (name: string) => void;
}

export const SkillLoader: FC<SkillLoaderProps> = ({ skills }) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold color="cyan">Skills</Text>
    {skills.length === 0 && <Text dimColor>(no skills loaded)</Text>}
    {skills.map((s) => (
      <Text key={s.name}>
        {s.loaded ? <Text color="green">✓ </Text> : <Text color="gray">○ </Text>}
        {s.name}
      </Text>
    ))}
  </Box>
);