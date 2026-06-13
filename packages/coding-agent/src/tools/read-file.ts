/**
 * read_file 工具 — 读取本地文件
 *
 * Sprint 0.2 范围：单文件 + offset/limit
 * Sprint 1 扩展：行号 + 编码探测
 *
 * 沙箱：v1.0 本地直接读，Sprint 2 接入 Docker
 */

import { promises as fs } from 'node:fs';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import type { ToolCapability } from '../governance/tool-capabilities.js';

export class ReadFileTool implements Tool {
  readonly name = 'read_file' as ToolName;
  readonly description =
    'Read a local file. Returns file content with line numbers. Use offset/limit to read a slice.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';
  readonly capabilities: readonly ToolCapability[] = ['file-read'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file' },
      offset: { type: 'number', description: 'Starting line (0-indexed, default 0)' },
      limit: { type: 'number', description: 'Max lines to read (default: all)' },
    },
    required: ['path'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'];
    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }
    const offset = typeof input['offset'] === 'number' ? input['offset'] : 0;
    const limit = typeof input['limit'] === 'number' ? input['limit'] : Infinity;

    try {
      const text = await fs.readFile(path, 'utf8');
      const lines = text.split('\n');
      const slice = lines.slice(offset, offset + limit);
      const numbered = slice
        .map((l: string, i: number) => `${String(offset + i + 1).padStart(6, ' ')}\t${l}`)
        .join('\n');
      return {
        success: true,
        content: numbered,
        meta: { totalLines: lines.length, readLines: slice.length },
      };
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string };
      if (e.code === 'ENOENT') {
        return { success: false, content: '', error: `not-found: ${path}` };
      }
      return { success: false, content: '', error: `io-error: ${e.message}`, meta: { path } };
    }
  }
}
