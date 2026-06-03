/**
 * grep 工具 — 文本搜索
 *
 * Sprint 0.2 范围：用 grep 命令（execFile，不走 shell）
 * Sprint 2+ 候选：ripgrep 子进程（oh-my-pi 借鉴）/ Rust napi
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

const execFileP = promisify(execFile);

export class GrepTool implements Tool {
  readonly name = 'grep' as ToolName;
  readonly description =
    'Search for a text pattern in files. Uses `grep` command via execFile (no shell injection). Supports include glob for file filtering.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex supported with regex=true)' },
      path: { type: 'string', description: 'Directory or file to search (default: cwd)' },
      include: { type: 'string', description: 'File glob filter, e.g. *.ts' },
      regex: { type: 'boolean', description: 'Treat pattern as extended regex (default: true)' },
      maxResults: { type: 'number', description: 'Cap number of matching lines (default: 100)' },
    },
    required: ['pattern'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = input['pattern'];
    const path = input['path'];
    const include = input['include'];
    const regex = input['regex'] !== false; // default true
    const maxResults = typeof input['maxResults'] === 'number' ? input['maxResults'] : 100;

    if (typeof pattern !== 'string' || pattern.length === 0) {
      return { success: false, content: '', error: 'invalid-input: pattern is required' };
    }

    const searchPath = typeof path === 'string' && path.length > 0 ? path : '.';
    const args: string[] = [
      '-r',
      '-n',
      '-I', // skip binary files
      ...(regex ? ['-E'] : ['-F']),
      '--',
      pattern,
      searchPath,
    ];
    if (typeof include === 'string') {
      args.push('--include', include);
    }

    try {
      const { stdout } = await execFileP('grep', args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
      });
      const lines = stdout.split('\n').filter(Boolean);
      const truncated = lines.length > maxResults;
      const content = truncated ? lines.slice(0, maxResults).join('\n') : stdout.trim();
      return {
        success: true,
        content: truncated ? `${content}\n\n[truncated to ${maxResults} of ${lines.length} matches]` : content,
        meta: { pattern, searchPath, matchCount: lines.length, truncated },
      };
    } catch (err) {
      // grep returns exit 1 when no matches found — that's not an error.
      // promisify(execFile) attaches { code, stdout, stderr, message } to the error.
      const e = err as Error & { code?: number | string; stdout?: string; stderr?: string };
      if (e.code === 1 || e.code === '1') {
        return {
          success: true,
          content: '',
          meta: { pattern, searchPath, matchCount: 0, truncated: false },
        };
      }
      return {
        success: false,
        content: '',
        error: `execution-failed: ${e.message}${e.stderr ? `\nstderr: ${e.stderr}` : ''}`,
        meta: { pattern, searchPath },
      };
    }
  }
}
