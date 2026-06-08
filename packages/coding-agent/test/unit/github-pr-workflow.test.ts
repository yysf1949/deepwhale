import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubPrWorkflowTool } from '../../src/tools/github-pr-workflow.js';

describe('github_pr_workflow', () => {
  let tool: GitHubPrWorkflowTool;
  beforeEach(() => {
    tool = new GitHubPrWorkflowTool({ runner: async (cmd) => 'https://github.com/o/r/pull/42\n' });
  });

  it('createPR invokes gh pr create and parses prNumber', async () => {
    const r = await tool.execute({ action: 'createPR', owner: 'o', repo: 'r', title: 't', body: 'b', head: 'feat', base: 'main' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('42');
  });

  it('mergePR invokes gh pr merge', async () => {
    const r = await tool.execute({ action: 'mergePR', owner: 'o', repo: 'r', prNumber: 7 });
    expect(r.success).toBe(true);
  });

  it('listPRs parses result list', async () => {
    const r = await tool.execute({ action: 'listPRs', owner: 'o', repo: 'r' });
    expect(r.success).toBe(true);
  });

  it('returns error on runner failure', async () => {
    const failing = new GitHubPrWorkflowTool({ runner: async () => { throw new Error('gh not found'); } });
    const r = await failing.execute({ action: 'createPR', owner: 'o', repo: 'r', title: 't', body: 'b', head: 'h', base: 'main' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('gh not found');
  });

  it('rejects unknown action', async () => {
    const r = await tool.execute({ action: 'wat' as any, owner: 'o', repo: 'r' });
    expect(r.success).toBe(false);
  });
});
