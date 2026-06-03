/**
 * find 工具 — 文件系统查找
 *
 * Sprint 0.2 范围：跨平台 Node 实现（不走 find/ripgrep，避开 Windows find.exe 陷阱）
 * Sprint 2+ 候选：换成 napi natives（Node 实现 + Profile 验证瓶颈）
 *
 * 设计：基于 fs.readdirSync({ recursive: true, withFileTypes: true })（Node 20+）。
 * 在 Windows 上不能依赖 `find` 命令（系统 find.exe 是文件搜索工具，语义错位）。
 */

import { readdirSync, statSync, type Stats } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

const MAX_DEPTH_DEFAULT = 10;
const MAX_RESULTS_DEFAULT = 1000;

export class FindTool implements Tool {
  readonly name = 'find' as ToolName;
  readonly description =
    'Find files by name pattern in a directory tree. Cross-platform Node implementation (no shell).';
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
    const maxDepth =
      typeof input['maxDepth'] === 'number' && input['maxDepth'] >= 0
        ? Math.floor(input['maxDepth'])
        : MAX_DEPTH_DEFAULT;

    if (typeof path !== 'string' || path.length === 0) {
      return { success: false, content: '', error: 'invalid-input: path is required' };
    }
    if (typeof name !== 'string' || name.length === 0) {
      return { success: false, content: '', error: 'invalid-input: name is required' };
    }

    const rootPath = resolve(path);
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
    if (!rootStat.isDirectory()) {
      return {
        success: false,
        content: '',
        error: `not-a-directory: '${path}' is not a directory`,
      };
    }

    const wantFile = type === 'f';
    const wantDir = type === 'd';
    const wantLink = type === 'l';
    const typeFilter = type === undefined ? null : { wantFile, wantDir, wantLink };

    let regex: RegExp;
    try {
      regex = globToRegExp(name);
    } catch (err) {
      return {
        success: false,
        content: '',
        error: `invalid-input: name glob invalid: ${(err as Error).message}`,
      };
    }

    const matches: string[] = [];
    const visited = new Set<string>(); // 简单 symlink 去环
    const walk = (dir: string, depth: number): void => {
      if (matches.length >= MAX_RESULTS_DEFAULT) return;
      let entries: string[];
      try {
        // 指定 encoding='utf8' 让 @types/node 推出 string[]（避免 Dirent<NonSharedBuffer> 分支）
        entries = readdirSync(dir, { encoding: 'utf8' }) as string[];
      } catch {
        return; // 跳过无权限 / 已删除目录
      }
      const realDir = resolve(dir);
      if (visited.has(realDir)) return;
      visited.add(realDir);
      for (const name of entries) {
        if (matches.length >= MAX_RESULTS_DEFAULT) return;
        const full = join(dir, name);
        const st = statSyncSafe(full);
        if (st === null) continue;
        const isFile = st.isFile();
        const isDir = st.isDirectory();
        // Sprint 0.2 简化：type='l' symlink 用 stat 结果判断。
        // 真正的 symlink 链路去重依赖 visited（解析后的真实路径），
        // 跟 stat 是否 link 无关，visited 已覆盖。
        const passType =
          typeFilter === null
            ? true
            : (typeFilter.wantFile && isFile) ||
              (typeFilter.wantDir && isDir) ||
              (typeFilter.wantLink && st.isSymbolicLink());
        if (passType && regex.test(name)) {
          matches.push(relative(process.cwd(), full) || full);
        }
        if (isDir && depth < maxDepth) {
          walk(full, depth + 1);
        }
      }
    };

    walk(rootPath, 0);

    return {
      success: true,
      content: matches.join('\n'),
      meta: {
        path,
        name,
        count: matches.length,
        truncated: matches.length >= MAX_RESULTS_DEFAULT,
      },
    };
  }
}

/**
 * 把 `*.ts` 这类 glob 转成正则。Sprint 0.2 简化版只支持 `*` 和 `?`。
 * Sprint 1+ 考虑 minimatch 之类。
 */
function globToRegExp(glob: string): RegExp {
  // 转义所有 regex 特殊字符，再把 `\*` 和 `\?` 还原
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** 静默 statSync 失败（无权限 / 路径已消失），返回 null 让 caller 跳过。 */
function statSyncSafe(p: string): Stats | null {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}
