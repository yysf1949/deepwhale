/**
 * @deepwhale/tui-ink — CodeReviewCard 组件 (D-30.5.6, 2026-06-08).
 *
 * 渲染 code review verdict + issues 卡片.
 * 业务逻辑 0 重写: 数据由 coding-agent reviewChecklist() + reviewer LLM 喂.
 *
 * 渲染规则:
 *   - 头部 "Code Review — {verdict}" (block=red, approve=green)
 *   - 每个 issue: [severity] file:line — message
 *   - severity 颜色: block=red, nit=yellow, suggestion=gray
 *   - onAck() 回调 (UI 不直接触发, 由父组件接 input)
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export type ReviewSeverity = 'block' | 'nit' | 'suggestion';
export type ReviewVerdict = 'block' | 'approve' | 'comment';

export interface ReviewIssue {
  severity: ReviewSeverity;
  file: string;
  line: number;
  message: string;
}

export interface CodeReviewCardProps {
  verdict: ReviewVerdict;
  issues: ReadonlyArray<ReviewIssue>;
  onAck: () => void;
}

const severityColor = (s: ReviewSeverity): 'red' | 'yellow' | 'gray' =>
  s === 'block' ? 'red' : s === 'nit' ? 'yellow' : 'gray';

const verdictColor = (v: ReviewVerdict): 'red' | 'green' | 'yellow' =>
  v === 'block' ? 'red' : v === 'approve' ? 'green' : 'yellow';

export const CodeReviewCard: FC<CodeReviewCardProps> = ({ verdict, issues }) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold>
      Code Review — <Text color={verdictColor(verdict)}>{verdict}</Text>
    </Text>
    {issues.length === 0 && <Text dimColor>(no issues)</Text>}
    {issues.map((i, idx) => (
      <Text key={idx}>
        <Text color={severityColor(i.severity)}>[{i.severity}]</Text>{' '}
        {i.file}:{i.line} — {i.message}
      </Text>
    ))}
  </Box>
);