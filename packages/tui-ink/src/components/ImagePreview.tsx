/**
 * @deepwhale/tui-ink — ImagePreview 组件 (D-31.3.9, 2026-06-08).
 *
 * 显示附件缩略图列表 (image / pdf), 链接到 ocr_and_documents 工具.
 * 业务逻辑 0 重写: 不读文件, 只接收 items 数组 + onOcr 回调 (传 path).
 *
 * 渲染规则:
 *   - 顶部 "Attachments" 标识
 *   - items 空时: "(no attachments)" empty 状态
 *   - 每条 item: kind icon + basename(path) + 人类可读 size
 *   - 底部 hint: press Enter to OCR / extract text
 */

import { Box, Text } from 'ink';
import type { FC } from 'react';

export type ImageKind = 'image' | 'pdf';

export interface ImagePreviewItem {
  path: string;
  sizeBytes: number;
  kind: ImageKind;
}

export interface ImagePreviewProps {
  items: ReadonlyArray<ImagePreviewItem>;
  onOcr: (path: string) => void;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(p: string): string {
  const m = p.match(/[^/\\]+$/);
  return m ? m[0] : p;
}

export const ImagePreview: FC<ImagePreviewProps> = ({ items, onOcr: _onOcr }) => (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text bold color="cyan">Attachments</Text>
    {items.length === 0 && <Text dimColor>(no attachments)</Text>}
    {items.map((it) => (
      <Text key={it.path}>
        <Text color={it.kind === 'pdf' ? 'yellow' : 'cyan'}>
          {it.kind === 'pdf' ? '[pdf]' : '[img]'} {basename(it.path)}
        </Text>
        <Text dimColor>  {fmtSize(it.sizeBytes)}</Text>
      </Text>
    ))}
    {items.length > 0 && (
      <Text dimColor>(press Enter on item to OCR / extract text)</Text>
    )}
  </Box>
);
