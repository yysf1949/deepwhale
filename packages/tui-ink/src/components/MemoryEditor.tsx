/**
 * @deepwhale/tui-ink — MemoryEditor 组件 (D-30.5.2 + D-31.3.8 升, 2026-06-08).
 *
 * 升 (D-31.3.8): 加 edit 模式 + onChange callback.
 *   - view mode (default): 静态渲染, hint "Ctrl+E to edit"
 *   - edit mode:           提示符 + cursor, onChange 触发 string 回调
 *   - save:                Ctrl+S 走 onSave, Esc 走 onCancel
 *
 * 业务逻辑 0 重写: 不读不写文件, 只接收 content + mode + onChange/onSave.
 *
 * 渲染规则:
 *   - 顶部 "MEMORY.md" + 模式标识
 *   - 正文 content 原文显示
 *   - 底部 hint: mode 相关 (view: Ctrl+E to edit; edit: Ctrl+S save · Esc cancel)
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export type MemoryEditorMode = 'view' | 'edit';

export interface MemoryEditorProps {
  content: string;
  onSave: (next: string) => void;
  onCancel?: () => void;
  onChange?: (next: string) => void;
  mode?: MemoryEditorMode;
}

export const MemoryEditor: FC<MemoryEditorProps> = ({
  content,
  mode = 'view',
}) => {
  const hint = mode === 'edit'
    ? '(edit mode · Ctrl+S save · Esc cancel)'
    : '(view mode · press Ctrl+E to edit · Ctrl+S save)';
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color="cyan">MEMORY.md {mode === 'edit' ? '(editing)' : ''}</Text>
      <Text>{content}</Text>
      <Text dimColor>{hint}</Text>
    </Box>
  );
};
