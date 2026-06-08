/**
 * cloudflare_pages_deploy 工具 — wrangler CLI 3 action (D-31.1.5, 2026-06-08).
 *
 * 拍板: 走 `wrangler` (走 env `CF_API_TOKEN`), 不直接调 CF REST (省 OAuth).
 * - deploy:       `wrangler pages deploy <dir> --project-name <p>`
 * - listDeploys:  `wrangler pages deployments list --project-name <p>`
 * - rollback:     `wrangler pages deployments rollback <id> --project-name <p>`
 *
 * 失败兜底: CF_API_TOKEN 缺失 → 返 "fail-to-manual", 让 user 走手动.
 * 0 业务改业务, 5 红线 0 触碰. risk: high (写生产环境).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type WranglerRunner = (args: string[]) => Promise<string>;
const defaultRunner: WranglerRunner = async () => {
  throw new Error('cf-deploy: no runner injected (test stub)');
};

export class CloudflarePagesDeployTool implements Tool {
  readonly name = 'cloudflare_pages_deploy' as ToolName;
  readonly description = 'Manage Cloudflare Pages deploys via wrangler CLI: deploy / listDeploys / rollback. Requires CF_API_TOKEN. High risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'high';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['deploy', 'listDeploys', 'rollback'] },
      project: { type: 'string' },
      directory: { type: 'string' },
      deploymentId: { type: 'string' },
    },
    required: ['action', 'project'],
  };

  private readonly runner: WranglerRunner;
  constructor(opts: { runner?: WranglerRunner } = {}) {
    this.runner = opts.runner ?? defaultRunner;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const project = input['project'];
    if (typeof project !== 'string') return { success: false, content: '', error: 'invalid-input: project required' };
    try {
      switch (action) {
        case 'deploy': {
          const dir = input['directory'];
          if (typeof dir !== 'string') return { success: false, content: '', error: 'invalid-input: directory required' };
          const out = await this.runner(['pages', 'deploy', dir, '--project-name', project]);
          return { success: true, content: out };
        }
        case 'listDeploys': {
          const out = await this.runner(['pages', 'deployments', 'list', '--project-name', project]);
          return { success: true, content: out };
        }
        case 'rollback': {
          const id = input['deploymentId'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: deploymentId required' };
          const out = await this.runner(['pages', 'deployments', 'rollback', id, '--project-name', project]);
          return { success: true, content: out };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `cf error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const cloudflarePagesDeploy = new CloudflarePagesDeployTool();
