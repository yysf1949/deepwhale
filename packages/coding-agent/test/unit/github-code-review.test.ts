import { describe, it, expect, beforeEach } from 'vitest';
import { GitHubCodeReviewTool } from '../../src/tools/github-code-review.js';

describe('github_code_review', () => {
  let tool: GitHubCodeReviewTool;
  beforeEach(() => {
    tool = new GitHubCodeReviewTool({ runner: async () => 'review submitted' });
  });

  it('addReviewComment posts inline comment', async () => {
    const r = await tool.execute({ action: 'addReviewComment', owner: 'o', repo: 'r', prNumber: 1, path: 'src/x.ts', line: 42, body: 'unsafe' });
    expect(r.success).toBe(true);
  });

  it('submitReview with verdict approve', async () => {
    const r = await tool.execute({ action: 'submitReview', owner: 'o', repo: 'r', prNumber: 1, verdict: 'approve' });
    expect(r.success).toBe(true);
  });

  it('submitReview with verdict request-changes', async () => {
    const r = await tool.execute({ action: 'submitReview', owner: 'o', repo: 'r', prNumber: 1, verdict: 'request-changes' });
    expect(r.success).toBe(true);
  });

  it('submitReview with verdict comment', async () => {
    const r = await tool.execute({ action: 'submitReview', owner: 'o', repo: 'r', prNumber: 1, verdict: 'comment' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown verdict', async () => {
    const r = await tool.execute({ action: 'submitReview', owner: 'o', repo: 'r', prNumber: 1, verdict: 'wat' });
    expect(r.success).toBe(false);
  });
});
