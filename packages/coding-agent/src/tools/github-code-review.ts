/**
 * github_code_review 工具 — `gh pr review` 3 action (D-31.1.3, 2026-06-08).
 *
 * 拍板: 复装 D-30.5 `requesting-code-review` skill 输出 (BLOCK/NIT 列表) 透传到
 *   inline review comment. 走 `gh pr review` (review 整体) + `gh api` (inline 评论).
 * - addReviewComment: inline path/line/body
 * - submitReview: verdict ∈ {approve, request-changes, comment}
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写远端 review).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type GhRunner = (args: string[]) => Promise<string>;

const defaultRunner: GhRunner = async () => {
  throw new Error('gh-code-review: no runner injected');
};

export class GitHubCodeReviewTool implements Tool {
  readonly name = 'github_code_review' as ToolName;
  readonly description = 'Submit GitHub code reviews via gh CLI: addReviewComment / submitReview (approve | request-changes | comment). Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action: addReviewComment | submitReview', enum: ['addReviewComment', 'submitReview'] },
      owner: { type: 'string', description: 'Repo owner' },
      repo: { type: 'string', description: 'Repo name' },
      prNumber: { type: 'number', description: 'PR number' },
      path: { type: 'string', description: 'File path (addReviewComment)' },
      line: { type: 'number', description: 'Line number (addReviewComment)' },
      body: { type: 'string', description: 'Comment text' },
      verdict: { type: 'string', description: 'Verdict (submitReview)', enum: ['approve', 'request-changes', 'comment'] },
    },
    required: ['action', 'owner', 'repo', 'prNumber'],
  };

  private readonly runner: GhRunner;
  constructor(opts: { runner?: GhRunner } = {}) {
    this.runner = opts.runner ?? defaultRunner;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    const owner = input['owner'], repo = input['repo'];
    const prNumber = input['prNumber'];
    if (typeof owner !== 'string' || typeof repo !== 'string' || typeof prNumber !== 'number') {
      return { success: false, content: '', error: 'invalid-input: owner/repo/prNumber required' };
    }
    try {
      switch (action) {
        case 'addReviewComment': {
          const path = input['path'], line = input['line'], body = input['body'];
          if (typeof path !== 'string' || typeof line !== 'number' || typeof body !== 'string') {
            return { success: false, content: '', error: 'invalid-input: addReviewComment needs path/line/body' };
          }
          const out = await this.runner(['api', `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
            '-f', `path=${path}`, '-f', `line=${line}`, '-f', `body=${body}`]);
          return { success: true, content: out, meta: { prNumber, path, line } };
        }
        case 'submitReview': {
          const verdict = input['verdict'];
          if (typeof verdict !== 'string' || !['approve', 'request-changes', 'comment'].includes(verdict)) {
            return { success: false, content: '', error: 'invalid-input: verdict must be approve/request-changes/comment' };
          }
          const out = await this.runner(['pr', 'review', String(prNumber), '--repo', `${owner}/${repo}`, `--${verdict}`]);
          return { success: true, content: out, meta: { prNumber, verdict } };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `gh error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const githubCodeReview = new GitHubCodeReviewTool();
