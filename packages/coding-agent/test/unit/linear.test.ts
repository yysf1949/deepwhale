import { describe, it, expect, beforeEach } from 'vitest';
import { LinearTool } from '../../src/tools/linear.js';

const mockIssue = JSON.stringify({
  data: { issue: { id: 'i1', title: 'Ship D-31.3', state: { name: 'In Progress' } } },
});
const mockList = JSON.stringify({
  data: { issues: { nodes: [{ id: 'i1', title: 'Ship D-31.3', state: { name: 'Todo' } }] } },
});

describe('linear', () => {
  let tool: LinearTool;
  beforeEach(() => {
    tool = new LinearTool({ fetcher: async (_url, opts) => {
      if (opts?.body?.includes('issuesList')) return mockList;
      if (opts?.body?.includes('issueCreate')) return mockIssue;
      if (opts?.body?.includes('issueUpdate')) return mockIssue;
      if (opts?.body?.includes('commentCreate')) return mockIssue;
      return '{}';
    }});
  });

  it('listIssues returns issue list', async () => {
    const r = await tool.execute({ action: 'listIssues', teamId: 'T1' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('Ship D-31.3');
  });

  it('createIssue returns new issue id', async () => {
    const r = await tool.execute({ action: 'createIssue', teamId: 'T1', title: 'new' });
    expect(r.success).toBe(true);
  });

  it('updateIssue changes state', async () => {
    const r = await tool.execute({ action: 'updateIssue', issueId: 'i1', state: 'done' });
    expect(r.success).toBe(true);
  });

  it('addComment posts comment', async () => {
    const r = await tool.execute({ action: 'addComment', issueId: 'i1', body: 'hi' });
    expect(r.success).toBe(true);
  });

  it('rejects missing teamId on create', async () => {
    const r = await tool.execute({ action: 'createIssue', title: 'x' });
    expect(r.success).toBe(false);
  });
});
