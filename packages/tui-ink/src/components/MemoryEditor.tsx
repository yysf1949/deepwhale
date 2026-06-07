/**
 * @deepwhale/tui-ink — MemoryEditor 组件 (D-30.5.2, 2026-06-08).
 *
 * 渲染 MEMORY.md 编辑视图, 纯 UI 壳 — 内容由 coding-agent MemoryStore 喂.
 * 业务逻辑 0 重写: 不读不写文件, 只接收 content 字符串 + onSave 回调.
 *
 * 渲染规则:
 *   - 顶部 "MEMORY.md" 标识
 *   - 正文 content 原文显示
 *   - 底部 hint: Ctrl+S save / Esc cancel
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export interface MemoryEditorProps {
  content: string;
  onSave: (next: string) => void;
  onCancel?: () => void;
}

export const MemoryEditor: FC<MemoryEditorProps> = ({ content }) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold color="cyan">MEMORY.md</Text>
    <Text>{content}</Text>
    <Text dimColor>(press Ctrl+S to save · Esc to cancel)</Text>
  </Box>
);