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
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

const execFileP = promisify(execFile);

const ALLOWED_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'echo', 'pwd',
  'cp', 'mv', 'mkdir', 'rmdir', 'rm', 'touch', 'stat', 'file', 'tree',
  'node', 'pnpm', 'npm', 'npx', 'tsc', 'tsx', 'git',
]);

const DANGEROUS_PATTERNS: ReadonlyArray<RegExp> = [
  /rm\s+(-\w+\s+)*\//,                // rm ... /  (any -flags before /)
  /\bsudo\b/,                          // any sudo
  /curl\s+.*\|\s*sh\b/,                // curl | sh
  /curl\s+.*\|\s*bash\b/,              // curl | bash
  /wget\s+.*\|\s*sh\b/,                // wget | sh
  /chmod\s+\+s\b/,                     // SUID
  /\bmkfs\b/,                          // format disk
  /\bdd\s+if=/,                        // dd if=
  />\s*\/dev\/sd[a-z]/,                // write to disk
];

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
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(fullCommand)) {
        return {
          success: false,
          content: '',
          error: `permission-denied: dangerous pattern blocked: ${pattern.source}`,
        };
      }
    }

    try {
      const { stdout, stderr } = await execFileP(command, argList, {
        cwd: typeof cwd === 'string' ? cwd : process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: 60_000, // 60s
      });
      return {
        success: true,
        content: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
        meta: { command, args: argList, stderr: !!stderr },
      };
    } catch (err) {
      const e = err as Error & { code?: string; stderr?: string; stdout?: string } & { stderr?: string; stdout?: string };
      return {
        success: false,
        content: e.stdout ?? '',
        error: `execution-failed: ${e.message}${e.stderr ? `\nstderr: ${e.stderr}` : ''}`,
        meta: { command, exitCode: e.code },
      };
    }
  }
}
