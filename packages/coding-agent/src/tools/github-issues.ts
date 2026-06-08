/**
 * github_issues 工具 — 走 `gh` CLI 4 action (D-31.1.2, 2026-06-08).
 *
 * 跟 github_pr_workflow 1:1 协议 (runner 注入 + 同样 4-action 形态).
 * action: createIssue / listIssues / closeIssue / comment.
 * 0 业务改业务, 5 红线 0 触碰. risk: medium.
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type GhRunner = (args: string[]) => Promise<string>;

const defaultRunner: GhRunner = async () => {
  throw new Error('gh-issues: no runner injected');
};

export class GitHubIssuesTool implements Tool {
  readonly name = 'github_issues' as ToolName;
  readonly description = 'Manage GitHub issues via gh CLI: createIssue / listIssues / closeIssue / comment. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['createIssue', 'listIssues', 'closeIssue', 'comment'] },
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      issueNumber: { type: 'number' },
      state: { type: 'string', enum: ['OPEN', 'CLOSED', 'ALL'] },
    },
    required: ['action', 'owner', 'repo'],
  };

  private readonly runner: GhRunner;
  constructor(opts: { runner?: GhRunner } = {}) {
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
        case 'createIssue': {
          const title = input['title'], body = input['body'];
          if (typeof title !== 'string' || typeof body !== 'string') {
            return { success: false, content: '', error: 'invalid-input: createIssue needs title/body' };
          }
          const out = await this.runner(['issue', 'create', '--repo', `${owner}/${repo}`, '--title', title, '--body', body]);
          const m = out.match(/\/issues\/(\d+)/);
          return { success: true, content: out, meta: { issueNumber: m ? Number(m[1]) : 0 } };
        }
        case 'listIssues': {
          const state = (input['state'] as string) ?? 'OPEN';
          const out = await this.runner(['issue', 'list', '--repo', `${owner}/${repo}`, '--state', state, '--json', 'number,title,state,url']);
          return { success: true, content: out };
        }
        case 'closeIssue': {
          const n = input['issueNumber'];
          if (typeof n !== 'number') return { success: false, content: '', error: 'invalid-input: issueNumber required' };
          const out = await this.runner(['issue', 'close', String(n), '--repo', `${owner}/${repo}`]);
          return { success: true, content: out, meta: { issueNumber: n } };
        }
        case 'comment': {
          const n = input['issueNumber'], body = input['body'];
          if (typeof n !== 'number' || typeof body !== 'string') {
            return { success: false, content: '', error: 'invalid-input: comment needs issueNumber/body' };
          }
          const out = await this.runner(['issue', 'comment', String(n), '--repo', `${owner}/${repo}`, '--body', body]);
          return { success: true, content: out, meta: { issueNumber: n } };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `gh error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const githubIssues = new GitHubIssuesTool();
