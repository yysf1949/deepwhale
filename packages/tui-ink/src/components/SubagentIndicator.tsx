/**
 * @deepwhale/tui-ink — SubagentIndicator 组件 (D-31.1.8, 2026-06-08).
 *
 * 显示 kanban board 跑中的 subagent (status: queued/todo / running/in_progress /
 * review / done / failed). 接 kanban-orchestrator (D-31.1.4) 喂数据.
 * 业务逻辑 0 重写: 单纯 UI 渲染, 数据由 coding-agent KanbanOrchestrator 喂.
 */

import { Box, Text } from 'ink'
import type { ReactElement } from 'react'

export type SubagentLane = 'todo' | 'in_progress' | 'review' | 'done' | 'failed'

export interface SubagentCard {
  id: string
  title: string
  lane: SubagentLane
}

export interface SubagentIndicatorProps {
  cards: ReadonlyArray<SubagentCard>
}

const STATUS_ICON: Record<SubagentLane, string> = {
  todo: '○',
  in_progress: '▶',
  review: '◐',
  done: '✓',
  failed: '✗',
}

const STATUS_COLOR: Record<SubagentLane, 'gray' | 'yellow' | 'cyan' | 'green' | 'red'> = {
  todo: 'gray',
  in_progress: 'yellow',
  review: 'cyan',
  done: 'green',
  failed: 'red',
}

export function SubagentIndicator({ cards }: SubagentIndicatorProps): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color="cyan">Subagents</Text>
      {cards.length === 0 && <Text dimColor>(no subagents running)</Text>}
      {cards.map((c) => (
        <Text key={c.id}>
          <Text color={STATUS_COLOR[c.lane]}>{STATUS_ICON[c.lane]} </Text>
          <Text>{c.title}</Text>
          <Text dimColor> [{c.lane}]</Text>
        </Text>
      ))}
    </Box>
  )
}
