/**
 * search_files 工具 — ripgrep 文本搜索 (D-30.2.4, 2026-06-07).
 *
 * 跟 find / grep (Node 实现) 并行, 走 ripgrep 子进程.
 * - 性能更优, 大仓库仍可用
 * - 跨平台走 rg.exe (Windows) / rg (Unix), execFileSync 自动 spawn
 * - 缺 rg → graceful 报错, 不 panic
 * - risk: low (只读)
 */

import { execFileSync } from 'node:child_process';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export class SearchFilesTool implements Tool {
  readonly name = 'search_files' as ToolName;
  readonly description =
    'Search file contents using ripgrep (rg). Faster than grep on large repos. Supports glob filter. Read-only.';
  readonly risk: 'low' | 'medium' | 'high' = 'low';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex supported)' },
      path: { type: 'string', description: 'Search root (file or directory)' },
      glob: { type: 'string', description: 'File glob filter (e.g. *.ts)' },
    },
    required: ['pattern', 'path'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const pattern = input['pattern'];
    const path = input['path'];
    const glob = input['glob'];

    if (typeof pattern !== 'string' || pattern.length === 0) {
      return { success: false, content: '', error: 'invalid-input: pattern is required' };
    }
    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }

    const args: string[] = [
      '--color=never',
      '-n',
      '--no-heading',
      pattern,
      path,
    ];
    if (typeof glob === 'string' && glob.length > 0) {
      args.push('--glob', glob);
    }

    try {
      const output = execFileSync('rg', args, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return {
        success: true,
        content: output || '(no matches)',
        meta: { pattern, path, glob: glob ?? null, matchCount: output ? output.split('\n').filter(Boolean).length : 0 },
      };
    } catch (err) {
      const e = err as Error & {
        status?: number | null;
        stdout?: string | Buffer | undefined;
        stderr?: string | Buffer | undefined;
      };
      // ripgrep 用 exit 1 表示 "no matches found" — 不是错误
      if (e.status === 1) {
        return {
          success: true,
          content: '(no matches)',
          meta: { pattern, path, matchCount: 0 },
        };
      }
      const stderrText =
        typeof e.stderr === 'string'
          ? e.stderr
          : e.stderr instanceof Buffer
            ? e.stderr.toString('utf8')
            : '';
      // ENOENT (rg 不在 PATH) — graceful 报错
      if (
        stderrText.toLowerCase().includes('enoent') ||
        /not found|not recognized/i.test(stderrText)
      ) {
        return {
          success: false,
          content: '',
          error: 'ripgrep-not-found: install rg (https://github.com/BurntSushi/ripgrep)',
        };
      }
      return {
        success: false,
        content: '',
        error: `search error: ${e.message}${stderrText ? ` (${stderrText.trim()})` : ''}`,
        meta: { pattern, path, status: e.status ?? null },
      };
    }
  }
}
