/**
 * patch 工具 — 找/替换唯一字符串 (D-30.2.3, 2026-06-07).
 *
 * 跟 edit_file (hashline) 并行, 走纯 string find/replace.
 * - oldString 必须 unique 出现, 0 / >1 报错
 * - 一次只能 patch 1 处
 * - risk: medium (覆盖原文件不可恢复) — 跟 write_file 1:1
 */

import { promises as fs } from 'node:fs';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export class PatchTool implements Tool {
  readonly name = 'patch' as ToolName;
  readonly description =
    'Find and replace a unique string in a file. oldString must match exactly once. Medium risk (overwrites file).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the file' },
      oldString: { type: 'string', description: 'The string to find (must match exactly once)' },
      newString: { type: 'string', description: 'The replacement string' },
    },
    required: ['path', 'oldString', 'newString'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'];
    const oldString = input['oldString'];
    const newString = input['newString'];

    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }
    if (typeof oldString !== 'string') {
      return { success: false, content: '', error: 'invalid-input: oldString is required' };
    }
    if (typeof newString !== 'string') {
      return { success: false, content: '', error: 'invalid-input: newString is required' };
    }

    try {
      const content = await fs.readFile(path, 'utf8');
      const occurrences = content.split(oldString).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          content: '',
          error: 'invalid-input: oldString not found in file',
          meta: { path },
        };
      }
      if (occurrences > 1) {
        return {
          success: false,
          content: '',
          error: `invalid-input: oldString matches ${occurrences} times (must be unique)`,
          meta: { path, occurrences },
        };
      }
      const newContent = content.replace(oldString, newString);
      await fs.writeFile(path, newContent, 'utf8');
      return {
        success: true,
        content: 'patched',
        meta: { path, occurrences: 1, bytes: newContent.length },
      };
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'ENOENT') {
        return { success: false, content: '', error: `not-found: ${path}` };
      }
      return { success: false, content: '', error: `io-error: ${e.message}`, meta: { path } };
    }
  }
}
