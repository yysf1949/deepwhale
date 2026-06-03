/**
 * find 工具 — 文件系统查找
 *
 * Sprint 0.2 范围：跨平台 Node 实现（不走 find/ripgrep，避开 Windows find.exe 陷阱）
 * Sprint 2+ 候选：换成 napi natives（Node 实现 + Profile 验证瓶颈）
 *
 * 设计：基于 fs.lstatSync（不跟随 symlink）+ readdirSync。lstat 而非 stat 是关键：
 * - stat 跟随 symlink，type='l' 分支永远 false，且 visited 拿不到 realdir 去重
 * - lstat 给出 link 自身属性，type='l' 才能正确命中
 * - 递归不跟随 symlink 目录：避免 symlink 环路 + 减少越界
 */

import { lstatSync, readdirSync, realpathSync, type Stats } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import process from 'node:process';
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
      rootStat = lstatSync(rootPath);
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
    // visited 用 realpath 算：symlink 指向的目录必须按真实路径去重，
    // 否则 `dir -> /elsewhere/loop` 这类环会死循环 / 重复遍历。
    const visited = new Set<string>();
    const walk = (dir: string, depth: number): void => {
      if (matches.length >= MAX_RESULTS_DEFAULT) return;
      // realpath 会跟随 symlink,realpathSync 失败（ENOENT 等）就跳过
      let realDir: string;
      try {
        realDir = realpathSync(dir);
      } catch {
        return;
      }
      if (visited.has(realDir)) return;
      visited.add(realDir);
      let entries: string[];
      try {
        // 指定 encoding='utf8' 让 @types/node 推出 string[]（避免 Dirent<NonSharedBuffer> 分支）
        entries = readdirSync(dir, { encoding: 'utf8' }) as string[];
      } catch {
        return; // 跳过无权限 / 已删除目录
      }
      for (const name of entries) {
        if (matches.length >= MAX_RESULTS_DEFAULT) return;
        const full = join(dir, name);
        // lstatSync 不跟随 symlink — 这正是 type='l' 能正确命中的关键
        const st = lstatSyncSafe(full);
        if (st === null) continue;
        const isFile = st.isFile();
        const isDir = st.isDirectory();
        const isLink = st.isSymbolicLink();
        const passType =
          typeFilter === null
            ? true
            : (typeFilter.wantFile && isFile) ||
              (typeFilter.wantDir && isDir) ||
              (typeFilter.wantLink && isLink);
        if (passType && regex.test(name)) {
          matches.push(relative(process.cwd(), full) || full);
        }
        // 只递归真实目录（不跟随 symlink 目录），避开环路 + 越界
        if (isDir && !isLink && depth < maxDepth) {
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

/** 静默 lstatSync 失败（无权限 / 路径已消失），返回 null 让 caller 跳过。 */
function lstatSyncSafe(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}
