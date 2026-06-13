/**
 * write_file 工具 — 写入本地文件
 *
 * Sprint 0.2 范围：直接覆盖（不追加）
 * Sprint 1 扩展：append 模式 + 原子写（write to tmp + rename）
 *
 * 风险：medium（覆盖原文件不可恢复）— v1.0 必须经用户确认（arch §2.2 决策）
 */

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export class WriteFileTool implements Tool {
  readonly name = 'write_file' as ToolName;
  readonly description =
    'Write content to a local file. Overwrites existing file. Requires user confirmation (medium risk).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';
  readonly capabilities: readonly ToolCapability[] = ['file-read', 'file-write'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file' },
      content: { type: 'string', description: 'Full file content to write' },
    },
    required: ['path', 'content'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'];
    const content = input['content'];
    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }
    if (typeof content !== 'string') {
      return { success: false, content: '', error: 'invalid-input: content must be string' };
    }

    try {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, content, 'utf8');
      return {
        success: true,
        content: `Written ${content.length} bytes to ${path}`,
        meta: { path, bytes: content.length },
      };
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string };
      return { success: false, content: '', error: `io-error: ${e.message}`, meta: { path } };
    }
  }
}
