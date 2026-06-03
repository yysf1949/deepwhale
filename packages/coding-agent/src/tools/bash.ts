/**
 * bash 工具 — 在白名单内执行 shell 命令
 *
 * Sprint 0.2 范围：本地直接 exec（**沙箱挪 Sprint 2**）
 * Sprint 0.2 简化版安全措施：
 * - 命令白名单（v1.0 = ls/cat/grep/find/echo/pwd/cd/head/tail/wc/cp/mv/mkdir/rm）
 * - 危险 token 黑名单（rm -rf /、sudo、curl、wget）
 *
 * Sprint 1+ 增强：Docker sandbox 统一（arch §2.3 ROADMAP 红线）
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve as pathResolve, sep as pathSep } from 'node:path';
import process from 'node:process';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

const execFileP = promisify(execFile);

const ALLOWED_COMMANDS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'find',
  'echo',
  'pwd',
  'cp',
  'mv',
  'mkdir',
  'rmdir',
  'rm',
  'touch',
  'stat',
  'file',
  'tree',
  'node',
  'pnpm',
  'npm',
  'npx',
  'tsc',
  'tsx',
  'git',
]);

/**
 * 危险模式黑名单。Sprint 0.2 简化版只挡"立即破坏"模式。
 * Sprint 1+ 会接 sandbox 红线（arch §2.3），这里只防"最常见误操作"。
 *
 * 设计原则：
 * - 只对**字符串**匹配，不在 shell 上下文解释（避免误判/被绕过）
 * - 同时检测 `command` 和 `args` 拼成的完整命令
 * - 危险模式必须**能拒掉真实攻击**，否则不如不加
 */
const DANGEROUS_PATTERNS: ReadonlyArray<{ re: RegExp; reason: string }> = [
  // rm 任何 -r/-R/-f 组合 + 路径（不限 /），覆盖 `rm -rf .`、`rm -rf ~`、`rm -rf *`
  { re: /\brm\s+(-\w+\s+)*\S/, reason: 'rm with flags requires sandbox (Sprint 1)' },
  // sudo / su 提权
  { re: /\bsudo\b/, reason: 'sudo blocked' },
  { re: /\bsu\s+-?\s*\S/, reason: 'su blocked' },
  // 网络下载 + pipe 执行（curl|sh, wget|bash 等）
  { re: /\bcurl\b.*\|\s*(sh|bash|zsh|fish)\b/, reason: 'curl | shell blocked' },
  { re: /\bwget\b.*\|\s*(sh|bash|zsh|fish)\b/, reason: 'wget | shell blocked' },
  // 反引号 / $() 命令替换
  { re: /`[^`]*`/, reason: 'command substitution backticks blocked' },
  { re: /\$\([^)]*\)/, reason: 'command substitution $() blocked' },
  // SUID / 设备写 / 格式化
  { re: /\bchmod\s+\+s\b/, reason: 'SUID chmod blocked' },
  { re: /\bmkfs\b/, reason: 'mkfs blocked' },
  { re: /\bdd\s+if=/, reason: 'dd if= blocked' },
  { re: />\s*\/dev\/sd[a-z]/, reason: 'raw disk write blocked' },
  // shell 链接
  { re: /\bexec\s+sh\b/, reason: 'exec sh blocked' },
  // 删除 home / etc / 系统目录（额外保护）
  { re: /\brm\s+(-\w+\s+)*~(?:\s|$)/, reason: 'rm ~ blocked' },
  { re: /\brm\s+(-\w+\s+)*\/etc(?:\s|$)/, reason: 'rm /etc blocked' },
];

/** Sprint 0.2 sandbox 边界：cwd 必须落在此根目录之下。 */
const SANDBOX_ROOT = pathResolve(process.cwd());

export class BashTool implements Tool {
  readonly name = 'bash' as ToolName;
  readonly description =
    'Execute a whitelisted shell command. v1.0 command allowlist; dangerous patterns (rm -rf /, sudo, curl|sh) are blocked.';
  readonly risk: 'low' | 'medium' | 'high' = 'high';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command (must be in whitelist)' },
      args: {
        type: 'array',
        description: 'Command arguments (array of strings)',
        items: { type: 'string', description: 'arg' },
      },
      cwd: { type: 'string', description: 'Working directory (optional)' },
    },
    required: ['command'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const command = input['command'];
    const args = input['args'];
    const cwd = input['cwd'];

    if (typeof command !== 'string' || command.length === 0) {
      return { success: false, content: '', error: 'invalid-input: command is required' };
    }

    if (!ALLOWED_COMMANDS.has(command)) {
      return {
        success: false,
        content: '',
        error: `permission-denied: command '${command}' is not in allowlist. Allowed: ${Array.from(ALLOWED_COMMANDS).join(', ')}`,
      };
    }

    const argList = Array.isArray(args) ? (args as string[]) : [];
    const fullCommand = `${command} ${argList.join(' ')}`;
    for (const { re, reason } of DANGEROUS_PATTERNS) {
      if (re.test(fullCommand)) {
        return {
          success: false,
          content: '',
          error: `permission-denied: dangerous pattern blocked (${reason}): ${re.source}`,
        };
      }
    }

    // cwd 必须在 SANDBOX_ROOT 下（防止 `cd ../../..` 跳出）。Sprint 0.2 简化：
    // 不递归扫 argList（避免 shell 逃逸误判），只校验 `cwd` 字段本身。
    const requestedCwd = typeof cwd === 'string' ? cwd : process.cwd();
    const resolvedCwd = pathResolve(requestedCwd);
    const rootWithSep = SANDBOX_ROOT.endsWith(pathSep) ? SANDBOX_ROOT : SANDBOX_ROOT + pathSep;
    if (resolvedCwd !== SANDBOX_ROOT && !resolvedCwd.startsWith(rootWithSep)) {
      return {
        success: false,
        content: '',
        error: `permission-denied: cwd '${requestedCwd}' is outside sandbox root '${SANDBOX_ROOT}'`,
      };
    }

    try {
      const { stdout, stderr } = await execFileP(command, argList, {
        cwd: resolvedCwd,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 60_000, // 60s
      });
      return {
        success: true,
        content: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
        meta: { command, args: argList, stderr: !!stderr },
      };
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string } & {
        stderr?: string;
        stdout?: string;
      };
      return {
        success: false,
        content: e.stdout ?? '',
        error: `execution-failed: ${e.message}${e.stderr ? `\nstderr: ${e.stderr}` : ''}`,
        meta: { command, exitCode: e.code },
      };
    }
  }
}
