/**
 * @deepwhale/tui-ink — PlanView 组件 (D-30.2.7, 2026-06-07).
 *
 * 渲染 $plan 数组 (跟 coding-agent PlanStore 1:1 同步).
 * 业务逻辑 0 重写: 单纯 UI 渲染, 数据由 coding-agent PlanStore 喂.
 *
 * 渲染规则:
 *   - active=false 且无 steps → 不渲染 (空白) — 跟 TodoList 不同, plan 默认隐藏
 *   - active=true → 头部 "Plan:" + step 列表 (1. xxx / 2. xxx)
 *   - step status: pending=prompt, in_progress=model, done=success
 */

import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'
import { $plan } from '../store/ui.js'
import { colorize, type TuiTheme, THEMES } from '../theme/index.js'
import type { ReactElement } from 'react'

export interface PlanViewProps {
  theme?: TuiTheme
}

const STATUS_ROLE = {
  pending: 'prompt',
  in_progress: 'model',
  done: 'success',
} as const

export function PlanView({ theme = THEMES.default }: PlanViewProps): ReactElement | null {
  const steps = useStore($plan)
  if (steps.length === 0) return null
  return (
    <Box flexDirection="column">
      <Text>{colorize('Plan:', 'header', theme)}</Text>
      {steps.map((step) => (
        <Text key={step.no}>
          {colorize(`${step.no}.`, 'divider', theme)}{' '}
          {colorize(step.text, STATUS_ROLE[step.status], theme)}
        </Text>
      ))}
    </Box>
  )
}
