/**
 * execute_code 工具 — Python/Node sandbox via spawn + 30s timeout (D-30.2.5, 2026-06-07).
 *
 * 走 Node 子进程 (subprocess + tmp file + 30s timeout), 不接 D-12 docker 避免依赖重.
 * Sprint 2 升级到 docker sandbox.
 * - language: 'python' (走 python3) | 'javascript' (走 node)
 * - 30s timeout → SIGTERM kill
 * - 退出码 0 = success, 非 0 = failure
 * - risk: medium (执行任意 code, 跟 bash 同档)
 */

import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';
import type { ToolCapability } from '../governance/tool-capabilities.js';

const TIMEOUT_MS = 30_000;

export class ExecuteCodeTool implements Tool {
  readonly name = 'execute_code' as ToolName;
  readonly description =
    'Execute code in a subprocess with 30s timeout. Supports Python (python3) and JavaScript (node). Medium risk (runs arbitrary code).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';
  readonly capabilities: readonly ToolCapability[] = ['code-execute'] as const;

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        description: 'Language to execute',
        enum: ['python', 'javascript'],
      },
      code: { type: 'string', description: 'Code to execute' },
    },
    required: ['language', 'code'],
  };

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const language = input['language'];
    const code = input['code'];

    if (language !== 'python' && language !== 'javascript') {
      return {
        success: false,
        content: '',
        error: 'invalid-input: language must be "python" or "javascript"',
      };
    }
    if (typeof code !== 'string') {
      return { success: false, content: '', error: 'invalid-input: code is required' };
    }

    const dir = await mkdtemp(join(tmpdir(), 'dw-exec-'));
    try {
      const ext = language === 'python' ? 'py' : 'js';
      const file = join(dir, `exec.${ext}`);
      await writeFile(file, code, 'utf8');
      const cmd = language === 'python' ? 'python3' : 'node';

      return await new Promise<ToolResult>((resolve) => {
        const child = spawn(cmd, [file], { cwd: dir });
        let stdout = '';
        let stderr = '';
        let killed = false;
        child.stdout.on('data', (d: Buffer) => {
          stdout += d.toString('utf8');
        });
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString('utf8');
        });
        const timer = setTimeout(() => {
          killed = true;
          child.kill('SIGTERM');
          resolve({
            success: false,
            content: '',
            error: `timeout (${TIMEOUT_MS / 1000}s)`,
            meta: { stdout, stderr, killed: true },
          });
        }, TIMEOUT_MS);
        child.on('error', (err) => {
          clearTimeout(timer);
          // ENOENT (python3 / node 不在 PATH)
          const e = err as Error & { code?: string };
          resolve({
            success: false,
            content: '',
            error:
              e.code === 'ENOENT'
                ? `executable-not-found: '${cmd}' is not in PATH`
                : `exec error: ${e.message}`,
            meta: { cmd },
          });
        });
        child.on('close', (code) => {
          if (killed) return; // 已被 timeout 分支 resolve
          clearTimeout(timer);
          if (code === 0) {
            resolve({
              success: true,
              content: stdout,
              meta: { stdout, language, cmd },
            });
          } else {
            resolve({
              success: false,
              content: `exit ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
              error: `exit ${code}`,
              meta: { exitCode: code, stdout, stderr, language, cmd },
            });
          }
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
