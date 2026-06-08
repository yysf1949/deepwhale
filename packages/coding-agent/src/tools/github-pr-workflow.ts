/**
 * github_pr_workflow 工具 — 走 `gh` CLI 4 action (D-31.1.1, 2026-06-08).
 *
 * 拍板: 不直接调 GitHub REST (避免 GH App auth), 走 system `gh` (走 user
 *   pre-authenticated credential). runner 注入 (默认 stub) → 单测 mock exec.
 * - createPR: 拼 `gh pr create --title ... --body ... --head ... --base ...`
 * - mergePR:  拼 `gh pr merge <n> --squash`
 * - closePR:  拼 `gh pr close <n>`
 * - listPRs:  拼 `gh pr list --json number,title,state,url`
 *
 * 输出 (success):  action=createPR/mergePR/closePR 返 { prNumber, prUrl? }
 *                  action=listPRs 返多行 "N. title (state) url"
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写远端 PR).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type GhRunner = (args: string[]) => Promise<string>;

const defaultRunner: GhRunner = async () => {
  throw new Error('gh-pr-workflow: no runner injected (test stub)');
};

export interface GhPrWorkflowOptions {
  runner?: GhRunner;
}

export class GitHubPrWorkflowTool implements Tool {
  readonly name = 'github_pr_workflow' as ToolName;
  readonly description =
    'Manage GitHub PRs via gh CLI: createPR / mergePR / closePR / listPRs. Medium risk (writes remote).';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['createPR', 'mergePR', 'closePR', 'listPRs'] },
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      head: { type: 'string' },
      base: { type: 'string' },
      prNumber: { type: 'number' },
    },
    required: ['action', 'owner', 'repo'],
  };

  private readonly runner: GhRunner;
  constructor(opts: GhPrWorkflowOptions = {}) {
    this.runner = opts.runner ?? defaultRunner;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const owner = input['owner'];
    const repo = input['repo'];
    if (typeof owner !== 'string' || typeof repo !== 'string') {
      return { success: false, content: '', error: 'invalid-input: owner/repo required' };
    }
    try {
      switch (action) {
        case 'createPR': {
          const title = input['title'], body = input['body'], head = input['head'], base = input['base'];
          if (typeof title !== 'string' || typeof body !== 'string' ||
              typeof head !== 'string' || typeof base !== 'string') {
            return { success: false, content: '', error: 'invalid-input: createPR needs title/body/head/base' };
          }
          const out = await this.runner(['pr', 'create', '--repo', `${owner}/${repo}`,
            '--title', title, '--body', body, '--head', head, '--base', base]);
          const m = out.match(/\/pull\/(\d+)/);
          return { success: true, content: out, meta: { prNumber: m ? Number(m[1]) : 0, prUrl: out.trim() } };
        }
        case 'mergePR': {
          const n = input['prNumber'];
          if (typeof n !== 'number') return { success: false, content: '', error: 'invalid-input: prNumber required' };
          const out = await this.runner(['pr', 'merge', String(n), '--squash', '--repo', `${owner}/${repo}`]);
          return { success: true, content: out, meta: { prNumber: n } };
        }
        case 'closePR': {
          const n = input['prNumber'];
          if (typeof n !== 'number') return { success: false, content: '', error: 'invalid-input: prNumber required' };
          const out = await this.runner(['pr', 'close', String(n), '--repo', `${owner}/${repo}`]);
          return { success: true, content: out, meta: { prNumber: n } };
        }
        case 'listPRs': {
          const out = await this.runner(['pr', 'list', '--json', 'number,title,state,url', '--repo', `${owner}/${repo}`]);
          return { success: true, content: out };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `gh error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const githubPrWorkflow = new GitHubPrWorkflowTool();
