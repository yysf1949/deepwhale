/**
 * find 工具 — 文件系统查找
 *
 * Sprint 0.2 范围：用 find 命令（execFile，不走 shell）
 * Sprint 2+ 候选：换成 napi natives（Node 实现 + Profile 验证瓶颈）
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

const execFileP = promisify(execFile);

export class FindTool implements Tool {
  readonly name = 'find' as ToolName;
  readonly description =
    'Find files by name pattern in a directory tree. Uses `find` command via execFile (no shell injection).';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory to search (default: cwd)' },
      name: { type: 'string', description: 'Filename pattern (glob, e.g. *.ts)' },
      type: {
        type: 'string',
        description: 'File type filter',
        enum: ['f', 'd', 'l'],
      },
      maxDepth: { type: 'number', description: 'Max depth (default: 10)' },
    },
    required: ['path', 'name'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const path = input['path'];
    const name = input['name'];
    const type = input['type'];
    const maxDepth = input['maxDepth'];

    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }
    if (typeof name !== 'string' || name.length === 0) {
      return { success: false, content: '', error: 'invalid-input: name is required' };
    }

    const args: string[] = [path];
    if (typeof maxDepth === 'number') {
      args.push('-maxdepth', String(maxDepth));
    }
    if (typeof type === 'string' && ['f', 'd', 'l'].includes(type)) {
      args.push('-type', type);
    }
    args.push('-name', name);

    try {
      const { stdout } = await execFileP('find', args, { maxBuffer: 5 * 1024 * 1024 });
      return {
        success: true,
        content: stdout.trim(),
        meta: { path, name, count: stdout.split('\n').filter(Boolean).length },
      };
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string } & { stderr?: string };
      return {
        success: false,
        content: '',
        error: `execution-failed: ${e.message}${e.stderr ? `\nstderr: ${e.stderr}` : ''}`,
        meta: { path, name },
      };
    }
  }
}
