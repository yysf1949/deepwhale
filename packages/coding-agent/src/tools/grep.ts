/**
 * grep 工具 — 文本搜索
 *
 * Sprint 0.2 范围：跨平台 Node 实现（不走 GNU grep，避开 Windows 缺失问题）
 * Sprint 2+ 候选：ripgrep 子进程（oh-my-pi 借鉴）/ Rust napi
 *
 * 实现策略：基于 fs.readdirSync({ recursive: true }) + 行级正则匹配。
 * 比 GNU grep 慢，但 v1.0 单人本地够用，跨平台 0 依赖。
 */

import { readdirSync, readFileSync, statSync, type Stats } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

const MAX_RESULTS_DEFAULT = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB 文本上限（Sprint 0.2 简化：大文件直接跳过）

export class GrepTool implements Tool {
  readonly name = 'grep' as ToolName;
  readonly description =
    'Search for a text pattern in files. Cross-platform Node implementation (no shell). Supports include glob for file filtering.';
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
    const useRegex = input['regex'] !== false; // default true
    const maxResults =
      typeof input['maxResults'] === 'number' && input['maxResults'] > 0
        ? Math.floor(input['maxResults'])
        : MAX_RESULTS_DEFAULT;

    if (typeof pattern !== 'string' || pattern.length === 0) {
      return { success: false, content: '', error: 'invalid-input: pattern is required' };
    }

    const searchPath = typeof path === 'string' && path.length > 0 ? path : '.';
    const rootPath = resolve(searchPath);

    let re: RegExp;
    try {
      re = useRegex ? new RegExp(pattern) : escapeLiteralRegex(pattern);
    } catch (err) {
      return {
        success: false,
        content: '',
        error: `invalid-input: pattern is not a valid regex: ${(err as Error).message}`,
      };
    }
    const includeRe = typeof include === 'string' ? globToRegExp(include) : null;

    let rootStat;
    try {
      rootStat = statSync(rootPath);
    } catch (err) {
      const e = err as Error & { code?: string };
      return {
        success: false,
        content: '',
        error: `not-found: ${e.message} (${e.code ?? 'UNKNOWN'})`,
      };
    }

    const matches: string[] = [];
    const filesToScan: string[] = [];

    if (rootStat.isFile()) {
      filesToScan.push(rootPath);
    } else if (rootStat.isDirectory()) {
      collectFiles(rootPath, filesToScan, includeRe, 0, 10);
    } else {
      return {
        success: false,
        content: '',
        error: `not-searchable: '${searchPath}' is not a file or directory`,
      };
    }

    for (const file of filesToScan) {
      if (matches.length >= maxResults) break;
      let text: string;
      try {
        const st = statSync(file);
        if (st.size > MAX_FILE_BYTES) continue; // 跳过超大文件
        text = readFileSync(file, 'utf8');
      } catch {
        continue; // 二进制 / 无权限 / race condition
      }
      // 检测 BOM。split 用 /\r?\n/：文件原文用什么换行就按什么切，
      // 避免在 Windows 上 EOL='\r\n' 时把 LF 文件整段当一行（用户报告 P2-1）。
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (re.test(line)) {
          matches.push(`${relative(process.cwd(), file) || file}:${i + 1}:${line}`);
          if (matches.length >= maxResults) break;
        }
      }
    }

    const truncated = matches.length >= maxResults;
    const content = truncated
      ? matches.join('\n') + `\n\n[truncated to ${maxResults} matches]`
      : matches.join('\n');

    return {
      success: true,
      content,
      meta: {
        pattern,
        searchPath,
        matchCount: matches.length,
        truncated,
        filesScanned: filesToScan.length,
      },
    };
  }
}

function collectFiles(
  dir: string,
  out: string[],
  includeRe: RegExp | null,
  depth: number,
  maxDepth: number,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir, { encoding: 'utf8' }) as string[];
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSyncSafe(full);
    if (st === null) continue;
    if (st.isFile()) {
      if (includeRe === null || includeRe.test(name)) {
        out.push(full);
      }
    } else if (st.isDirectory() && depth < maxDepth) {
      // 跳过常见噪声目录
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
      collectFiles(full, out, includeRe, depth + 1, maxDepth);
    }
  }
}

/** 静默 statSync 失败（无权限 / 路径已消失），返回 null 让 caller 跳过。 */
function statSyncSafe(p: string): Stats | null {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

function escapeLiteralRegex(s: string): RegExp {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}
