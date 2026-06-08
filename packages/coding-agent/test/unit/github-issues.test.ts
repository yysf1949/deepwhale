import { describe, it, expect, beforeEach } from 'vitest';
import { GitHubIssuesTool } from '../../src/tools/github-issues.js';

describe('github_issues', () => {
  let tool: GitHubIssuesTool;
  beforeEach(() => {
    tool = new GitHubIssuesTool({ runner: async (args) => {
      if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/o/r/issues/9\n';
      if (args[1] === 'list') return JSON.stringify([{ number: 9, title: 't', state: 'OPEN' }]);
      return '';
    }});
  });

  it('createIssue returns issue number', async () => {
    const r = await tool.execute({ action: 'createIssue', owner: 'o', repo: 'r', title: 't', body: 'b' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('9');
  });

  it('listIssues parses JSON', async () => {
    const r = await tool.execute({ action: 'listIssues', owner: 'o', repo: 'r' });
    expect(r.success).toBe(true);
  });

  it('closeIssue runs gh issue close', async () => {
    const r = await tool.execute({ action: 'closeIssue', owner: 'o', repo: 'r', issueNumber: 9 });
    expect(r.success).toBe(true);
  });

  it('comment runs gh issue comment', async () => {
    const r = await tool.execute({ action: 'comment', owner: 'o', repo: 'r', issueNumber: 9, body: 'hi' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown action', async () => {
    const r = await tool.execute({ action: 'wat', owner: 'o', repo: 'r' });
    expect(r.success).toBe(false);
  });
});
